import type { RequestHandler } from '@sveltejs/kit';
import { getVehiclesByUser } from '#lib/db/repositories/vehicles.js';
import { list } from '#lib/api/response.js';
import { requireAuth } from '#lib/api/guards.js';

export const GET: RequestHandler = async ({ locals }) => {
	const authErr = requireAuth(locals);
	if (authErr) return authErr;

	const vehicles = await getVehiclesByUser(locals.user!.id, false);
	return list(vehicles);
};
