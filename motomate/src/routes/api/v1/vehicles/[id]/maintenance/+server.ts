import type { RequestHandler } from '@sveltejs/kit';
import { getTrackersByVehicle } from '#lib/db/repositories/maintenance.js';
import { list } from '#lib/api/response.js';
import { requireAuth, guardVehicle } from '#lib/api/guards.js';
import { syncOdometer } from '#lib/api/effects.js';

export const GET: RequestHandler = async ({ locals, params }) => {
	const authErr = requireAuth(locals);
	if (authErr) return authErr;

	const vehicle = await guardVehicle(params.id!, locals.user!.id);
	if (vehicle instanceof Response) return vehicle;

	await syncOdometer(params.id!, locals.user!.id);
	const trackers = await getTrackersByVehicle(params.id!, locals.user!.id);
	return list(trackers);
};
