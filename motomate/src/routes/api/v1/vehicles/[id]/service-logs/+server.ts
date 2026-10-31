import type { RequestHandler } from '@sveltejs/kit';
import { getServiceLogsByVehicle, createServiceLog } from '#lib/db/repositories/service-logs.js';
import { runWorkflowChecks } from '#lib/workflow/engine.js';
import { ApiServiceLogSchema } from '#lib/validators/schemas.js';
import { apiError, list, ok } from '#lib/api/response.js';
import {
	requireAuth,
	requireWrite,
	guardVehicle,
	parseBody,
	parsePage,
	userCurrency
} from '#lib/api/guards.js';
import { syncOdometer } from '#lib/api/effects.js';

export const GET: RequestHandler = async ({ locals, params, url }) => {
	const authErr = requireAuth(locals);
	if (authErr) return authErr;

	const vehicle = await guardVehicle(params.id!, locals.user!.id);
	if (vehicle instanceof Response) return vehicle;

	const { limit, offset } = parsePage(url);
	const all = await getServiceLogsByVehicle(params.id!, locals.user!.id);
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

	const parsed = ApiServiceLogSchema.safeParse(body);
	if (!parsed.success) {
		return apiError(parsed.error.issues[0]?.message ?? 'Invalid input', 'VALIDATION_ERROR', 400);
	}

	const currency = userCurrency(locals.user!);
	const [primaryTrackerId, ...additionalTrackerIds] = parsed.data.tracker_ids ?? [];

	const log = await createServiceLog(locals.user!.id, {
		vehicle_id: params.id!,
		tracker_id: primaryTrackerId ?? undefined,
		performed_at: parsed.data.performed_at,
		odometer_at_service: parsed.data.odometer_at_service,
		cost_cents: parsed.data.cost_cents,
		currency,
		notes: parsed.data.notes,
		remark: parsed.data.remark,
		parts_used: [],
		attachments: [],
		serviced_tracker_ids: additionalTrackerIds,
		is_reminder: false
	});

	await syncOdometer(params.id!, locals.user!.id);
	runWorkflowChecks(locals.user!.id).catch(() => {});

	return ok(log, 201);
};
