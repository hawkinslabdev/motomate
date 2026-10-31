import type { RequestHandler } from '@sveltejs/kit';
import { getServiceLogById, deleteServiceLog } from '#lib/db/repositories/service-logs.js';
import { apiError, ok } from '#lib/api/response.js';
import { requireAuth, requireWrite, guardVehicle } from '#lib/api/guards.js';
import { syncOdometer } from '#lib/api/effects.js';

export const GET: RequestHandler = async ({ locals, params }) => {
	const authErr = requireAuth(locals);
	if (authErr) return authErr;

	const vehicle = await guardVehicle(params.id!, locals.user!.id);
	if (vehicle instanceof Response) return vehicle;

	const log = await getServiceLogById(params.logId!);
	if (!log || log.vehicle_id !== params.id) return apiError('Log not found', 'NOT_FOUND', 404);

	return ok(log);
};

export const DELETE: RequestHandler = async ({ locals, params }) => {
	const authErr = requireAuth(locals);
	if (authErr) return authErr;

	const writeErr = requireWrite(locals);
	if (writeErr) return writeErr;

	const vehicle = await guardVehicle(params.id!, locals.user!.id);
	if (vehicle instanceof Response) return vehicle;

	const log = await getServiceLogById(params.logId!);
	if (!log || log.vehicle_id !== params.id) return apiError('Log not found', 'NOT_FOUND', 404);

	await deleteServiceLog(params.logId!, params.id!, locals.user!.id);
	await syncOdometer(params.id!, locals.user!.id);

	return ok({ deleted: true });
};
