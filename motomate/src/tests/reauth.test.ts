import { describe, it, expect } from 'vitest';
import { hash } from '@node-rs/argon2';
import { ARGON2_OPTS, isReauthActive, reauthWindow, verifyReauth } from '#lib/auth/reauth.js';
import { UserSettingsSchema } from '#lib/validators/schemas.js';

const PASSWORD = 'the-real-password';
const S = 's_1';
const open = () => ({
	reauth_until: new Date(Date.now() + 60_000).toISOString(),
	reauth_session: S
});
const expired = () => ({
	reauth_until: new Date(Date.now() - 60_000).toISOString(),
	reauth_session: S
});

describe('isReauthActive', () => {
	it('is closed when nothing proved identity', () => {
		expect(isReauthActive(undefined)).toBe(false);
		expect(isReauthActive(null)).toBe(false);
	});

	it('is open inside the window and closed after it', () => {
		expect(isReauthActive(open(), S)).toBe(true);
		expect(isReauthActive(expired(), S)).toBe(false);
	});

	it('opens a window that its own check accepts', () => {
		expect(isReauthActive(reauthWindow(S), S)).toBe(true);
	});

	it('is closed for any other session of the same user', () => {
		expect(isReauthActive(open(), 's_other')).toBe(false);
		expect(isReauthActive(open(), undefined)).toBe(false);
	});
});

describe('verifyReauth', () => {
	it('accepts the correct password on a local account', async () => {
		const record = { password_hash: await hash(PASSWORD, ARGON2_OPTS), settings: {} };
		expect(await verifyReauth(record, PASSWORD)).toBe('ok');
	});

	it('asks again on a wrong or missing password', async () => {
		const record = { password_hash: await hash(PASSWORD, ARGON2_OPTS), settings: {} };
		expect(await verifyReauth(record, 'wrong')).toBe('password');
		expect(await verifyReauth(record, '')).toBe('password');
	});

	it('takes an open window instead of the password', async () => {
		const record = {
			password_hash: await hash(PASSWORD, ARGON2_OPTS),
			settings: open()
		};
		expect(await verifyReauth(record, '', S)).toBe('ok');
		expect(await verifyReauth(record, '', 's_other')).toBe('password');
	});

	it('ignores an expired window', async () => {
		const record = {
			password_hash: await hash(PASSWORD, ARGON2_OPTS),
			settings: expired()
		};
		expect(await verifyReauth(record, '', S)).toBe('password');
	});

	it('sends a passwordless account to the provider', async () => {
		expect(await verifyReauth({ password_hash: null, settings: {} }, '')).toBe('stepup');
		expect(await verifyReauth({ password_hash: null, settings: {} }, 'anything')).toBe('stepup');
	});

	it('accepts a passwordless account inside its window', async () => {
		expect(await verifyReauth({ password_hash: null, settings: open() }, '', S)).toBe('ok');
	});

	it('refuses a missing record rather than reading it as passwordless', async () => {
		expect(await verifyReauth(undefined, PASSWORD)).toBe('stepup');
	});

	it('stops checking passwords after 10 guesses, even the correct one', async () => {
		const record = {
			id: 'u-limit',
			password_hash: await hash(PASSWORD, ARGON2_OPTS),
			settings: {}
		};
		for (let i = 0; i < 10; i++) expect(await verifyReauth(record, `guess-${i}`)).toBe('password');
		expect(await verifyReauth(record, PASSWORD)).toBe('limited');
	});
});

describe('settings persistence', () => {
	it('keeps the reauth window through the settings schema', () => {
		const window = reauthWindow(S);
		expect(UserSettingsSchema.parse(window)).toMatchObject(window);
		expect(UserSettingsSchema.parse({ reauth_until: null }).reauth_until).toBeNull();
	});
});
