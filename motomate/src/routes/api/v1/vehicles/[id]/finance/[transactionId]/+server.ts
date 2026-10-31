import type { RequestHandler } from '@sveltejs/kit';
import {
	getFinanceTransactionById,
	deleteFinanceTransaction
} from '#lib/db/repositories/finance-transactions.js';
import { apiError, ok } from '#lib/api/response.js';
import { requireAuth, requireWrite, guardVehicle } from '#lib/api/guards.js';

export const DELETE: RequestHandler = async ({ locals, params }) => {
	const authErr = requireAuth(locals);
	if (authErr) return authErr;

	const writeErr = requireWrite(locals);
	if (writeErr) return writeErr;

	const vehicle = await guardVehicle(params.id!, locals.user!.id);
	if (vehicle instanceof Response) return vehicle;

	const tx = await getFinanceTransactionById(params.transactionId!, params.id!, locals.user!.id);
	if (!tx) return apiError('Transaction not found', 'NOT_FOUND', 404);

	await deleteFinanceTransaction(params.transactionId!, params.id!, locals.user!.id);

	return ok({ deleted: true });
};
