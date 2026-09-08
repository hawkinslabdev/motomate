import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('$lib/server/download-token.js', () => ({
	createDownloadToken: vi.fn(),
	tokenExpiresAt: vi.fn()
}));

vi.mock('$env/dynamic/private', () => ({
	env: { DATABASE_URL: ':memory:' }
}));

vi.mock('$env/dynamic/public', () => ({
	env: { PUBLIC_APP_URL: 'http://localhost:5173' }
}));

import { GET as getMe } from '../../routes/api/v1/me/+server.js';
import { GET as getDownload } from '../../routes/api/v1/me/download/+server.js';
import { createDownloadToken, tokenExpiresAt } from '$lib/server/download-token.js';

const mockUser = {
	id: 'u_1',
	email: 'rider@test.com',
	password_hash: 'hashed',
	timezone: 'Europe/Amsterdam',
	locale: 'en',
	onboarding_done: true,
	settings: { theme: 'system', currency: 'EUR', odometer_unit: 'km', locale: 'en' },
	created_at: '2026-01-01 00:00:00',
	updated_at: '2026-01-01 00:00:00'
};

function event(user: typeof mockUser | null = mockUser, searchParams: Record<string, string> = {}) {
	const url = new URL('http://localhost/api/v1/me');
	for (const [k, v] of Object.entries(searchParams)) url.searchParams.set(k, v);
	return {
		locals: { user, session: null },
		url,
		params: {},
		request: new Request('http://localhost')
	} as any;
}

describe('GET /me', () => {
	it('returns profile without password_hash', async () => {
		const res = await getMe(event());
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.data.email).toBe('rider@test.com');
		expect(body.data).not.toHaveProperty('password_hash');
	});

	it('returns 401 when unauthenticated', async () => {
		const res = await getMe(event(null));
		expect(res.status).toBe(401);
	});
});

describe('GET /me/download', () => {
	beforeEach(() => {
		vi.mocked(createDownloadToken).mockReturnValue('signed.token');
		vi.mocked(tokenExpiresAt).mockReturnValue('2026-05-31T10:00:00.000Z');
	});

	it('returns download url with json format by default', async () => {
		const res = await getDownload(event());
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.data.format).toBe('json');
		expect(body.data.url).toContain('signed.token');
		expect(body.data.expires_at).toBe('2026-05-31T10:00:00.000Z');
	});

	it('passes zip format when requested', async () => {
		await getDownload(event(mockUser, { format: 'zip' }));
		expect(vi.mocked(createDownloadToken)).toHaveBeenCalledWith('u_1', 'zip');
	});

	it('defaults to json for unknown format', async () => {
		await getDownload(event(mockUser, { format: 'csv' }));
		expect(vi.mocked(createDownloadToken)).toHaveBeenCalledWith('u_1', 'json');
	});

	it('returns 401 when unauthenticated', async () => {
		const res = await getDownload(event(null));
		expect(res.status).toBe(401);
	});
});
