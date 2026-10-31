import type { RequestHandler } from '@sveltejs/kit';
import { ok } from '#lib/api/response.js';
import { requireAuth, guardVehicle } from '#lib/api/guards.js';

export const GET: RequestHandler = async ({ locals, params }) => {
	const authErr = requireAuth(locals);
	if (authErr) return authErr;

	const vehicle = await guardVehicle(params.id!, locals.user!.id);
	if (vehicle instanceof Response) return vehicle;

	return ok(vehicle);
};
