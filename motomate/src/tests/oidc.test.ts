import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('$env/dynamic/private', () => ({
	env: new Proxy({}, { get: (_, k: string) => process.env[k] })
}));

import { getOidcConfig, pkceChallenge, isEmailVerified } from '$lib/auth/oidc.js';

describe('getOidcConfig', () => {
	beforeEach(() => {
		delete process.env.OIDC_ISSUER;
		delete process.env.OIDC_CLIENT_ID;
		delete process.env.OIDC_CLIENT_SECRET;
	});

	it('is null when unconfigured', () => {
		expect(getOidcConfig()).toBeNull();
	});

	it('is null when only partially configured', () => {
		process.env.OIDC_ISSUER = 'https://idp.example.com';
		expect(getOidcConfig()).toBeNull();
	});

	it('strips trailing slash from issuer', () => {
		process.env.OIDC_ISSUER = 'https://idp.example.com/';
		process.env.OIDC_CLIENT_ID = 'id';
		process.env.OIDC_CLIENT_SECRET = 'secret';
		expect(getOidcConfig()?.issuer).toBe('https://idp.example.com');
	});
});

describe('isEmailVerified', () => {
	it('accepts a true boolean and the string form some providers send', () => {
		expect(isEmailVerified(true)).toBe(true);
		expect(isEmailVerified('true')).toBe(true);
	});

	it('rejects anything else', () => {
		expect(isEmailVerified(false)).toBe(false);
		expect(isEmailVerified('false')).toBe(false);
		expect(isEmailVerified(undefined)).toBe(false);
	});
});

describe('pkceChallenge', () => {
	it('is deterministic for the same verifier', () => {
		expect(pkceChallenge('abc')).toBe(pkceChallenge('abc'));
	});

	it('differs for different verifiers', () => {
		expect(pkceChallenge('abc')).not.toBe(pkceChallenge('xyz'));
	});
});
