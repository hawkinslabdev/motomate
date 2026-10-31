import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock(
	'$app/env/private',
	() =>
		new Proxy(new Proxy({}, { get: (_, k: string) => process.env[k] ?? 'x'.repeat(32) }), {
			has: () => true
		})
);
vi.mock('$app/env/public', () => new Proxy({}, { has: () => true }));
vi.mock('#lib/auth/index.js', () => ({ lucia: { sessionCookieName: 'session' } }));
vi.mock('#lib/server/scheduler.js', () => ({ initScheduler: vi.fn() }));
vi.mock('#lib/db/repositories/api-keys.js', () => ({
	findUserByApiKey: vi.fn(),
	updateKeyLastUsed: vi.fn()
}));
vi.mock('#lib/db/repositories/vehicles.js', () => ({ getVehicleById: vi.fn() }));
vi.mock('#lib/server/secrets.js', () => ({ redactCredentials: (u: unknown) => u }));

import { isOriginTrusted } from '../hooks.server.js';

const APP = 'https://moto.example.com/vehicles/v1';

describe('isOriginTrusted', () => {
	beforeEach(() => {
		delete process.env.PUBLIC_APP_ORIGINS;
	});

	it('trusts the origin the request was served on', () => {
		expect(isOriginTrusted('https://moto.example.com', null, APP)).toBe(true);
	});

	it('trusts it through a TLS-terminating proxy, where the server only sees http', () => {
		expect(isOriginTrusted('https://moto.example.com', null, 'http://moto.example.com/x')).toBe(
			true
		);
	});

	it('rejects a sibling subdomain, which SameSite=Lax would let through', () => {
		expect(isOriginTrusted('https://evil.example.com', null, APP)).toBe(false);
	});

	it('rejects an unrelated origin', () => {
		expect(isOriginTrusted('https://evil.test', null, APP)).toBe(false);
	});

	// Fail closed: the old behaviour allowed everything when PUBLIC_APP_ORIGINS was unset.
	it.each([null, 'null', 'undefined', 'not a url'])('rejects origin %s with no referer', (o) => {
		expect(isOriginTrusted(o, null, APP)).toBe(false);
	});

	it('falls back to the referer when the origin header is absent', () => {
		expect(isOriginTrusted(null, 'https://moto.example.com/dashboard', APP)).toBe(true);
		expect(isOriginTrusted(null, 'https://evil.test/x', APP)).toBe(false);
	});

	it('trusts extra hostnames from PUBLIC_APP_ORIGINS', () => {
		process.env.PUBLIC_APP_ORIGINS = 'http://localhost,moto.lan';
		expect(isOriginTrusted('http://localhost:3000', null, APP)).toBe(true);
		expect(isOriginTrusted('https://moto.lan', null, APP)).toBe(true);
		expect(isOriginTrusted('https://evil.test', null, APP)).toBe(false);
	});

	it('ignores empty entries in PUBLIC_APP_ORIGINS', () => {
		process.env.PUBLIC_APP_ORIGINS = ',,';
		expect(isOriginTrusted('https://evil.test', null, APP)).toBe(false);
		expect(isOriginTrusted('https://moto.example.com', null, APP)).toBe(true);
	});
});
