import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('#lib/db/repositories/vehicles.js', () => ({
	getVehicleById: vi.fn(),
	recomputeCurrentOdometer: vi.fn()
}));
vi.mock('#lib/db/repositories/service-logs.js', () => ({
	getServiceLogsByVehicle: vi.fn(),
	createServiceLog: vi.fn(),
	getServiceLogById: vi.fn(),
	deleteServiceLog: vi.fn()
}));
vi.mock('#lib/db/repositories/maintenance.js', () => ({
	recomputeTrackerStatuses: vi.fn()
}));
vi.mock('#lib/workflow/engine.js', () => ({
	runWorkflowChecks: vi.fn().mockReturnValue(Promise.resolve({}))
}));

import {
	GET as listLogs,
	POST as createLog
} from '../../routes/api/v1/vehicles/[id]/service-logs/+server.js';
import {
	GET as getLog,
	DELETE as deleteLog
} from '../../routes/api/v1/vehicles/[id]/service-logs/[logId]/+server.js';
import { getVehicleById, recomputeCurrentOdometer } from '#lib/db/repositories/vehicles.js';
import {
	getServiceLogsByVehicle,
	createServiceLog,
	getServiceLogById,
	deleteServiceLog
} from '#lib/db/repositories/service-logs.js';
import { recomputeTrackerStatuses } from '#lib/db/repositories/maintenance.js';

const mockUser = { id: 'u_1', settings: { currency: 'EUR', locale: 'en' } } as any;
const mockVehicle = {
	id: 'v_1',
	user_id: 'u_1',
	current_odometer: 10000,
	odometer_unit: 'km'
} as any;
const mockLog = {
	id: 'sl_1',
	vehicle_id: 'v_1',
	performed_at: '2026-01-01',
	odometer_at_service: 10000
} as any;

function event(
	user = mockUser,
	params: Record<string, string> = {},
	body?: unknown,
	scope: 'read' | 'read_write' = 'read_write'
) {
	const isApiKeyAuth = scope === 'read';
	const request = body
		? new Request('http://localhost', {
				method: 'POST',
				body: JSON.stringify(body),
				headers: { 'Content-Type': 'application/json' }
			})
		: new Request('http://localhost');
	const url = new URL('http://localhost');
	return {
		locals: { user, session: null, isApiKeyAuth, apiKeyScope: scope },
		params,
		url,
		request
	} as any;
}

beforeEach(() => {
	vi.mocked(getVehicleById).mockResolvedValue(mockVehicle);
	vi.mocked(recomputeCurrentOdometer).mockResolvedValue(10000);
	vi.mocked(recomputeTrackerStatuses).mockResolvedValue([]);
	vi.mocked(getServiceLogsByVehicle).mockResolvedValue([mockLog]);
	vi.mocked(createServiceLog).mockResolvedValue(mockLog);
	vi.mocked(getServiceLogById).mockResolvedValue(mockLog);
	vi.mocked(deleteServiceLog).mockResolvedValue(undefined);
});

describe('GET /vehicles/:id/service-logs', () => {
	it('returns list with total', async () => {
		const res = await listLogs(event(mockUser, { id: 'v_1' }));
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.data).toHaveLength(1);
		expect(body.total).toBe(1);
	});

	it('paginates with limit and offset', async () => {
		vi.mocked(getServiceLogsByVehicle).mockResolvedValue([mockLog, mockLog, mockLog]);
		const url = new URL('http://localhost?limit=2&offset=1');
		const res = await listLogs({ ...event(mockUser, { id: 'v_1' }), url } as any);
		const body = await res.json();
		expect(body.data).toHaveLength(2);
		expect(body.total).toBe(3);
	});

	it('returns 404 when vehicle not found', async () => {
		vi.mocked(getVehicleById).mockResolvedValue(undefined);
		expect((await listLogs(event(mockUser, { id: 'bad' }))).status).toBe(404);
	});

	it('returns 401 without user', async () => {
		expect((await listLogs(event(null, { id: 'v_1' }))).status).toBe(401);
	});
});

describe('POST /vehicles/:id/service-logs', () => {
	const validBody = { performed_at: '2026-05-30', odometer_at_service: 10500 };

	it('creates log and returns 201', async () => {
		const res = await createLog(event(mockUser, { id: 'v_1' }, validBody));
		expect(res.status).toBe(201);
		expect(vi.mocked(createServiceLog)).toHaveBeenCalled();
	});

	it('calls recompute + tracker statuses after creation', async () => {
		await createLog(event(mockUser, { id: 'v_1' }, validBody));
		expect(vi.mocked(recomputeCurrentOdometer)).toHaveBeenCalled();
		expect(vi.mocked(recomputeTrackerStatuses)).toHaveBeenCalled();
	});

	it('returns 400 for invalid body (missing required fields)', async () => {
		const res = await createLog(event(mockUser, { id: 'v_1' }, { odometer_at_service: 100 }));
		expect(res.status).toBe(400);
	});

	it('returns 400 for non-JSON body', async () => {
		const req = new Request('http://localhost', {
			method: 'POST',
			body: 'not-json',
			headers: { 'Content-Type': 'application/json' }
		});
		const res = await createLog({ ...event(mockUser, { id: 'v_1' }), request: req } as any);
		expect(res.status).toBe(400);
	});

	it('returns 403 for read-only key', async () => {
		const res = await createLog(event(mockUser, { id: 'v_1' }, validBody, 'read'));
		expect(res.status).toBe(403);
	});

	it('returns 401 without user', async () => {
		expect((await createLog(event(null, { id: 'v_1' }, validBody))).status).toBe(401);
	});
});

describe('GET /vehicles/:id/service-logs/:logId', () => {
	it('returns the log', async () => {
		const res = await getLog(event(mockUser, { id: 'v_1', logId: 'sl_1' }));
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.data.id).toBe('sl_1');
	});

	it('returns 404 when log belongs to different vehicle', async () => {
		vi.mocked(getServiceLogById).mockResolvedValue({ ...mockLog, vehicle_id: 'v_other' } as any);
		const res = await getLog(event(mockUser, { id: 'v_1', logId: 'sl_1' }));
		expect(res.status).toBe(404);
	});

	it('returns 404 when log not found', async () => {
		vi.mocked(getServiceLogById).mockResolvedValue(undefined);
		expect((await getLog(event(mockUser, { id: 'v_1', logId: 'bad' }))).status).toBe(404);
	});

	it('returns 401 without user', async () => {
		expect((await getLog(event(null, { id: 'v_1', logId: 'sl_1' }))).status).toBe(401);
	});
});

describe('DELETE /vehicles/:id/service-logs/:logId', () => {
	it('deletes and returns { deleted: true }', async () => {
		const res = await deleteLog(event(mockUser, { id: 'v_1', logId: 'sl_1' }));
		expect(res.status).toBe(200);
		expect((await res.json()).data.deleted).toBe(true);
		expect(vi.mocked(deleteServiceLog)).toHaveBeenCalled();
	});

	it('recomputes after deletion', async () => {
		await deleteLog(event(mockUser, { id: 'v_1', logId: 'sl_1' }));
		expect(vi.mocked(recomputeCurrentOdometer)).toHaveBeenCalled();
		expect(vi.mocked(recomputeTrackerStatuses)).toHaveBeenCalled();
	});

	it('returns 404 when log not found', async () => {
		vi.mocked(getServiceLogById).mockResolvedValue(undefined);
		expect((await deleteLog(event(mockUser, { id: 'v_1', logId: 'bad' }))).status).toBe(404);
	});

	it('returns 403 for read-only key', async () => {
		expect(
			(await deleteLog(event(mockUser, { id: 'v_1', logId: 'sl_1' }, undefined, 'read'))).status
		).toBe(403);
	});

	it('returns 401 without user', async () => {
		expect((await deleteLog(event(null, { id: 'v_1', logId: 'sl_1' }))).status).toBe(401);
	});
});
