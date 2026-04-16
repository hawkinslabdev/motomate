import { eq, and } from 'drizzle-orm';
import { addMonths, parseISO, formatISO } from 'date-fns';
import { db, sqlite } from '../index.js';
import { task_templates, active_trackers } from '../schema.js';
import { CreateTaskTemplateSchema } from '../../validators/schemas.js';
import { getVehicleById } from './vehicles.js';
import type {
	InsertTaskTemplate,
	InsertActiveTracker,
	TaskTemplate,
	ActiveTracker
} from '../schema.js';
import { generateId } from '../../utils/id.js';

import en from '$lib/i18n/locales/en.json';
import de from '$lib/i18n/locales/de.json';
import fr from '$lib/i18n/locales/fr.json';
import es from '$lib/i18n/locales/es.json';
import it from '$lib/i18n/locales/it.json';
import nl from '$lib/i18n/locales/nl.json';
import pt from '$lib/i18n/locales/pt.json';

type LocaleMessages = {
	onboarding: {
		presets: {
			tasks: Record<string, string>;
			descriptions: Record<string, string>;
		};
	};
};

const localeMessages: Record<string, LocaleMessages> = { en, de, fr, es, it, nl, pt };

// Preset task templates

export const PRESET_TEMPLATES_BY_TYPE = {
	motorcycle: [
		{
			key: 'oil',
			name: 'Oil & Filter Change',
			category: 'oil' as const,
			description: 'Engine oil and oil filter replacement',
			interval_km: 10000,
			interval_months: 12
		},
		{
			key: 'tire',
			name: 'Tire Pressure & Wear Check',
			category: 'tire' as const,
			description: 'Check tyre pressure and inspect tread depth',
			interval_km: null,
			interval_months: 1
		},
		{
			key: 'chain_lube',
			name: 'Chain Clean & Lube',
			category: 'chain' as const,
			description: 'Clean and lubricate the chain',
			interval_km: 500,
			interval_months: null
		},
		{
			key: 'chain_tension',
			name: 'Chain Tension Check',
			category: 'chain' as const,
			description: 'Check and adjust chain tension',
			interval_km: 1000,
			interval_months: null
		},
		{
			key: 'brake',
			name: 'Brake Pads & Fluid',
			category: 'brake' as const,
			description: 'Inspect brake pads and replace brake fluid',
			interval_km: 10000,
			interval_months: 24
		}
	],
	scooter: [
		{
			key: 'oil',
			name: 'Oil Change',
			category: 'oil' as const,
			description: 'Engine oil replacement',
			interval_km: 3000,
			interval_months: 12
		},
		{
			key: 'tire',
			name: 'Tire Pressure & Wear Check',
			category: 'tire' as const,
			description: 'Check tyre pressure and inspect tread depth',
			interval_km: null,
			interval_months: 1
		},
		{
			key: 'belt',
			name: 'Drive Belt Check',
			category: 'custom' as const,
			description: 'Inspect and replace the drive belt',
			interval_km: 10000,
			interval_months: 12
		},
		{
			key: 'brake',
			name: 'Brake Pads & Fluid',
			category: 'brake' as const,
			description: 'Inspect brake pads and replace brake fluid',
			interval_km: 8000,
			interval_months: 24
		},
		{
			key: 'air_filter',
			name: 'Air Filter',
			category: 'custom' as const,
			description: 'Clean or replace the air filter',
			interval_km: 6000,
			interval_months: 12
		}
	],
	bike: [
		{
			key: 'tire',
			name: 'Tire Pressure & Wear Check',
			category: 'tire' as const,
			description: 'Check tyre pressure and inspect tread depth',
			interval_km: null,
			interval_months: 1
		},
		{
			key: 'chain_lube',
			name: 'Chain Lubrication',
			category: 'chain' as const,
			description: 'Clean and lubricate the chain',
			interval_km: 500,
			interval_months: 1
		},
		{
			key: 'brake',
			name: 'Brake Adjustment',
			category: 'brake' as const,
			description: 'Inspect and adjust brake pads and cables',
			interval_km: 2000,
			interval_months: 12
		},
		{
			key: 'cable_check',
			name: 'Cable & Gear Check',
			category: 'custom' as const,
			description: 'Inspect cables, housing, and gear shifting',
			interval_km: null,
			interval_months: 12
		}
	],
	other: [
		{
			key: 'oil',
			name: 'Oil & Filter Change',
			category: 'oil' as const,
			description: 'Engine oil and oil filter replacement',
			interval_km: 10000,
			interval_months: 12
		},
		{
			key: 'tire',
			name: 'Tire Pressure & Wear Check',
			category: 'tire' as const,
			description: 'Check tyre pressure and inspect tread depth',
			interval_km: null,
			interval_months: 1
		},
		{
			key: 'brake',
			name: 'Brake Pads & Fluid',
			category: 'brake' as const,
			description: 'Inspect brake pads and replace brake fluid',
			interval_km: 20000,
			interval_months: 24
		},
		{
			key: 'air_filter',
			name: 'Air Filter',
			category: 'custom' as const,
			description: 'Clean or replace the air filter',
			interval_km: 15000,
			interval_months: 24
		},
		{
			key: 'battery',
			name: 'Battery Check',
			category: 'custom' as const,
			description: 'Inspect battery terminals and charge level',
			interval_km: null,
			interval_months: 12
		}
	]
};

// Backwards compat
export const PRESET_TEMPLATES = PRESET_TEMPLATES_BY_TYPE.motorcycle;

export function getPresetsForType(type: string) {
	return (
		PRESET_TEMPLATES_BY_TYPE[type as keyof typeof PRESET_TEMPLATES_BY_TYPE] ??
		PRESET_TEMPLATES_BY_TYPE.motorcycle
	);
}

// Task templates
export async function createTaskTemplate(userId: string, input: unknown): Promise<TaskTemplate> {
	const parsed = CreateTaskTemplateSchema.parse(input);
	const id = generateId();
	const row: InsertTaskTemplate = { ...parsed, id, user_id: userId };
	await db.insert(task_templates).values(row);
	return db.query.task_templates.findFirst({
		where: eq(task_templates.id, id)
	}) as Promise<TaskTemplate>;
}

export async function getTemplatesByUser(userId: string): Promise<TaskTemplate[]> {
	return db.query.task_templates.findMany({
		where: and(eq(task_templates.user_id, userId), eq(task_templates.enabled, true))
	});
}

export async function seedPresetsForVehicle(
	userId: string,
	vehicleId: string,
	selectedKeys: string[] = ['oil', 'tire', 'chain_lube', 'chain_tension', 'brake'],
	currentOdometer: number = 0,
	nameMap: Record<string, { name: string; description?: string }> = {},
	vehicleType: string = 'motorcycle'
): Promise<{ template: TaskTemplate; tracker: ActiveTracker }[]> {
	const results = [];
	for (const preset of getPresetsForType(vehicleType)) {
		if (!selectedKeys.includes(preset.key)) continue;
		const override = nameMap[preset.key];
		const template = await createTaskTemplate(userId, {
			...preset,
			name: override?.name ?? preset.name,
			description: override?.description ?? preset.description,
			vehicle_id: vehicleId,
			is_preset: true
		});
		const tracker = await createTracker(vehicleId, template.id, currentOdometer);
		results.push({ template, tracker });
	}
	return results;
}

// Active trackers

/**
 * Create a tracker with initial due values inferred from the template.
 *
 * For km-based intervals: next_due_odometer = interval_km (from zero).
 * A vehicle at 9 500 km with a 5 000 km oil interval will immediately show
 * as overdue — correct, because the interval has elapsed since km=0.
 *
 * For date-based intervals: next_due_at = today + interval_months.
 * We assume the last service was "right now" so the clock starts fresh.
 *
 * currentOdometer is only used to decide if the vehicle has already
 * surpassed the first km threshold; the threshold itself is always
 * interval_km (not currentOdometer + interval_km).
 */
export async function createTracker(
	vehicleId: string,
	templateId: string,
	_currentOdometer: number = 0
): Promise<ActiveTracker> {
	const template = await db.query.task_templates.findFirst({
		where: eq(task_templates.id, templateId)
	});

	const today = new Date().toISOString().slice(0, 10);
	let next_due_odometer: number | null = null;
	let next_due_at: string | null = null;

	if (template?.interval_km) {
		next_due_odometer = template.interval_km;
	}
	if (template?.interval_months) {
		next_due_at = formatISO(addMonths(parseISO(today), template.interval_months), {
			representation: 'date'
		});
	}

	const id = generateId();
	const row: InsertActiveTracker = {
		id,
		vehicle_id: vehicleId,
		template_id: templateId,
		next_due_odometer,
		next_due_at
	};
	await db.insert(active_trackers).values(row);
	return db.query.active_trackers.findFirst({
		where: eq(active_trackers.id, id)
	}) as Promise<ActiveTracker>;
}

export async function getTrackersByVehicle(vehicleId: string, userId: string) {
	const vehicle = await getVehicleById(vehicleId, userId);
	if (!vehicle) return [];
	return db.query.active_trackers.findMany({
		where: eq(active_trackers.vehicle_id, vehicleId),
		with: { template: true }
	});
}

export async function applyDefaultTrackersFromHistory(
	vehicleId: string,
	userId: string,
	serviceLogs: { performed_at: string; odometer_at_service: number }[],
	locale?: string,
	vehicleType: string = 'motorcycle'
): Promise<void> {
	const userLocale = locale ?? 'en';
	const messages = localeMessages[userLocale] ?? localeMessages['en'];
	const tasks = messages.onboarding.presets.tasks as Record<string, string>;
	const descs = messages.onboarding.presets.descriptions as Record<string, string>;

	const vehiclePresets = getPresetsForType(vehicleType);
	const nameMap: Record<string, { name: string; description?: string }> = {};
	for (const p of vehiclePresets) {
		nameMap[p.key] = {
			name: tasks[p.key] ?? p.name,
			description: descs[p.key] ?? p.description
		};
	}

	if (serviceLogs.length === 0) {
		await seedPresetsForVehicle(
			userId,
			vehicleId,
			vehiclePresets.map((p) => p.key),
			0,
			nameMap,
			vehicleType
		);
		return;
	}

	const sorted = [...serviceLogs].sort((a, b) => b.performed_at.localeCompare(a.performed_at));
	const latest = sorted[0];
	const currentOdometer = latest.odometer_at_service;

	const kmStats = new Map<string, number[]>();
	for (const log of serviceLogs) {
		const key = log.performed_at.slice(0, 7);
		kmStats.set(key, (kmStats.get(key) ?? []).concat([log.odometer_at_service]));
	}

	const avgKmPerMonth = (() => {
		const months = new Set(serviceLogs.map((l) => l.performed_at.slice(0, 7))).size;
		if (months <= 1) return null;
		const range = serviceLogs.length / months;
		return range > 0 ? range : null;
	})();

	const presetIntervals: Record<string, { km: number | null; months: number | null }> = {};
	for (const p of vehiclePresets) {
		presetIntervals[p.key] = { km: p.interval_km ?? null, months: p.interval_months ?? null };
	}

	const derivedIntervals: Record<string, { km: number | null; months: number | null }> = {};
	for (const [key, stats] of kmStats) {
		if (stats.length >= 2) {
			const sortedKm = [...stats].sort((a, b) => b - a);
			const diff = sortedKm[0] - sortedKm[sortedKm.length - 1];
			const interval = Math.round(diff / (sortedKm.length - 1));
			if (interval > 0 && interval < 50000) {
				const preset = presetIntervals[key];
				if (!preset || (preset.km !== null && interval < preset.km * 1.5)) {
					derivedIntervals[key] = {
						km: interval,
						months: avgKmPerMonth ? Math.round(12 / avgKmPerMonth) : null
					};
				}
			}
		}
	}

	for (const key of Object.keys(presetIntervals)) {
		const derived = derivedIntervals[key];
		const preset = presetIntervals[key];
		if (derived) {
			nameMap[key] = {
				...nameMap[key],
				description: `Recurring maintenance (auto-detected from ${serviceLogs.length} service entries)`
			};
			presetIntervals[key] = {
				km: derived.km ?? preset.km,
				months: derived.months ?? preset.months
			};
		}
	}

	const results = [];
	for (const preset of vehiclePresets) {
		const template = await createTaskTemplate(userId, {
			...preset,
			name: nameMap[preset.key]?.name ?? preset.name,
			description: nameMap[preset.key]?.description ?? preset.description,
			vehicle_id: vehicleId,
			interval_km: presetIntervals[preset.key].km,
			interval_months: presetIntervals[preset.key].months,
			is_preset: true
		});

		const tracker = await createTrackerWithHistory(
			vehicleId,
			template.id,
			currentOdometer,
			latest.performed_at
		);
		results.push({ template, tracker });
	}
}

async function createTrackerWithHistory(
	vehicleId: string,
	templateId: string,
	currentOdometer: number,
	lastServiceDate: string
): Promise<ActiveTracker> {
	const template = await db.query.task_templates.findFirst({
		where: eq(task_templates.id, templateId)
	});

	let next_due_odometer: number | null = null;
	let next_due_at: string | null = null;

	if (template?.interval_km) {
		next_due_odometer = currentOdometer + template.interval_km;
	}
	if (template?.interval_months) {
		next_due_at = formatISO(addMonths(parseISO(lastServiceDate), template.interval_months), {
			representation: 'date'
		});
	}

	const id = generateId();
	const row: InsertActiveTracker = {
		id,
		vehicle_id: vehicleId,
		template_id: templateId,
		next_due_odometer,
		next_due_at,
		last_done_at: lastServiceDate,
		last_done_odometer: currentOdometer
	};
	await db.insert(active_trackers).values(row);
	return db.query.active_trackers.findFirst({
		where: eq(active_trackers.id, id)
	}) as Promise<ActiveTracker>;
}

export async function updateTrackerAfterService(
	trackerId: string,
	performedAt: string,
	odometerAtService: number
): Promise<void> {
	const tracker = await db.query.active_trackers.findFirst({
		where: eq(active_trackers.id, trackerId),
		with: { template: true }
	});
	if (!tracker) return;

	const tmpl = tracker.template;
	let next_due_at: string | null = null;
	let next_due_odometer: number | null = null;

	if (tmpl.interval_months) {
		next_due_at = formatISO(addMonths(parseISO(performedAt), tmpl.interval_months), {
			representation: 'date'
		});
	}
	if (tmpl.interval_km) {
		next_due_odometer = odometerAtService + tmpl.interval_km;
	}

	// Clear per-rule notification cooldown on service — the tracker is being reset,
	// so any new overdue crossing should fire a fresh notification.
	const currentState = (tracker.state as Record<string, unknown>) ?? {};
	await db
		.update(active_trackers)
		.set({
			last_done_at: performedAt,
			last_done_odometer: odometerAtService,
			next_due_at,
			next_due_odometer,
			status: 'ok',
			state: { ...currentState, notified_by: {} },
			updated_at: new Date().toISOString()
		})
		.where(eq(active_trackers.id, trackerId));
}

/**
 * Directly override a tracker's state. Pass `undefined` for next_due_* to
 * auto-compute from the (possibly updated) interval + last_done values.
 * Pass `null` to explicitly clear a field.
 */
export async function updateTrackerState(
	trackerId: string,
	vehicleId: string,
	data: {
		interval_km?: number | null;
		interval_months?: number | null;
		last_done_at?: string | null;
		last_done_odometer?: number | null;
		next_due_odometer?: number | null; // undefined = auto-compute
		next_due_at?: string | null; // undefined = auto-compute
	}
): Promise<void> {
	const tracker = await db.query.active_trackers.findFirst({
		where: and(eq(active_trackers.id, trackerId), eq(active_trackers.vehicle_id, vehicleId)),
		with: { template: true }
	});
	if (!tracker) return;

	// Update template interval if provided
	const templatePatch: Partial<{ interval_km: number | null; interval_months: number | null }> = {};
	if (data.interval_km !== undefined) templatePatch.interval_km = data.interval_km;
	if (data.interval_months !== undefined) templatePatch.interval_months = data.interval_months;
	if (Object.keys(templatePatch).length > 0) {
		await db
			.update(task_templates)
			.set(templatePatch)
			.where(eq(task_templates.id, tracker.template_id));
	}

	const effectiveIntervalKm =
		data.interval_km !== undefined ? data.interval_km : tracker.template.interval_km;
	const effectiveIntervalMonths =
		data.interval_months !== undefined ? data.interval_months : tracker.template.interval_months;
	const lastDoneAt = data.last_done_at !== undefined ? data.last_done_at : tracker.last_done_at;
	const lastDoneOdo =
		data.last_done_odometer !== undefined ? data.last_done_odometer : tracker.last_done_odometer;

	// Compute next_due from interval + last_done when caller didn't override
	let nextDueOdo: number | null;
	if (data.next_due_odometer !== undefined) {
		nextDueOdo = data.next_due_odometer;
	} else if (effectiveIntervalKm) {
		nextDueOdo = lastDoneOdo != null ? lastDoneOdo + effectiveIntervalKm : effectiveIntervalKm;
	} else {
		nextDueOdo = null;
	}

	let nextDueAt: string | null;
	if (data.next_due_at !== undefined) {
		nextDueAt = data.next_due_at;
	} else if (effectiveIntervalMonths && lastDoneAt) {
		nextDueAt = formatISO(addMonths(parseISO(lastDoneAt), effectiveIntervalMonths), {
			representation: 'date'
		});
	} else {
		nextDueAt = null;
	}

	await db
		.update(active_trackers)
		.set({
			last_done_at: lastDoneAt,
			last_done_odometer: lastDoneOdo,
			next_due_odometer: nextDueOdo,
			next_due_at: nextDueAt,
			updated_at: new Date().toISOString()
		})
		.where(and(eq(active_trackers.id, trackerId), eq(active_trackers.vehicle_id, vehicleId)));
}

export async function deleteTracker(trackerId: string, vehicleId: string): Promise<void> {
	await db
		.delete(active_trackers)
		.where(and(eq(active_trackers.id, trackerId), eq(active_trackers.vehicle_id, vehicleId)));
}

/**
 * Recomputes tracker statuses for a vehicle and returns the updated trackers.
 * Returning trackers here avoids a redundant getTrackersByVehicle() read at the call site.
 * All writes are batched in a single SQLite transaction — much faster than N individual UPDATEs.
 */
export async function recomputeTrackerStatuses(
	vehicleId: string,
	currentOdometer: number
): Promise<(ActiveTracker & { template: TaskTemplate })[]> {
	const trackers = await db.query.active_trackers.findMany({
		where: eq(active_trackers.vehicle_id, vehicleId),
		with: { template: true }
	});
	const today = new Date().toISOString().slice(0, 10);
	const now = new Date().toISOString();

	// Compute all changes in memory first, then write in one transaction
	type Patch = { id: string; fields: Partial<typeof active_trackers.$inferInsert> };
	const patches: Patch[] = [];
	const results: (ActiveTracker & { template: TaskTemplate })[] = [];

	for (const t of trackers) {
		let nextDueOdo = t.next_due_odometer;
		let nextDueAt = t.next_due_at;
		const needsInit = t.last_done_odometer === null && t.last_done_at === null;
		const fields: Partial<typeof active_trackers.$inferInsert> = {};

		if (needsInit && nextDueOdo === null && t.template.interval_km) {
			nextDueOdo = t.template.interval_km;
			fields.next_due_odometer = nextDueOdo;
		}
		if (needsInit && nextDueAt === null && t.template.interval_months) {
			nextDueAt = formatISO(addMonths(parseISO(today), t.template.interval_months), {
				representation: 'date'
			});
			fields.next_due_at = nextDueAt;
		}

		// Compute status
		let status: 'ok' | 'due' | 'overdue' = 'ok';
		const kmOverdue = nextDueOdo !== null && currentOdometer > nextDueOdo;
		const dateOverdue = nextDueAt !== null && today > nextDueAt;

		if (kmOverdue || dateOverdue) {
			status = 'overdue';
		} else {
			// TODO: expose DUE_SOON_FACTOR as a user setting in profile settings page
			const DUE_SOON_FACTOR = 0.2;
			const kmWindow = t.template.interval_km
				? Math.min(500, Math.max(50, Math.round(t.template.interval_km * DUE_SOON_FACTOR)))
				: 500;
			const kmDueSoon = nextDueOdo !== null && currentOdometer >= nextDueOdo - kmWindow;
			const dayWindow = t.template.interval_months
				? Math.min(14, Math.max(3, Math.round(t.template.interval_months * 30 * DUE_SOON_FACTOR)))
				: 7;
			const dateDueSoon =
				nextDueAt !== null &&
				new Date(nextDueAt).getTime() - Date.now() < dayWindow * 24 * 60 * 60 * 1000;
			if (kmDueSoon || dateDueSoon) status = 'due';
		}

		if (status !== t.status) {
			fields.status = status;
			// When the tracker returns to ok (entry corrected/deleted), reset the
			// per-cycle notification record so the next due/overdue crossing notifies fresh.
			if (status === 'ok') {
				fields.state = { ...((t.state as object) ?? {}), notified_by: {} };
			}
		}

		if (Object.keys(fields).length > 0) {
			fields.updated_at = now;
			patches.push({ id: t.id, fields });
		}

		// Return tracker with locally computed values — no second DB read needed
		results.push({ ...t, next_due_odometer: nextDueOdo, next_due_at: nextDueAt, status });
	}

	// Batch all writes in a single transaction
	if (patches.length > 0) {
		sqlite.transaction(() => {
			for (const { id, fields } of patches) {
				db.update(active_trackers).set(fields).where(eq(active_trackers.id, id)).run();
			}
		})();
	}

	return results;
}
