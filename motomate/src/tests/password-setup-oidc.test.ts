import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('$env/dynamic/private', () => ({ env: {} }));
vi.mock('$env/dynamic/public', () => ({ env: {} }));
vi.mock('$lib/auth/index.js', () => ({
	lucia: {
		invalidateUserSessions: vi.fn(async () => {}),
		createSession: vi.fn(async () => ({ id: 's_new' })),
		createSessionCookie: () => ({ name: 'session', value: 's_new', attributes: {} })
	}
}));
vi.mock('$lib/db/repositories/users.js', () => ({
	getUserById: vi.fn(),
	getUserByEmail: vi.fn(),
	updateUserEmail: vi.fn(),
	updateUserPassword: vi.fn(async () => {}),
	updateUserSettings: vi.fn(async () => {}),
	deleteUser: vi.fn()
}));

import { actions } from '../routes/(app)/settings/account/+page.server.js';
import { getUserById, updateUserPassword, updateUserSettings } from '$lib/db/repositories/users.js';
import { hash } from '@node-rs/argon2';

const ARGON2_OPTS = { memoryCost: 19456, timeCost: 2, outputLen: 32, parallelism: 1 };
const openWindow = () => new Date(Date.now() + 60_000).toISOString();
const closedWindow = () => new Date(Date.now() - 60_000).toISOString();

function event(fields: Record<string, string>) {
	const body = new URLSearchParams(fields);
	return {
		request: new Request('http://localhost/settings/account?/changePassword', {
			method: 'POST',
			headers: { 'content-type': 'application/x-www-form-urlencoded' },
			body
		}),
		locals: { user: { id: 'u_1', settings: { locale: 'en' } }, session: { id: 's_1' } },
		cookies: { set: vi.fn(), get: vi.fn() }
	} as never;
}

const NEW = { new_password: 'a-brand-new-secret', confirm_password: 'a-brand-new-secret' };

describe('changePassword for an account with no stored hash', () => {
	beforeEach(() => vi.clearAllMocks());

	it('sets a first password during an open reset window', async () => {
		vi.mocked(getUserById).mockResolvedValue({
			id: 'u_1',
			password_hash: null,
			settings: { oidc_sub: 'idp-subject-1', reauth_until: openWindow() }
		} as never);

		const result = await actions.changePassword(event(NEW));

		expect(result).toEqual({ savedPassword: true });
		expect(updateUserPassword).toHaveBeenCalledWith('u_1', expect.any(String));
		expect(updateUserSettings).toHaveBeenCalledWith('u_1', { reauth_until: null });
	});

	it('refuses without a window, so a session alone cannot mint a local password', async () => {
		vi.mocked(getUserById).mockResolvedValue({
			id: 'u_1',
			password_hash: null,
			settings: { oidc_sub: 'idp-subject-1', reauth_until: closedWindow() }
		} as never);

		const result = (await actions.changePassword(event(NEW))) as { status: number; data: unknown };

		expect(result.status).toBe(400);
		expect(updateUserPassword).not.toHaveBeenCalled();
	});

	it('does not throw comparing the new password against a null hash', async () => {
		vi.mocked(getUserById).mockResolvedValue({
			id: 'u_1',
			password_hash: null,
			settings: { reauth_until: openWindow() }
		} as never);

		await expect(actions.changePassword(event(NEW))).resolves.toEqual({ savedPassword: true });
	});

	it('still rejects reusing the current password when one is stored', async () => {
		vi.mocked(getUserById).mockResolvedValue({
			id: 'u_1',
			password_hash: await hash('a-brand-new-secret', ARGON2_OPTS),
			settings: { reauth_until: openWindow() }
		} as never);

		const result = (await actions.changePassword(event(NEW))) as { status: number };

		expect(result.status).toBe(400);
		expect(updateUserPassword).not.toHaveBeenCalled();
	});
});
