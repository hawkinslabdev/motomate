import type { PageServerLoad } from './$types';
import { getVehiclesByUser } from '$lib/db/repositories/vehicles.js';
import { recomputeTrackerStatuses } from '$lib/db/repositories/maintenance.js';
import { getRecentLogsAcrossVehicles } from '$lib/db/repositories/service-logs.js';
import { getUnreadCount } from '$lib/workflow/channels/inapp.js';

export const load: PageServerLoad = async ({ locals }) => {
	const user = locals.user!;
	const vehicles = await getVehiclesByUser(user.id);
	const vehicleIds = vehicles.map((v) => v.id);

	const [trackersByVehicle, recentLogsRaw, unreadCount] = await Promise.all([
		Promise.all(
			vehicles.map(async (v) => {
				const trackers = await recomputeTrackerStatuses(v.id, v.current_odometer);
				return trackers.map((t) => ({ ...t, vehicle: v }));
			})
		),
		getRecentLogsAcrossVehicles(vehicleIds, 5),
		getUnreadCount(user.id)
	]);

	const flatTrackers = trackersByVehicle.flat();
	const overdueTrackers = flatTrackers.filter((t) => t.status === 'overdue');
	const dueTrackers = flatTrackers.filter((t) => t.status === 'due');

	// Worst status per vehicle for garage status dots
	const vehicleStatus = new Map(
		vehicles.map((v) => {
			const trackers = flatTrackers.filter((t) => t.vehicle_id === v.id);
			const worst = trackers.some((t) => t.status === 'overdue')
				? 'overdue'
				: trackers.some((t) => t.status === 'due')
					? 'due'
					: 'ok';
			return [v.id, worst] as const;
		})
	);

	const vehicleMap = new Map(vehicles.map((v) => [v.id, v]));
	const recentLogs = recentLogsRaw.map((log) => ({
		...log,
		vehicle: vehicleMap.get(log.vehicle_id)!
	}));

	return {
		user,
		vehicles,
		overdueTrackers,
		dueTrackers,
		recentLogs,
		vehicleStatus: Object.fromEntries(vehicleStatus),
		unreadCount
	};
};
