import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('#lib/db/repositories/vehicles.js', () => ({
	getVehicleById: vi.fn(),
	recomputeCurrentOdometer: vi.fn(),
	getOdometerLogs: vi.fn(),
	insertOdometerLog: vi.fn(),
	deleteOdometerLog: vi.fn()
}));
vi.mock('#lib/db/repositories/maintenance.js', () => ({
	recomputeTrackerStatuses: vi.fn()
}));

import {
	GET as listOdo,
	POST as addOdo
} from '../../routes/api/v1/vehicles/[id]/odometer/+server.js';
import { DELETE as deleteOdo } from '../../routes/api/v1/vehicles/[id]/odometer/[logId]/+server.js';
import {
	getVehicleById,
	recomputeCurrentOdometer,
	getOdometerLogs,
	insertOdometerLog,
	deleteOdometerLog
} from '#lib/db/repositories/vehicles.js';
import { recomputeTrackerStatuses } from '#lib/db/repositories/maintenance.js';

const mockUser = { id: 'u_1', settings: {} } as any;
const mockVehicle = { id: 'v_1', user_id: 'u_1', odometer_unit: 'km' } as any;
const mockLog = {
	id: 'ol_1',
	vehicle_id: 'v_1',
	odometer: 10000,
	recorded_at: '2026-01-01'
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
	vi.mocked(recomputeCurrentOdometer).mockResolvedValue(10500);
	vi.mocked(recomputeTrackerStatuses).mockResolvedValue([]);
	vi.mocked(getOdometerLogs).mockResolvedValue([mockLog]);
	vi.mocked(insertOdometerLog).mockResolvedValue(undefined);
	vi.mocked(deleteOdometerLog).mockResolvedValue(undefined);
});

describe('GET /vehicles/:id/odometer', () => {
	it('returns odometer log list with total', async () => {
		const res = await listOdo(event(mockUser, { id: 'v_1' }));
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.data).toHaveLength(1);
		expect(body.total).toBe(1);
	});

	it('returns 404 when vehicle not found', async () => {
		vi.mocked(getVehicleById).mockResolvedValue(undefined);
		expect((await listOdo(event(mockUser, { id: 'bad' }))).status).toBe(404);
	});

	it('returns 401 without user', async () => {
		expect((await listOdo(event(null, { id: 'v_1' }))).status).toBe(401);
	});
});

describe('POST /vehicles/:id/odometer', () => {
	const validBody = { odometer: 10500, recorded_at: '2026-05-30' };

	it('records reading and returns 201 with new odometer', async () => {
		const res = await addOdo(event(mockUser, { id: 'v_1' }, validBody));
		expect(res.status).toBe(201);
		const body = await res.json();
		expect(body.data.odometer).toBe(10500);
	});

	it('calls recompute after insertion', async () => {
		await addOdo(event(mockUser, { id: 'v_1' }, validBody));
		expect(vi.mocked(recomputeCurrentOdometer)).toHaveBeenCalled();
		expect(vi.mocked(recomputeTrackerStatuses)).toHaveBeenCalled();
	});

	it('returns 400 for missing required fields', async () => {
		const res = await addOdo(event(mockUser, { id: 'v_1' }, { odometer: 10500 }));
		expect(res.status).toBe(400);
	});

	it('returns 400 for invalid date format', async () => {
		const res = await addOdo(
			event(mockUser, { id: 'v_1' }, { odometer: 10500, recorded_at: '30-05-2026' })
		);
		expect(res.status).toBe(400);
	});

	it('returns 400 for non-JSON body', async () => {
		const req = new Request('http://localhost', {
			method: 'POST',
			body: '{{',
			headers: { 'Content-Type': 'application/json' }
		});
		const res = await addOdo({ ...event(mockUser, { id: 'v_1' }), request: req } as any);
		expect(res.status).toBe(400);
	});

	it('returns 403 for read-only key', async () => {
		expect((await addOdo(event(mockUser, { id: 'v_1' }, validBody, 'read'))).status).toBe(403);
	});

	it('returns 401 without user', async () => {
		expect((await addOdo(event(null, { id: 'v_1' }, validBody))).status).toBe(401);
	});
});

describe('DELETE /vehicles/:id/odometer/:logId', () => {
	it('deletes and returns { deleted: true }', async () => {
		const res = await deleteOdo(event(mockUser, { id: 'v_1', logId: 'ol_1' }));
		expect(res.status).toBe(200);
		expect((await res.json()).data.deleted).toBe(true);
		expect(vi.mocked(deleteOdometerLog)).toHaveBeenCalled();
	});

	it('recomputes after deletion', async () => {
		await deleteOdo(event(mockUser, { id: 'v_1', logId: 'ol_1' }));
		expect(vi.mocked(recomputeCurrentOdometer)).toHaveBeenCalled();
		expect(vi.mocked(recomputeTrackerStatuses)).toHaveBeenCalled();
	});

	it('returns 404 when vehicle not found', async () => {
		vi.mocked(getVehicleById).mockResolvedValue(undefined);
		expect((await deleteOdo(event(mockUser, { id: 'bad', logId: 'ol_1' }))).status).toBe(404);
	});

	it('returns 403 for read-only key', async () => {
		expect(
			(await deleteOdo(event(mockUser, { id: 'v_1', logId: 'ol_1' }, undefined, 'read'))).status
		).toBe(403);
	});

	it('returns 401 without user', async () => {
		expect((await deleteOdo(event(null, { id: 'v_1', logId: 'ol_1' }))).status).toBe(401);
	});
});
