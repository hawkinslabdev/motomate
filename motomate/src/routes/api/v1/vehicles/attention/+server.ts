import type { RequestHandler } from '@sveltejs/kit';
import { getVehiclesByUser } from '#lib/db/repositories/vehicles.js';
import { getTrackersByVehicle } from '#lib/db/repositories/maintenance.js';
import { requireAuth } from '#lib/api/guards.js';
import { syncOdometer } from '#lib/api/effects.js';
import { categorizeTrackers } from '#lib/api/attention.js';
import { ok } from '#lib/api/response.js';

export const GET: RequestHandler = async ({ locals }) => {
	const authErr = requireAuth(locals);
	if (authErr) return authErr;

	const vehicles = await getVehiclesByUser(locals.user!.id, false);

	const results = await Promise.all(
		vehicles.map(async (vehicle) => {
			const trueOdo = await syncOdometer(vehicle.id, locals.user!.id);
			const trackers = await getTrackersByVehicle(vehicle.id, locals.user!.id);

			const { overdue, due, upcoming } = categorizeTrackers(
				trackers,
				trueOdo,
				vehicle.odometer_unit,
				(t) => ({
					id: t.id,
					name: t.template.name,
					status: t.status,
					next_due_at: t.next_due_at ?? null,
					next_due_odometer: t.next_due_odometer ?? null,
					last_done_at: t.last_done_at ?? null,
					last_done_odometer: t.last_done_odometer ?? null
				})
			);

			return {
				vehicle_id: vehicle.id,
				vehicle_name: vehicle.name,
				current_odometer: trueOdo,
				odometer_unit: vehicle.odometer_unit,
				overdue,
				due,
				upcoming
			};
		})
	);

	return ok(
		results.filter((r) => r.overdue.length > 0 || r.due.length > 0 || r.upcoming.length > 0)
	);
};
