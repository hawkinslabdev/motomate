import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('#lib/db/repositories/vehicles.js', () => ({
	getVehicleById: vi.fn()
}));
vi.mock('#lib/db/repositories/finance-transactions.js', () => ({
	getFinanceTransactionsByVehicle: vi.fn(),
	createFinanceTransaction: vi.fn(),
	getFinanceTransactionById: vi.fn(),
	deleteFinanceTransaction: vi.fn()
}));

import {
	GET as listTx,
	POST as createTx
} from '../../routes/api/v1/vehicles/[id]/finance/+server.js';
import { DELETE as deleteTx } from '../../routes/api/v1/vehicles/[id]/finance/[transactionId]/+server.js';
import { getVehicleById } from '#lib/db/repositories/vehicles.js';
import {
	getFinanceTransactionsByVehicle,
	createFinanceTransaction,
	getFinanceTransactionById,
	deleteFinanceTransaction
} from '#lib/db/repositories/finance-transactions.js';

const mockUser = { id: 'u_1', settings: { currency: 'EUR' } } as any;
const mockVehicle = { id: 'v_1', user_id: 'u_1', odometer_unit: 'km' } as any;
const mockTx = {
	id: 'ft_1',
	vehicle_id: 'v_1',
	amount_cents: 5000,
	category: 'fuel',
	performed_at: '2026-01-01',
	currency: 'EUR'
} as any;

function event(
	user = mockUser,
	params: Record<string, string> = {},
	body?: unknown,
	scope: 'read' | 'read_write' = 'read_write'
) {
	const isApiKeyAuth = scope === 'read';
	const url = new URL('http://localhost');
	const request = body
		? new Request('http://localhost', {
				method: 'POST',
				body: JSON.stringify(body),
				headers: { 'Content-Type': 'application/json' }
			})
		: new Request('http://localhost');
	return {
		locals: { user, session: null, isApiKeyAuth, apiKeyScope: scope },
		params,
		url,
		request
	} as any;
}

beforeEach(() => {
	vi.mocked(getVehicleById).mockResolvedValue(mockVehicle);
	vi.mocked(getFinanceTransactionsByVehicle).mockResolvedValue([mockTx]);
	vi.mocked(createFinanceTransaction).mockResolvedValue(mockTx);
	vi.mocked(getFinanceTransactionById).mockResolvedValue(mockTx);
	vi.mocked(deleteFinanceTransaction).mockResolvedValue(undefined);
});

describe('GET /vehicles/:id/finance', () => {
	it('returns transactions with total and total_cents', async () => {
		const res = await listTx(event(mockUser, { id: 'v_1' }));
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.data).toHaveLength(1);
		expect(body.total).toBe(1);
		expect(body.total_cents).toBe(5000);
	});

	it('sums total_cents across all records (not just page)', async () => {
		vi.mocked(getFinanceTransactionsByVehicle).mockResolvedValue([
			{ ...mockTx, amount_cents: 3000 },
			{ ...mockTx, id: 'ft_2', amount_cents: 2000 }
		] as any);
		const body = await (await listTx(event(mockUser, { id: 'v_1' }))).json();
		expect(body.total_cents).toBe(5000);
	});

	it('returns 404 when vehicle not found', async () => {
		vi.mocked(getVehicleById).mockResolvedValue(undefined);
		expect((await listTx(event(mockUser, { id: 'bad' }))).status).toBe(404);
	});

	it('returns 401 without user', async () => {
		expect((await listTx(event(null, { id: 'v_1' }))).status).toBe(401);
	});
});

describe('POST /vehicles/:id/finance', () => {
	const validBody = { category: 'fuel', amount_cents: 5000, performed_at: '2026-05-30' };

	it('creates transaction and returns 201', async () => {
		const res = await createTx(event(mockUser, { id: 'v_1' }, validBody));
		expect(res.status).toBe(201);
		expect(vi.mocked(createFinanceTransaction)).toHaveBeenCalled();
	});

	it('uses user currency from settings', async () => {
		await createTx(event(mockUser, { id: 'v_1' }, validBody));
		const call = vi.mocked(createFinanceTransaction).mock.calls[0][1];
		expect(call.currency).toBe('EUR');
	});

	it('returns 400 for missing required fields', async () => {
		const res = await createTx(event(mockUser, { id: 'v_1' }, { amount_cents: 100 }));
		expect(res.status).toBe(400);
	});

	it('returns 400 for non-JSON body', async () => {
		const req = new Request('http://localhost', {
			method: 'POST',
			body: 'bad',
			headers: { 'Content-Type': 'application/json' }
		});
		const res = await createTx({ ...event(mockUser, { id: 'v_1' }), request: req } as any);
		expect(res.status).toBe(400);
	});

	it('returns 403 for read-only key', async () => {
		expect((await createTx(event(mockUser, { id: 'v_1' }, validBody, 'read'))).status).toBe(403);
	});

	it('returns 401 without user', async () => {
		expect((await createTx(event(null, { id: 'v_1' }, validBody))).status).toBe(401);
	});
});

describe('DELETE /vehicles/:id/finance/:transactionId', () => {
	it('deletes and returns { deleted: true }', async () => {
		const res = await deleteTx(event(mockUser, { id: 'v_1', transactionId: 'ft_1' }));
		expect(res.status).toBe(200);
		expect((await res.json()).data.deleted).toBe(true);
		expect(vi.mocked(deleteFinanceTransaction)).toHaveBeenCalled();
	});

	it('returns 404 when transaction not found', async () => {
		vi.mocked(getFinanceTransactionById).mockResolvedValue(undefined);
		expect((await deleteTx(event(mockUser, { id: 'v_1', transactionId: 'bad' }))).status).toBe(404);
	});

	it('returns 403 for read-only key', async () => {
		expect(
			(await deleteTx(event(mockUser, { id: 'v_1', transactionId: 'ft_1' }, undefined, 'read')))
				.status
		).toBe(403);
	});

	it('returns 401 without user', async () => {
		expect((await deleteTx(event(null, { id: 'v_1', transactionId: 'ft_1' }))).status).toBe(401);
	});
});
