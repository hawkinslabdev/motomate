import type { RequestHandler } from '@sveltejs/kit';
import { getOdometerLogs, insertOdometerLog } from '#lib/db/repositories/vehicles.js';
import { ApiOdometerSchema } from '#lib/validators/schemas.js';
import { apiError, list, ok } from '#lib/api/response.js';
import { requireAuth, requireWrite, guardVehicle, parseBody, parsePage } from '#lib/api/guards.js';
import { syncOdometer } from '#lib/api/effects.js';

export const GET: RequestHandler = async ({ locals, params, url }) => {
	const authErr = requireAuth(locals);
	if (authErr) return authErr;

	const vehicle = await guardVehicle(params.id!, locals.user!.id);
	if (vehicle instanceof Response) return vehicle;

	const { limit, offset } = parsePage(url);
	const all = await getOdometerLogs(params.id!, locals.user!.id);
	return list(all.slice(offset, offset + limit), all.length);
};

export const POST: RequestHandler = async ({ locals, params, request }) => {
	const authErr = requireAuth(locals);
	if (authErr) return authErr;

	const writeErr = requireWrite(locals);
	if (writeErr) return writeErr;

	const vehicle = await guardVehicle(params.id!, locals.user!.id);
	if (vehicle instanceof Response) return vehicle;

	const body = await parseBody<unknown>(request);
	if (body instanceof Response) return body;

	const parsed = ApiOdometerSchema.safeParse(body);
	if (!parsed.success) {
		return apiError(parsed.error.issues[0]?.message ?? 'Invalid input', 'VALIDATION_ERROR', 400);
	}

	await insertOdometerLog(
		params.id!,
		locals.user!.id,
		parsed.data.odometer,
		parsed.data.remark,
		parsed.data.recorded_at
	);

	const trueOdo = await syncOdometer(params.id!, locals.user!.id);
	return ok({ odometer: trueOdo }, 201);
};
