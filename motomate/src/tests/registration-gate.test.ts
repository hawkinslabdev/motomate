import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock(
	'$app/env/private',
	() => new Proxy(new Proxy({}, { get: (_, k: string) => process.env[k] }), { has: () => true })
);

vi.mock('#lib/db/repositories/users.js', () => ({
	hasAnyUser: vi.fn()
}));

import { isRegistrationOpen } from '#lib/auth/registration.js';
import { hasAnyUser } from '#lib/db/repositories/users.js';

describe('isRegistrationOpen', () => {
	beforeEach(() => {
		delete process.env.AUTH_ALLOW_REGISTRATION;
		vi.mocked(hasAnyUser).mockReset();
	});

	it('closed when AUTH_ALLOW_REGISTRATION is unset and users exist', async () => {
		vi.mocked(hasAnyUser).mockResolvedValue(true);
		expect(await isRegistrationOpen()).toBe(false);
	});

	it('open when AUTH_ALLOW_REGISTRATION=true', async () => {
		process.env.AUTH_ALLOW_REGISTRATION = 'true';
		expect(await isRegistrationOpen()).toBe(true);
	});

	it('closed when AUTH_ALLOW_REGISTRATION=false and users exist', async () => {
		process.env.AUTH_ALLOW_REGISTRATION = 'false';
		vi.mocked(hasAnyUser).mockResolvedValue(true);
		expect(await isRegistrationOpen()).toBe(false);
	});

	// Onboarding must never be blocked by configuration: an empty database always registers.
	it.each([undefined, 'false', 'FALSE', '', '0', 'no', 'garbage'])(
		'open on an empty database with AUTH_ALLOW_REGISTRATION=%s',
		async (value) => {
			if (value === undefined) delete process.env.AUTH_ALLOW_REGISTRATION;
			else process.env.AUTH_ALLOW_REGISTRATION = value;
			vi.mocked(hasAnyUser).mockResolvedValue(false);
			expect(await isRegistrationOpen()).toBe(true);
		}
	);

	it('hasAnyUser not called when registration is explicitly enabled', async () => {
		process.env.AUTH_ALLOW_REGISTRATION = 'true';
		await isRegistrationOpen();
		expect(hasAnyUser).not.toHaveBeenCalled();
	});
});
