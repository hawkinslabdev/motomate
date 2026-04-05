import { eq, and, isNull } from 'drizzle-orm';
import { db } from '$lib/db/index.js';
import { workflow_rules, active_trackers, vehicles, documents } from '$lib/db/schema.js';
import { renderTemplate } from './rules.js';
import { serverT } from '$lib/i18n/server.js';
import type { RuleTrigger, RuleNotification, Vehicle } from '$lib/db/schema.js';

// Each fired result carries the template vars and, for tracker-based triggers,
// the tracker id + its current state (so the main loop can do per-tracker cooldown
// without an extra DB round-trip).
type TriggerResult = {
	vars: Record<string, string | number>;
	trackerId?: string;
	trackerState?: Record<string, unknown>;
};

// Normalise old-format actions (array) or new-format (single object)
function normaliseActions(raw: unknown): RuleNotification {
	if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
		const r = raw as Record<string, unknown>;
		if (typeof r.title === 'string' && typeof r.body === 'string') {
			return { title: r.title, body: r.body };
		}
	}
	if (Array.isArray(raw)) {
		const inApp = raw.find((a: { channel: string }) => a.channel === 'in_app');
		const push = raw.find((a: { channel: string }) => a.channel === 'push');
		const source = inApp ?? push ?? raw[0];
		if (source && typeof source.title === 'string') {
			return { title: source.title, body: source.body ?? '' };
		}
	}
	return { title: 'Notification', body: '' };
}

async function dispatchNotification(
	notification: RuleNotification,
	userId: string,
	vehicleId: string | null,
	vars: Record<string, string | number>
): Promise<void> {
	const user = await db.query.users.findFirst({
		where: (u, { eq }) => eq(u.id, userId)
	});

	const locale = user?.settings?.locale ?? 'en';
	const title = renderTemplate(await serverT(notification.title, locale), vars);
	const body = renderTemplate(await serverT(notification.body, locale), vars);
	const channels = user?.settings?.notification_channels ?? {};
	const vehicleName = String(vars.vehicle_name ?? '');

	const tasks: Promise<void>[] = [];

	// In-app is always dispatched
	const { dispatchInApp } = await import('./channels/inapp.js');
	tasks.push(dispatchInApp(userId, vehicleId, title, body));

	// Push
	if (channels.push?.enabled) {
		tasks.push(
			import('./channels/push.js').then(({ dispatchPush }) => dispatchPush(userId, title, body))
		);
	}

	// Email
	if (channels.email?.enabled && channels.email.address) {
		tasks.push(
			import('./channels/email.js').then(({ dispatchEmail }) =>
				dispatchEmail(channels.email!.address!, title, body)
			)
		);
	}

	// Webhook
	if (channels.webhook?.enabled && channels.webhook.url) {
		tasks.push(
			import('./channels/webhook.js').then(({ dispatchWebhook }) =>
				dispatchWebhook(
					channels.webhook!.url!,
					channels.webhook!.auth_header,
					title,
					body,
					vehicleName,
					vars
				)
			)
		);
	}

	// Home Assistant
	if (channels.home_assistant?.enabled && channels.home_assistant.webhook_url) {
		tasks.push(
			import('./channels/home_assistant.js').then(({ dispatchHomeAssistant }) =>
				dispatchHomeAssistant(channels.home_assistant!.webhook_url!, title, body, vehicleName, vars)
			)
		);
	}

	await Promise.allSettled(tasks);
}

// Returns an array — one entry per matching tracker (or document/date condition).
// Empty array means nothing fired.
async function evalTrigger(
	trigger: RuleTrigger,
	vehicle: Vehicle,
	_userId: string
): Promise<TriggerResult[]> {
	const today = new Date();

	switch (trigger.type) {
		case 'no_odometer_update': {
			const cutoff = new Date(today.getTime() - trigger.days * 86400000).toISOString();
			const stale = (vehicle.updated_at ?? vehicle.created_at) < cutoff;
			if (!stale) return [];
			return [{ vars: { vehicle_name: vehicle.name, days: trigger.days } }];
		}

		case 'calendar_date': {
			const fired = today.getMonth() + 1 === trigger.month && today.getDate() === trigger.day;
			if (!fired) return [];
			return [{ vars: { vehicle_name: vehicle.name } }];
		}

		case 'document_expiring': {
			const docs = await db.query.documents.findMany({
				where: and(eq(documents.vehicle_id, vehicle.id))
			});
			const results: TriggerResult[] = [];
			for (const doc of docs) {
				if (!doc.expires_at) continue;
				const daysUntil = Math.ceil(
					(new Date(doc.expires_at).getTime() - today.getTime()) / 86400000
				);
				if (daysUntil >= 0 && daysUntil <= trigger.days_before) {
					results.push({
						vars: {
							vehicle_name: vehicle.name,
							days_remaining: daysUntil,
							expiry_date: doc.expires_at,
							doc_name: doc.name
						}
					});
				}
			}
			return results;
		}

		case 'odometer_upcoming':
		case 'odometer_overdue':
		case 'date_upcoming':
		case 'date_overdue': {
			const trackers = await db.query.active_trackers.findMany({
				where: eq(active_trackers.vehicle_id, vehicle.id),
				with: { template: true }
			});

			const results: TriggerResult[] = [];

			for (const tracker of trackers) {
				const tracker_name = tracker.template?.name ?? '';
				const base = {
					trackerId: tracker.id,
					trackerState: tracker.state as Record<string, unknown>
				};

				if (trigger.type === 'odometer_upcoming' && tracker.next_due_odometer !== null) {
					const diff = tracker.next_due_odometer - vehicle.current_odometer;
					// For never-serviced trackers, next_due_odometer = interval_km from zero.
					// Use a tighter window (matching the UI's DUE_SOON_FACTOR = 0.2) so that
					// a first odometer entry of 12 km doesn't immediately fire "due in 488 km",
					// but 400 km legitimately fires "due in 100 km" for a 500 km interval.
					const neverServiced = tracker.last_done_odometer === null && tracker.last_done_at === null;
					const intervalKm = tracker.template?.interval_km ?? trigger.km_before;
					const effectiveWindow = neverServiced
						? Math.min(trigger.km_before, Math.min(500, Math.max(50, Math.round(intervalKm * 0.2))))
						: trigger.km_before;
					if (diff >= 0 && diff <= effectiveWindow) {
						results.push({
							...base,
							vars: { vehicle_name: vehicle.name, km_remaining: diff, tracker_id: tracker.id, tracker_name }
						});
					}
				}

				if (trigger.type === 'odometer_overdue' && tracker.next_due_odometer !== null) {
					const over = vehicle.current_odometer - tracker.next_due_odometer;
					if (over >= trigger.km_past) {
						results.push({
							...base,
							vars: { vehicle_name: vehicle.name, km_over: over, tracker_id: tracker.id, tracker_name }
						});
					}
				}

				if (trigger.type === 'date_upcoming' && tracker.next_due_at) {
					const daysLeft = Math.ceil(
						(new Date(tracker.next_due_at).getTime() - today.getTime()) / 86400000
					);
					if (daysLeft >= 0 && daysLeft <= trigger.days_before) {
						results.push({
							...base,
							vars: { vehicle_name: vehicle.name, days_remaining: daysLeft, due_date: tracker.next_due_at, tracker_name }
						});
					}
				}

				if (trigger.type === 'date_overdue' && tracker.next_due_at) {
					const overDays = Math.ceil(
						(today.getTime() - new Date(tracker.next_due_at).getTime()) / 86400000
					);
					if (overDays >= trigger.days_past) {
						results.push({
							...base,
							vars: { vehicle_name: vehicle.name, days_over: overDays, due_date: tracker.next_due_at, tracker_name }
						});
					}
				}
			}

			return results;
		}

		default:
			return [];
	}
}

// Main evaluator
export async function runWorkflowChecks(
	userId?: string
): Promise<{ evaluated: number; fired: number }> {
	const rules = await db.query.workflow_rules.findMany({
		where: userId
			? and(eq(workflow_rules.user_id, userId), eq(workflow_rules.enabled, true))
			: eq(workflow_rules.enabled, true)
	});

	const vehicleList = await db.query.vehicles.findMany({
		where: userId
			? and(eq(vehicles.user_id, userId), isNull(vehicles.archived_at))
			: isNull(vehicles.archived_at)
	});

	const vehicleMap = new Map(vehicleList.map((v) => [v.id, v]));

	let evaluated = 0;
	let fired = 0;

	for (const rule of rules) {
		const ruleVehicles = rule.vehicle_id
			? vehicleMap.has(rule.vehicle_id)
				? [vehicleMap.get(rule.vehicle_id)!]
				: []
			: vehicleList.filter((v) => v.user_id === rule.user_id);

		for (const vehicle of ruleVehicles) {
			evaluated++;
			const results = await evalTrigger(rule.trigger, vehicle, rule.user_id);

			for (const result of results) {
				// Cooldown: per-tracker for tracker-based triggers, per-rule otherwise
				if (result.trackerId) {
					const notifiedBy = (result.trackerState?.notified_by ?? {}) as Record<string, string>;
					const lastNotified = notifiedBy[rule.id];
					if (lastNotified) {
						const hoursSince = (Date.now() - new Date(lastNotified).getTime()) / 3_600_000;
						if (hoursSince < 23) continue;
					}
				} else {
					if (rule.last_triggered_at) {
						const hoursSince =
							(Date.now() - new Date(rule.last_triggered_at).getTime()) / 3_600_000;
						if (hoursSince < 23) continue;
					}
				}

				fired++;
				const notification = normaliseActions(rule.actions);
				await dispatchNotification(notification, rule.user_id, vehicle.id, result.vars);

				// Stamp cooldown on the right record
				if (result.trackerId) {
					const currentState = result.trackerState ?? {};
					const currentNotifiedBy = (currentState.notified_by ?? {}) as Record<string, string>;
					await db
						.update(active_trackers)
						.set({
							state: {
								...currentState,
								notified_by: { ...currentNotifiedBy, [rule.id]: new Date().toISOString() }
							},
							updated_at: new Date().toISOString()
						})
						.where(eq(active_trackers.id, result.trackerId));
				} else {
					await db
						.update(workflow_rules)
						.set({ last_triggered_at: new Date().toISOString() })
						.where(eq(workflow_rules.id, rule.id));
				}
			}
		}
	}

	return { evaluated, fired };
}
