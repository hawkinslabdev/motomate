import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('#lib/db/repositories/vehicles.js', () => ({
	getVehicleById: vi.fn(),
	recomputeCurrentOdometer: vi.fn()
}));
vi.mock('#lib/db/repositories/maintenance.js', () => ({
	getTrackersByVehicle: vi.fn(),
	recomputeTrackerStatuses: vi.fn()
}));

import { GET as listTrackers } from '../../routes/api/v1/vehicles/[id]/maintenance/+server.js';
import { getVehicleById, recomputeCurrentOdometer } from '#lib/db/repositories/vehicles.js';
import {
	getTrackersByVehicle,
	recomputeTrackerStatuses
} from '#lib/db/repositories/maintenance.js';

const mockUser = { id: 'u_1' } as any;
const mockVehicle = { id: 'v_1', user_id: 'u_1' } as any;
const mockTracker = {
	id: 't_1',
	vehicle_id: 'v_1',
	status: 'ok',
	template: { name: 'Oil change' }
} as any;

function event(user = mockUser, params: Record<string, string> = {}) {
	return {
		locals: { user, session: null },
		params,
		url: new URL('http://localhost'),
		request: new Request('http://localhost')
	} as any;
}

beforeEach(() => {
	vi.mocked(getVehicleById).mockResolvedValue(mockVehicle);
	vi.mocked(recomputeCurrentOdometer).mockResolvedValue(10000);
	vi.mocked(recomputeTrackerStatuses).mockResolvedValue([]);
	vi.mocked(getTrackersByVehicle).mockResolvedValue([mockTracker]);
});

describe('GET /vehicles/:id/maintenance', () => {
	it('returns tracker list', async () => {
		const res = await listTrackers(event(mockUser, { id: 'v_1' }));
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.data).toHaveLength(1);
		expect(body.data[0].id).toBe('t_1');
	});

	it('recomputes statuses before returning', async () => {
		await listTrackers(event(mockUser, { id: 'v_1' }));
		expect(vi.mocked(recomputeCurrentOdometer)).toHaveBeenCalledWith('v_1', 'u_1');
		expect(vi.mocked(recomputeTrackerStatuses)).toHaveBeenCalledWith('v_1', 10000);
	});

	it('returns 404 when vehicle not found', async () => {
		vi.mocked(getVehicleById).mockResolvedValue(undefined);
		expect((await listTrackers(event(mockUser, { id: 'bad' }))).status).toBe(404);
	});

	it('returns 401 without user', async () => {
		expect((await listTrackers(event(null, { id: 'v_1' }))).status).toBe(401);
	});
});
