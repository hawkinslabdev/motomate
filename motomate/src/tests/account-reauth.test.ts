import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('$env/dynamic/private', () => ({ env: {} }));
vi.mock('$env/dynamic/public', () => ({ env: {} }));
vi.mock('$lib/auth/index.js', () => ({
	lucia: {
		invalidateSession: vi.fn(async () => {}),
		invalidateUserSessions: vi.fn(async () => {}),
		createSession: vi.fn(async () => ({ id: 's_new' })),
		createSessionCookie: () => ({ name: 'session', value: 's_new', attributes: {} })
	}
}));
vi.mock('$lib/db/repositories/users.js', () => ({
	getUserById: vi.fn(),
	getUserByEmail: vi.fn(async () => undefined),
	updateUserEmail: vi.fn(async () => {}),
	updateUserPassword: vi.fn(),
	updateUserSettings: vi.fn(),
	deleteUser: vi.fn(async () => {})
}));

import { actions } from '../routes/(app)/settings/account/+page.server.js';
import { getUserById, updateUserEmail, deleteUser } from '$lib/db/repositories/users.js';
import { hash } from '@node-rs/argon2';

const ARGON2_OPTS = { memoryCost: 19456, timeCost: 2, outputLen: 32, parallelism: 1 };
const PASSWORD = 'the-real-password';

function event(fields: Record<string, string>) {
	return {
		request: new Request('http://localhost/settings/account', {
			method: 'POST',
			headers: { 'content-type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams(fields)
		}),
		locals: {
			user: { id: 'u_1', email: 'rider@test.com', settings: { locale: 'en' } },
			session: { id: 's_1' }
		},
		cookies: { set: vi.fn(), get: vi.fn() }
	} as never;
}

async function localAccount() {
	return { id: 'u_1', password_hash: await hash(PASSWORD, ARGON2_OPTS), settings: {} };
}

describe('re-authentication on account changes', () => {
	beforeEach(() => vi.clearAllMocks());

	it('changes the email when the password is correct', async () => {
		vi.mocked(getUserById).mockResolvedValue((await localAccount()) as never);

		const result = await actions.changeEmail(
			event({ email: 'new@test.com', current_password: PASSWORD })
		);

		expect(result).toEqual({ savedEmail: true });
		expect(updateUserEmail).toHaveBeenCalledWith('u_1', 'new@test.com');
	});

	it('refuses the email change on a wrong password, before probing whether the address is taken', async () => {
		vi.mocked(getUserById).mockResolvedValue((await localAccount()) as never);

		const result = (await actions.changeEmail(
			event({ email: 'new@test.com', current_password: 'wrong' })
		)) as { status: number };

		expect(result.status).toBe(400);
		expect(updateUserEmail).not.toHaveBeenCalled();
	});

	it('refuses the email change when no password is supplied at all', async () => {
		vi.mocked(getUserById).mockResolvedValue((await localAccount()) as never);

		const result = (await actions.changeEmail(event({ email: 'new@test.com' }))) as {
			status: number;
		};

		expect(result.status).toBe(400);
		expect(updateUserEmail).not.toHaveBeenCalled();
	});

	it('refuses the delete on a wrong password', async () => {
		vi.mocked(getUserById).mockResolvedValue((await localAccount()) as never);

		const result = (await actions.deleteAccount(event({ current_password: 'wrong' }))) as {
			status: number;
		};

		expect(result.status).toBe(400);
		expect(deleteUser).not.toHaveBeenCalled();
	});

	it('deletes when the password is correct', async () => {
		vi.mocked(getUserById).mockResolvedValue((await localAccount()) as never);

		await expect(
			actions.deleteAccount(event({ current_password: PASSWORD }))
		).rejects.toMatchObject({ status: 302 });
		expect(deleteUser).toHaveBeenCalledWith('u_1');
	});

	it('refuses a passwordless provider account with no open window', async () => {
		vi.mocked(getUserById).mockResolvedValue({
			id: 'u_1',
			password_hash: null,
			settings: { oidc_sub: 'idp-subject-1' }
		} as never);

		const result = (await actions.changeEmail(event({ email: 'new@test.com' }))) as {
			status: number;
		};

		expect(result.status).toBe(400);
		expect(updateUserEmail).not.toHaveBeenCalled();
	});

	it('lets a passwordless provider account through once it has stepped up', async () => {
		vi.mocked(getUserById).mockResolvedValue({
			id: 'u_1',
			password_hash: null,
			settings: {
				oidc_sub: 'idp-subject-1',
				reauth_until: new Date(Date.now() + 60_000).toISOString()
			}
		} as never);

		const result = await actions.changeEmail(event({ email: 'new@test.com' }));

		expect(result).toEqual({ savedEmail: true });
	});

	it('accepts an open window in place of the password on a local account', async () => {
		vi.mocked(getUserById).mockResolvedValue({
			...(await localAccount()),
			settings: { reauth_until: new Date(Date.now() + 60_000).toISOString() }
		} as never);

		const result = await actions.changeEmail(event({ email: 'new@test.com' }));

		expect(result).toEqual({ savedEmail: true });
	});

	it('ignores an expired window and falls back to the password', async () => {
		vi.mocked(getUserById).mockResolvedValue({
			...(await localAccount()),
			settings: { reauth_until: new Date(Date.now() - 60_000).toISOString() }
		} as never);

		const result = (await actions.changeEmail(event({ email: 'new@test.com' }))) as {
			status: number;
		};

		expect(result.status).toBe(400);
		expect(updateUserEmail).not.toHaveBeenCalled();
	});

	it('refuses when the user record has gone missing, rather than treating it as passwordless', async () => {
		vi.mocked(getUserById).mockResolvedValue(undefined as never);

		const result = (await actions.changeEmail(
			event({ email: 'new@test.com', current_password: PASSWORD })
		)) as { status: number };

		expect(result.status).toBe(400);
		expect(updateUserEmail).not.toHaveBeenCalled();
	});
});
