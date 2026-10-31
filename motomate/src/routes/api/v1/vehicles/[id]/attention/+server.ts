import type { RequestHandler } from '@sveltejs/kit';
import { getTrackersByVehicle } from '#lib/db/repositories/maintenance.js';
import { requireAuth, guardVehicle } from '#lib/api/guards.js';
import { syncOdometer } from '#lib/api/effects.js';
import { categorizeTrackers } from '#lib/api/attention.js';
import { ok } from '#lib/api/response.js';

export const GET: RequestHandler = async ({ locals, params }) => {
	const authErr = requireAuth(locals);
	if (authErr) return authErr;

	const vehicle = await guardVehicle(params.id!, locals.user!.id);
	if (vehicle instanceof Response) return vehicle;

	const trueOdo = await syncOdometer(params.id!, locals.user!.id);
	const trackers = await getTrackersByVehicle(params.id!, locals.user!.id);

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
			last_done_odometer: t.last_done_odometer ?? null,
			interval_measurement: t.template.interval_measurement ?? null,
			interval_unit: t.template.interval_unit ?? null,
			interval_months: t.template.interval_months ?? null
		})
	);

	return ok({
		current_odometer: trueOdo,
		odometer_unit: vehicle.odometer_unit,
		overdue,
		due,
		upcoming
	});
};
