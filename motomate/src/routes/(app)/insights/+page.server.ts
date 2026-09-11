import type { PageServerLoad } from './$types';
import { getVehiclesByUser, getOdometerLogs } from '$lib/db/repositories/vehicles.js';
import { getVehicleExpenses } from '$lib/db/repositories/finance-transactions.js';
import { getServiceLogsByVehicle } from '$lib/db/repositories/service-logs.js';

export const load: PageServerLoad = async ({ locals }) => {
	const user = locals.user!;
	const vehicles = await getVehiclesByUser(user.id);

	const [odoByVehicle, expensesByVehicle, serviceByVehicle] = await Promise.all([
		Promise.all(vehicles.map((v) => getOdometerLogs(v.id, user.id))),
		Promise.all(vehicles.map((v) => getVehicleExpenses(v.id, user.id))),
		Promise.all(vehicles.map((v) => getServiceLogsByVehicle(v.id, user.id)))
	]);

	return {
		user,
		vehicles: vehicles.map((v) => ({
			id: v.id,
			name: v.name,
			odometer_unit: v.odometer_unit,
			meta: v.meta as { avatar_emoji?: string } | null
		})),
		odometerLogs: [
			...odoByVehicle.flat().map((l) => ({
				vehicle_id: l.vehicle_id,
				odometer: l.odometer,
				recorded_at: l.recorded_at
			})),
			// service entries include readings too
			...serviceByVehicle
				.flat()
				.filter((s) => !s.is_reminder && s.odometer_at_service > 0)
				.map((s) => ({
					vehicle_id: s.vehicle_id,
					odometer: s.odometer_at_service,
					recorded_at: s.performed_at
				}))
		],
		// fuel logged inconsistently, keep opt-in
		expenses: expensesByVehicle.flat(),
		serviceLogs: serviceByVehicle.flat().map((s) => ({
			vehicle_id: s.vehicle_id,
			performed_at: s.performed_at,
			notes: s.notes ?? null
		})),
		page_prefs: user.settings?.page_prefs?.insights ?? null
	};
};
