import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('$lib/db/repositories/vehicles.js', () => ({ getVehicleById: vi.fn() }));
vi.mock('$lib/db/repositories/documents.js', () => ({
	getDocumentsByVehicle: vi.fn(),
	getDocumentsByVehicleTotal: vi.fn()
}));

import { GET } from '../../routes/api/v1/vehicles/[id]/documents/+server.js';
import { getVehicleById } from '$lib/db/repositories/vehicles.js';
import {
	getDocumentsByVehicle,
	getDocumentsByVehicleTotal
} from '$lib/db/repositories/documents.js';

const user = { id: 'u_1', settings: {} } as any;
const doc = {
	id: 'd_1',
	name: 'invoice.pdf',
	title: null,
	doc_type: 'service',
	mime_type: 'application/pdf',
	size_bytes: 1234,
	expires_at: null,
	created_at: '2026-01-01',
	storage_key: 'files/u_1/v_1/d_1.pdf'
} as any;

function event(params: Record<string, string>, u = user) {
	return {
		locals: { user: u, session: null, isApiKeyAuth: true, apiKeyScope: 'read' },
		params,
		url: new URL('http://localhost'),
		request: new Request('http://localhost')
	} as any;
}

beforeEach(() => {
	vi.mocked(getVehicleById).mockResolvedValue({ id: 'v_1', user_id: 'u_1' } as any);
	vi.mocked(getDocumentsByVehicle).mockResolvedValue([doc]);
	vi.mocked(getDocumentsByVehicleTotal).mockResolvedValue(1);
});

describe('GET /vehicles/:id/documents', () => {
	it('lists documents with mime type and file url', async () => {
		const res = await GET(event({ id: 'v_1' }));
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.total).toBe(1);
		expect(body.data[0].mime_type).toBe('application/pdf');
		expect(body.data[0].url).toBe('/api/files?key=files%2Fu_1%2Fv_1%2Fd_1.pdf');
		expect(body.data[0].storage_key).toBeUndefined();
	});

	it('returns 401 without user', async () => {
		expect((await GET(event({ id: 'v_1' }, null))).status).toBe(401);
	});

	it('returns 404 when vehicle not owned', async () => {
		vi.mocked(getVehicleById).mockResolvedValue(undefined);
		expect((await GET(event({ id: 'v_x' }))).status).toBe(404);
	});
});

describe('parsePage', () => {
	it('clamps garbage and negative values', async () => {
		const { parsePage } = await import('$lib/api/guards.js');
		expect(parsePage(new URL('http://x?limit=abc&offset=-5'))).toEqual({ limit: 50, offset: 0 });
		expect(parsePage(new URL('http://x?limit=9999&offset=3'))).toEqual({ limit: 200, offset: 3 });
	});
});
