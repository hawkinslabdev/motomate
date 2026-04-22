import { fail } from '@sveltejs/kit';
import { eq, and } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';
import {
	getWorkflowRulesByUser,
	toggleWorkflowRule,
	deleteWorkflowRule,
	seedPresetRulesForUser,
	updateWorkflowRuleTrigger
} from '$lib/db/repositories/workflow.js';
import { getVehiclesByUser } from '$lib/db/repositories/vehicles.js';
import { recomputeTrackerStatuses } from '$lib/db/repositories/maintenance.js';
import { RuleTriggerSchema } from '$lib/validators/schemas.js';
import type { RuleTrigger } from '$lib/db/schema.js';
import { db } from '$lib/db/index.js';
import { documents } from '$lib/db/schema.js';
import {
	evaluateDateTrigger,
	evaluateMaintenanceTrigger,
	normalizeWorkflowTrigger
} from '$lib/workflow/triggers.js';

export type NextFireInfo =
	| { kind: 'ready' }
	| { kind: 'cooldown'; until: string }
	| { kind: 'waiting' }
	| { kind: 'measurement'; remaining: number; unit: string; trackerName: string }
	| { kind: 'date'; fireAt: string; trackerName?: string }
	| { kind: 'none' };

function toUtcDate(sqliteStr: string): Date {
	const iso = sqliteStr.includes('T') ? sqliteStr : sqliteStr.replace(' ', 'T');
	return new Date(iso.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(iso) ? iso : iso + 'Z');
}

function cooldownInfo(lastTriggeredAt: string, now: number): NextFireInfo | null {
	const fired = toUtcDate(lastTriggeredAt).getTime();
	const cooldownEnd = fired + 23 * 3600000;
	if (now < cooldownEnd) return { kind: 'cooldown', until: new Date(cooldownEnd).toISOString() };
	return null;
}

function nextCalendarOccurrence(month: number, day: number): Date {
	const now = new Date();
	const year = now.getFullYear();
	const candidate = new Date(year, month - 1, day);
	if (candidate <= now) candidate.setFullYear(year + 1);
	return candidate;
}

async function computeNextFireInfo(
	rule: {
		id: string;
		vehicle_id: string | null;
		trigger: RuleTrigger;
		last_triggered_at: string | null;
	},
	vehicles: Awaited<ReturnType<typeof getVehiclesByUser>>,
	trackersByVehicle: Map<string, Awaited<ReturnType<typeof recomputeTrackerStatuses>>>
): Promise<NextFireInfo> {
	const normalizedTrigger = normalizeWorkflowTrigger(rule.trigger);
	const now = Date.now();

	const scopedVehicles = rule.vehicle_id
		? vehicles.filter((v) => v.id === rule.vehicle_id)
		: vehicles;

	if (scopedVehicles.length === 0) return { kind: 'none' };

	switch (normalizedTrigger.kind) {
		case 'maintenance':
		case 'date': {
			let bestMeasurementRemaining = Infinity;
			let bestMeasurementUnit = 'km';
			let bestMeasurementTrackerName = '';
			let bestDateFireAt = '';
			let bestDateTrackerName = '';
			let hasReady = false;
			let allWaiting = true;
			let hasAnyTracker = false;

			for (const vehicle of scopedVehicles) {
				const trackers = trackersByVehicle.get(vehicle.id) ?? [];

				for (const tracker of trackers) {
					hasAnyTracker = true;
					const notifiedBy = ((tracker.state as Record<string, unknown>)?.notified_by ??
						{}) as Record<string, string>;
					const alreadyFired = Object.keys(notifiedBy).length > 0;

					if (!alreadyFired) allWaiting = false;
					if (alreadyFired) continue;

					const trackerName = tracker.template?.name ?? '';

					if (normalizedTrigger.kind === 'maintenance') {
						const evaluation = evaluateMaintenanceTrigger(
							normalizedTrigger,
							vehicle,
							tracker,
							tracker.template
						);
						if (!evaluation) continue;

						if (evaluation.readyAtCurrentMeasurement) {
							hasReady = true;
						} else if (evaluation.measurementUntilFire < bestMeasurementRemaining) {
							bestMeasurementRemaining = evaluation.measurementUntilFire;
							bestMeasurementUnit = evaluation.measurement.unit;
							bestMeasurementTrackerName = trackerName;
						}
					} else {
						if (tracker.next_due_at === null) continue;
						const evaluation = evaluateDateTrigger(normalizedTrigger, tracker.next_due_at);

						if (evaluation.matches) {
							hasReady = true;
						} else {
							if (!bestDateFireAt || evaluation.fireAt < bestDateFireAt) {
								bestDateFireAt = evaluation.fireAt;
								bestDateTrackerName = trackerName;
							}
						}
					}
				}
			}

			if (!hasAnyTracker) return { kind: 'none' };
			if (hasReady) return { kind: 'ready' };
			if (allWaiting) return { kind: 'waiting' };

			if (normalizedTrigger.kind === 'maintenance') {
				if (bestMeasurementRemaining < Infinity)
					return {
						kind: 'measurement',
						remaining: bestMeasurementRemaining,
						unit: bestMeasurementUnit,
						trackerName: bestMeasurementTrackerName
					};
				return { kind: 'waiting' };
			} else {
				if (bestDateFireAt)
					return { kind: 'date', fireAt: bestDateFireAt, trackerName: bestDateTrackerName };
				return { kind: 'waiting' };
			}
		}

		case 'no_odometer_update': {
			let soonestFire: Date | null = null;
			for (const vehicle of scopedVehicles) {
				const lastUpdated = toUtcDate(vehicle.updated_at ?? vehicle.created_at);
				const fireTime = new Date(lastUpdated.getTime() + normalizedTrigger.days * 86400000);
				if (!soonestFire || fireTime < soonestFire) soonestFire = fireTime;
			}
			if (!soonestFire) return { kind: 'none' };
			if (soonestFire.getTime() <= now) {
				if (rule.last_triggered_at) {
					const cd = cooldownInfo(rule.last_triggered_at, now);
					if (cd) return cd;
				}
				return { kind: 'ready' };
			}
			return { kind: 'date', fireAt: soonestFire.toISOString() };
		}

		case 'calendar_date': {
			const next = nextCalendarOccurrence(normalizedTrigger.month, normalizedTrigger.day);
			const today = new Date();
			const isToday =
				next.getMonth() + 1 === normalizedTrigger.month &&
				next.getDate() === normalizedTrigger.day &&
				next.getFullYear() === today.getFullYear();

			if (isToday) {
				if (rule.last_triggered_at) {
					const cd = cooldownInfo(rule.last_triggered_at, now);
					if (cd) return cd;
				}
				return { kind: 'ready' };
			}
			return { kind: 'date', fireAt: next.toISOString() };
		}

		case 'document_expiring': {
			let soonestFire: Date | null = null;
			for (const vehicle of scopedVehicles) {
				const docs = await db.query.documents.findMany({
					where: and(eq(documents.vehicle_id, vehicle.id))
				});
				for (const doc of docs) {
					if (!doc.expires_at) continue;
					const fireTime = new Date(
						new Date(doc.expires_at).getTime() - normalizedTrigger.daysBefore * 86400000
					);
					if (!soonestFire || fireTime < soonestFire) soonestFire = fireTime;
				}
			}
			if (!soonestFire) return { kind: 'none' };
			if (soonestFire.getTime() <= now) {
				if (rule.last_triggered_at) {
					const cd = cooldownInfo(rule.last_triggered_at, now);
					if (cd) return cd;
				}
				return { kind: 'ready' };
			}
			return { kind: 'date', fireAt: soonestFire.toISOString() };
		}

		default:
			return { kind: 'none' };
	}
}

export const load: PageServerLoad = async ({ locals }) => {
	const userId = locals.user!.id;

	const [rules, userVehicles] = await Promise.all([
		getWorkflowRulesByUser(userId),
		getVehiclesByUser(userId)
	]);

	// Fresh tracker statuses for nextFire computation
	const trackersByVehicle = new Map<string, Awaited<ReturnType<typeof recomputeTrackerStatuses>>>();
	for (const vehicle of userVehicles) {
		trackersByVehicle.set(
			vehicle.id,
			await recomputeTrackerStatuses(vehicle.id, vehicle.current_odometer)
		);
	}

	const rulesWithNextFire = await Promise.all(
		rules.map(async (rule) => ({
			...rule,
			nextFire: await computeNextFireInfo(rule, userVehicles, trackersByVehicle)
		}))
	);

	return { rules: rulesWithNextFire };
};

export const actions: Actions = {
	toggle: async ({ request, locals }) => {
		const data = await request.formData();
		const id = String(data.get('id'));
		const enabled = data.get('enabled') === 'true';
		await toggleWorkflowRule(id, locals.user!.id, enabled);
		return { toggled: true };
	},
	delete: async ({ request, locals }) => {
		const data = await request.formData();
		const id = String(data.get('id'));
		await deleteWorkflowRule(id, locals.user!.id);
		return { deleted: true };
	},
	seedPresets: async ({ locals }) => {
		await seedPresetRulesForUser(locals.user!.id);
		return { seeded: true };
	},
	editTrigger: async ({ request, locals }) => {
		const data = await request.formData();
		const id = String(data.get('id') ?? '');
		const rawTrigger = String(data.get('trigger') ?? '');
		if (!id || !rawTrigger) return fail(400, { error: 'Missing fields' });

		let parsed;
		try {
			parsed = RuleTriggerSchema.parse(JSON.parse(rawTrigger));
		} catch {
			return fail(400, { error: 'Invalid trigger data' });
		}

		await updateWorkflowRuleTrigger(id, locals.user!.id, parsed);
		return { edited: true };
	}
};
