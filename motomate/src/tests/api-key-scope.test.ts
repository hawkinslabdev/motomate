import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('$env/dynamic/private', () => ({
	env: new Proxy({}, { get: (_: unknown, k: string) => process.env[k] ?? 'x'.repeat(32) })
}));
vi.mock('$env/dynamic/public', () => ({ env: {} }));
vi.mock('$lib/auth/index.js', () => ({
	lucia: {
		sessionCookieName: 'session',
		validateSession: vi.fn(async () => ({ session: null, user: null })),
		createBlankSessionCookie: () => ({ name: 'session', value: '', attributes: {} })
	}
}));
vi.mock('$lib/server/scheduler.js', () => ({ initScheduler: vi.fn() }));
vi.mock('$lib/db/repositories/api-keys.js', () => ({
	findUserByApiKey: vi.fn(),
	updateKeyLastUsed: vi.fn(async () => {})
}));
vi.mock('$lib/db/repositories/users.js', () => ({ hasAnyUser: vi.fn(async () => true) }));
vi.mock('$lib/server/secrets.js', () => ({ redactCredentials: (u: unknown) => u }));

import { handle } from '../hooks.server.js';
import { findUserByApiKey } from '$lib/db/repositories/api-keys.js';

const KEY = 'mm_' + 'a'.repeat(64);
const user = { id: 'u_1', email: 'rider@test.com', settings: {} };

function call(pathname: string, method = 'GET') {
	const url = new URL(`https://moto.example.com${pathname}`);
	const locals: Record<string, unknown> = {};
	const event = {
		url,
		locals,
		cookies: { get: () => undefined, set: vi.fn() },
		request: new Request(url, {
			method,
			headers: { authorization: `Bearer ${KEY}`, origin: 'https://moto.example.com' }
		})
	} as never;
	return { event, locals, run: () => handle({ event, resolve: async () => new Response('ok') }) };
}

function grant(scope: 'read' | 'write') {
	vi.mocked(findUserByApiKey).mockResolvedValue({ user, keyId: 'k_1', scope } as never);
}

describe('API key scope enforcement in hooks', () => {
	beforeEach(() => {
		vi.mocked(findUserByApiKey).mockReset();
		delete process.env.PUBLIC_APP_ORIGINS;
	});

	it('authenticates a read key on a GET under /api/', async () => {
		grant('read');
		const c = call('/api/v1/vehicles');
		expect((await c.run()).status).toBe(200);
		expect(c.locals.user).toEqual(user);
	});

	it('rejects a read key that tries to mutate, on a route with no scope guard of its own', async () => {
		grant('read');
		const res = await call('/api/prefs', 'PATCH').run();
		expect(res.status).toBe(403);
		expect(await res.json()).toMatchObject({ code: 'FORBIDDEN' });
	});

	it('lets a write key mutate under /api/', async () => {
		grant('write');
		const c = call('/api/prefs', 'PATCH');
		expect((await c.run()).status).toBe(200);
		expect(c.locals.user).toEqual(user);
	});

	it('never authenticates a key outside /api/, so form actions stay session-only', async () => {
		grant('write');
		const c = call('/settings/account', 'POST');
		const res = await c.run();
		expect(c.locals.user).toBeFalsy();
		expect(findUserByApiKey).not.toHaveBeenCalled();
		// falls through to the origin check, then to Lucia, with no session cookie present
		expect(res.status).toBe(200);
	});
});
