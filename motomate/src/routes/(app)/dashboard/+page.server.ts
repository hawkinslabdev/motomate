import type { PageServerLoad } from './$types';
import { getVehiclesByUser } from '$lib/db/repositories/vehicles.js';
import { recomputeTrackerStatuses } from '$lib/db/repositories/maintenance.js';
import { getRecentLogsAcrossVehicles } from '$lib/db/repositories/service-logs.js';
import { getVehicleExpenses } from '$lib/db/repositories/finance-transactions.js';
import { getUnreadCount } from '$lib/workflow/channels/inapp.js';
import { totalByCurrency } from '$lib/utils/money.js';
import { getVapidConfig } from '$lib/server/vapid.js';

export const load: PageServerLoad = async ({ locals }) => {
	const user = locals.user!;
	const vehicles = await getVehiclesByUser(user.id);
	const vehicleIds = vehicles.map((v) => v.id);

	const yearStart = new Date().getFullYear() + '-01-01';

	const [trackersByVehicle, recentLogsRaw, unreadCount, yearFinance] = await Promise.all([
		Promise.all(
			vehicles.map(async (v) => {
				const trackers = await recomputeTrackerStatuses(v.id, v.current_odometer);
				return trackers.map((t) => ({ ...t, vehicle: v }));
			})
		),
		getRecentLogsAcrossVehicles(vehicleIds, vehicleIds.length * 5),
		getUnreadCount(user.id),
		Promise.all(
			vehicles.map(async (v) => {
				const expenses = await getVehicleExpenses(v.id, user.id);
				const yearExpenses = expenses.filter((e) => e.performed_at >= yearStart);
				const total = totalByCurrency(
					yearExpenses.map((e) => ({ amountCents: e.amount_cents, currency: e.currency })),
					user.settings?.currency ?? 'EUR'
				);
				return { vehicleId: v.id, total };
			})
		)
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
	const seenVehicles = new Set<string>();
	const recentLogs = recentLogsRaw
		.filter((log) => {
			if (seenVehicles.has(log.vehicle_id)) return false;
			seenVehicles.add(log.vehicle_id);
			return true;
		})
		.map((log) => ({ ...log, vehicle: vehicleMap.get(log.vehicle_id)! }));

	const yearCostByVehicle = Object.fromEntries(
		yearFinance.map((e) => [e.vehicleId, { total: e.total }])
	);

	return {
		user,
		vehicles,
		overdueTrackers,
		dueTrackers,
		recentLogs,
		vehicleStatus: Object.fromEntries(vehicleStatus),
		yearCostByVehicle,
		unreadCount,
		vapidPublicKey: getVapidConfig().publicKey,
		pushChannelEnabled: user.settings?.notification_channels?.push?.enabled ?? false,
		pushBannerDismissed: user.settings?.page_prefs?.global?.pushBannerDismissed ?? false
	};
};
