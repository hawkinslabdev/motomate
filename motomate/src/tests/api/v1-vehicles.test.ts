import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('#lib/db/repositories/vehicles.js', () => ({
	getVehiclesByUser: vi.fn(),
	getVehicleById: vi.fn(),
	recomputeCurrentOdometer: vi.fn(),
	getOdometerLogs: vi.fn(),
	insertOdometerLog: vi.fn(),
	deleteOdometerLog: vi.fn()
}));
vi.mock('#lib/db/repositories/maintenance.js', () => ({
	getTrackersByVehicle: vi.fn(),
	recomputeTrackerStatuses: vi.fn()
}));

import { GET as listVehicles } from '../../routes/api/v1/vehicles/+server.js';
import { GET as getVehicle } from '../../routes/api/v1/vehicles/[id]/+server.js';
import { getVehiclesByUser, getVehicleById } from '#lib/db/repositories/vehicles.js';

const mockUser = {
	id: 'u_1',
	email: 'a@b.com',
	settings: { currency: 'EUR', locale: 'en' }
} as any;
const mockVehicle = {
	id: 'v_1',
	user_id: 'u_1',
	name: 'CB500F',
	current_odometer: 10000,
	odometer_unit: 'km'
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
	vi.mocked(getVehiclesByUser).mockResolvedValue([mockVehicle]);
	vi.mocked(getVehicleById).mockResolvedValue(mockVehicle);
});

describe('GET /vehicles', () => {
	it('returns list of vehicles', async () => {
		const res = await listVehicles(event());
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.data).toHaveLength(1);
		expect(body.data[0].id).toBe('v_1');
	});

	it('calls getVehiclesByUser with userId and excludeArchived=false', async () => {
		await listVehicles(event());
		expect(vi.mocked(getVehiclesByUser)).toHaveBeenCalledWith('u_1', false);
	});

	it('returns 401 when unauthenticated', async () => {
		const res = await listVehicles(event(null));
		expect(res.status).toBe(401);
	});
});

describe('GET /vehicles/:id', () => {
	it('returns vehicle detail', async () => {
		const res = await getVehicle(event(mockUser, { id: 'v_1' }));
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.data.name).toBe('CB500F');
	});

	it('returns 404 when vehicle not found', async () => {
		vi.mocked(getVehicleById).mockResolvedValue(undefined);
		const res = await getVehicle(event(mockUser, { id: 'bad' }));
		expect(res.status).toBe(404);
	});

	it('returns 401 when unauthenticated', async () => {
		const res = await getVehicle(event(null, { id: 'v_1' }));
		expect(res.status).toBe(401);
	});
});
