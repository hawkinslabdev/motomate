import type { RequestHandler } from '@sveltejs/kit';
import {
	getFinanceTransactionsByVehicle,
	createFinanceTransaction
} from '#lib/db/repositories/finance-transactions.js';
import { ApiFinanceTransactionSchema } from '#lib/validators/schemas.js';
import { apiError, ok } from '#lib/api/response.js';
import {
	requireAuth,
	requireWrite,
	guardVehicle,
	parseBody,
	parsePage,
	userCurrency
} from '#lib/api/guards.js';

export const GET: RequestHandler = async ({ locals, params, url }) => {
	const authErr = requireAuth(locals);
	if (authErr) return authErr;

	const vehicle = await guardVehicle(params.id!, locals.user!.id);
	if (vehicle instanceof Response) return vehicle;

	const { limit, offset } = parsePage(url);
	const all = await getFinanceTransactionsByVehicle(params.id!, locals.user!.id);
	const total_cents = all.reduce((sum, t) => sum + t.amount_cents, 0);

	return Response.json({ data: all.slice(offset, offset + limit), total: all.length, total_cents });
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

	const parsed = ApiFinanceTransactionSchema.safeParse(body);
	if (!parsed.success) {
		return apiError(parsed.error.issues[0]?.message ?? 'Invalid input', 'VALIDATION_ERROR', 400);
	}

	const transaction = await createFinanceTransaction(locals.user!.id, {
		vehicle_id: params.id!,
		category: parsed.data.category,
		amount_cents: parsed.data.amount_cents,
		currency: userCurrency(locals.user!),
		performed_at: parsed.data.performed_at,
		notes: parsed.data.notes ?? null,
		odometer_at_transaction: parsed.data.odometer_at_transaction ?? null,
		attachments: []
	});

	return ok(transaction, 201);
};
