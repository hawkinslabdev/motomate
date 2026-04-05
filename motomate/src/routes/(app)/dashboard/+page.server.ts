import type { PageServerLoad } from './$types';
import { getVehiclesByUser } from '$lib/db/repositories/vehicles.js';
import { recomputeTrackerStatuses } from '$lib/db/repositories/maintenance.js';
import { getServiceLogsByVehicle } from '$lib/db/repositories/service-logs.js';
import { getUnreadCount } from '$lib/workflow/channels/inapp.js';

export const load: PageServerLoad = async ({ locals }) => {
	const user = locals.user!;
	const vehicles = await getVehiclesByUser(user.id);

	// Recompute statuses and return updated trackers in one pass (no second read).
	// Fetch logs and unread count while recompute runs — all synchronous under the hood
	// but structured to make the intent clear.
	const [trackersByVehicle, allLogsNested, unreadCount] = await Promise.all([
		Promise.all(
			vehicles.map(async (v) => {
				const trackers = await recomputeTrackerStatuses(v.id, v.current_odometer);
				return trackers.map((t) => ({ ...t, vehicle: v }));
			})
		),
		Promise.all(vehicles.map((v) => getServiceLogsByVehicle(v.id, user.id))),
		getUnreadCount(user.id)
	]);

	const flatTrackers = trackersByVehicle.flat();
	const overdueTrackers = flatTrackers.filter((t) => t.status === 'overdue');
	const dueTrackers = flatTrackers.filter((t) => t.status === 'due');

	// Recent logs (last 5 across all vehicles)
	const vehicleMap = new Map(vehicles.map((v) => [v.id, v]));
	const allLogs = allLogsNested
		.flat()
		.sort((a, b) => b.performed_at.localeCompare(a.performed_at))
		.slice(0, 5);
	const recentLogs = allLogs.map((log) => ({ ...log, vehicle: vehicleMap.get(log.vehicle_id)! }));

	// Total cost this year
	const thisYear = new Date().getFullYear().toString();
	const yearCostCents = allLogs
		.filter((l) => l.performed_at.startsWith(thisYear) && l.cost_cents)
		.reduce((sum, l) => sum + (l.cost_cents ?? 0), 0);

	return {
		user,
		vehicles,
		overdueTrackers,
		dueTrackers,
		recentLogs,
		yearCostCents,
		unreadCount
	};
};
