import { describe, it, expect } from 'vitest';
import { hash } from '@node-rs/argon2';
import { ARGON2_OPTS, isReauthActive, reauthExpiry, verifyReauth } from '$lib/auth/reauth.js';

const PASSWORD = 'the-real-password';
const open = () => new Date(Date.now() + 60_000).toISOString();
const expired = () => new Date(Date.now() - 60_000).toISOString();

describe('isReauthActive', () => {
	it('is closed when nothing proved identity', () => {
		expect(isReauthActive(undefined)).toBe(false);
		expect(isReauthActive(null)).toBe(false);
	});

	it('is open inside the window and closed after it', () => {
		expect(isReauthActive(open())).toBe(true);
		expect(isReauthActive(expired())).toBe(false);
	});

	it('opens a window that its own check accepts', () => {
		expect(isReauthActive(reauthExpiry())).toBe(true);
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
			settings: { reauth_until: open() }
		};
		expect(await verifyReauth(record, '')).toBe('ok');
	});

	it('ignores an expired window', async () => {
		const record = {
			password_hash: await hash(PASSWORD, ARGON2_OPTS),
			settings: { reauth_until: expired() }
		};
		expect(await verifyReauth(record, '')).toBe('password');
	});

	it('sends a passwordless account to the provider', async () => {
		expect(await verifyReauth({ password_hash: null, settings: {} }, '')).toBe('stepup');
		expect(await verifyReauth({ password_hash: null, settings: {} }, 'anything')).toBe('stepup');
	});

	it('accepts a passwordless account inside its window', async () => {
		expect(
			await verifyReauth({ password_hash: null, settings: { reauth_until: open() } }, '')
		).toBe('ok');
	});

	it('refuses a missing record rather than reading it as passwordless', async () => {
		expect(await verifyReauth(undefined, PASSWORD)).toBe('stepup');
	});
});
