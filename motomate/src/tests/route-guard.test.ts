import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock(
	'$app/env/private',
	() =>
		new Proxy(new Proxy({}, { get: (_, k: string) => process.env[k] ?? 'x'.repeat(32) }), {
			has: () => true
		})
);
vi.mock('$app/env/public', () => new Proxy({}, { has: () => true }));
vi.mock('#lib/auth/index.js', () => ({
	lucia: {
		sessionCookieName: 'session',
		validateSession: vi.fn(async () => ({
			session: { id: 's1', fresh: false },
			user: { id: 'u1', settings: {} }
		}))
	}
}));
vi.mock('#lib/server/scheduler.js', () => ({ initScheduler: vi.fn() }));
vi.mock('#lib/db/repositories/api-keys.js', () => ({
	findUserByApiKey: vi.fn(),
	updateKeyLastUsed: vi.fn()
}));
vi.mock('#lib/server/secrets.js', () => ({ redactCredentials: (u: unknown) => u }));
vi.mock('#lib/db/repositories/vehicles.js', () => ({ getVehicleById: vi.fn() }));

import { getVehicleById } from '#lib/db/repositories/vehicles.js';
import { handle } from '../hooks.server.js';

const resolve = vi.fn(async () => new Response('ok'));

function run(opts: {
	method?: string;
	path: string;
	routeId: string | null;
	session?: boolean;
	params?: Record<string, string>;
}) {
	const url = new URL(`https://moto.example.com${opts.path}`);
	const event = {
		url,
		request: new Request(url, {
			method: opts.method ?? 'GET',
			headers: { origin: 'https://moto.example.com' }
		}),
		cookies: { get: () => (opts.session ? 'sid' : undefined), set: vi.fn(), delete: vi.fn() },
		route: { id: opts.routeId },
		params: opts.params ?? {},
		locals: {} as Record<string, unknown>
	};
	return handle({ event: event as never, resolve: resolve as never });
}

const TRACKER_ACTION = {
	method: 'POST',
	path: '/vehicles/v1/maintenance?/deleteTracker',
	routeId: '/(app)/vehicles/[id]/maintenance',
	params: { id: 'v1' }
};

beforeEach(() => {
	resolve.mockClear();
	vi.mocked(getVehicleById).mockReset();
});

describe('anonymous requests', () => {
	it('rejects an app form action', async () => {
		const res = await run(TRACKER_ACTION);
		expect(res.status).toBe(401);
		expect(resolve).not.toHaveBeenCalled();
	});

	it('redirects an app page to login', async () => {
		const res = await run({ ...TRACKER_ACTION, method: 'GET' });
		expect(res.status).toBe(303);
		expect(res.headers.get('location')).toBe('/login');
	});

	it('rejects an api route with json', async () => {
		const res = await run({ path: '/api/files?key=x', routeId: '/api/files' });
		expect(res.status).toBe(401);
		expect(await res.json()).toMatchObject({ code: 'UNAUTHORIZED' });
	});

	it('lets public routes through', async () => {
		for (const routeId of ['/(auth)/login', '/api/altcha', '/api/download/[token]']) {
			await run({ path: '/x', routeId });
		}
		expect(resolve).toHaveBeenCalledTimes(3);
	});
});

describe('vehicle scoped routes', () => {
	it('rejects a user who does not own the vehicle', async () => {
		vi.mocked(getVehicleById).mockResolvedValue(undefined);
		await expect(run({ ...TRACKER_ACTION, session: true })).rejects.toMatchObject({
			status: 404
		});
		expect(getVehicleById).toHaveBeenCalledWith('v1', 'u1');
		expect(resolve).not.toHaveBeenCalled();
	});

	it('lets the owner through', async () => {
		vi.mocked(getVehicleById).mockResolvedValue({ id: 'v1' } as never);
		await run({ ...TRACKER_ACTION, session: true });
		expect(resolve).toHaveBeenCalledOnce();
	});

	it('does not look up a vehicle on other routes', async () => {
		await run({ path: '/vehicles/new', routeId: '/(app)/vehicles/new', session: true });
		expect(getVehicleById).not.toHaveBeenCalled();
		expect(resolve).toHaveBeenCalledOnce();
	});
});
