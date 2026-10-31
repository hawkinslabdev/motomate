import type { RequestHandler } from '@sveltejs/kit';
import { deleteOdometerLog } from '#lib/db/repositories/vehicles.js';
import { ok } from '#lib/api/response.js';
import { requireAuth, requireWrite, guardVehicle } from '#lib/api/guards.js';
import { syncOdometer } from '#lib/api/effects.js';

export const DELETE: RequestHandler = async ({ locals, params }) => {
	const authErr = requireAuth(locals);
	if (authErr) return authErr;

	const writeErr = requireWrite(locals);
	if (writeErr) return writeErr;

	const vehicle = await guardVehicle(params.id!, locals.user!.id);
	if (vehicle instanceof Response) return vehicle;

	await deleteOdometerLog(params.logId!, params.id!, locals.user!.id);
	await syncOdometer(params.id!, locals.user!.id);

	return ok({ deleted: true });
};
