import { describe, it, expect, vi } from 'vitest';

vi.mock('$app/env/private', () => new Proxy({}, { has: () => true }));
vi.mock('$app/env/public', () => new Proxy({}, { has: () => true }));
vi.mock('#lib/auth/index.js', () => ({
	lucia: { createSession: vi.fn(), createSessionCookie: vi.fn() }
}));
vi.mock('#lib/db/repositories/users.js', () => ({
	getUserByEmail: vi.fn(async () => undefined),
	createUser: vi.fn(),
	updateUserSettings: vi.fn()
}));
vi.mock('#lib/auth/registration.js', () => ({ isRegistrationOpen: vi.fn(async () => false) }));
vi.mock('#lib/auth/magic-link.js', () => ({
	createMagicLinkToken: vi.fn(),
	sendMagicLinkEmail: vi.fn(),
	isSmtpConfigured: vi.fn(() => false)
}));
vi.mock('#lib/auth/altcha.js', () => ({ verifyAltcha: vi.fn(async () => true) }));

import { actions } from '../routes/(auth)/login/+page.server.js';

// Every request shares one client address, which is what a reverse proxy or tunnel looks like.
const PROXY_IP = '172.18.0.1';

function attempt(email: string) {
	const fd = new FormData();
	fd.append('email', email);
	fd.append('password', 'wrong-password');
	return actions.login!({
		request: { formData: async () => fd },
		cookies: { get: vi.fn(), set: vi.fn() },
		getClientAddress: () => PROXY_IP
	} as never) as Promise<{ status: number }>;
}

describe('login rate limiting behind a shared client address', () => {
	it('bounds guessing per account without locking other accounts out', async () => {
		const victim = 'victim@example.com';

		// Burn the victim's bucket: 10 allowed, the 11th is refused.
		for (let i = 0; i < 10; i++) {
			expect((await attempt(victim)).status).toBe(400);
		}
		expect((await attempt(victim)).status).toBe(429);

		// The instance is still usable by everyone else, which the old shared IP bucket prevented.
		expect((await attempt('someone-else@example.com')).status).toBe(400);
	});
});
