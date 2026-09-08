import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('$env/dynamic/private', () => ({
	env: new Proxy({}, { get: (_, k: string) => process.env[k] })
}));

vi.mock('$env/dynamic/public', () => ({
	env: new Proxy({}, { get: (_, k: string) => process.env[k] })
}));

import {
	getOidcConfig,
	pkceChallenge,
	isEmailVerified,
	redirectUri,
	discoverOidc,
	endSessionUrl
} from '$lib/auth/oidc.js';

function discoveryDoc(issuer: string) {
	return {
		issuer,
		authorization_endpoint: `${issuer}/authorize`,
		token_endpoint: `${issuer}/token`,
		userinfo_endpoint: `${issuer}/userinfo`
	};
}

function mockDiscovery(doc: unknown) {
	return vi.spyOn(globalThis, 'fetch').mockResolvedValue({
		ok: true,
		json: async () => doc
	} as Response);
}

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

describe('redirectUri', () => {
	beforeEach(() => {
		delete process.env.PUBLIC_APP_URL;
	});

	it('prefers PUBLIC_APP_URL over the request origin', () => {
		process.env.PUBLIC_APP_URL = 'https://moto.example.com/';
		expect(redirectUri(new URL('http://attacker.test/oidc/login'))).toBe(
			'https://moto.example.com/oidc/callback'
		);
	});

	it('falls back to the request origin when unset', () => {
		expect(redirectUri(new URL('http://localhost:5173/oidc/login'))).toBe(
			'http://localhost:5173/oidc/callback'
		);
	});
});

describe('discoverOidc', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('rejects a plaintext issuer that is not loopback', async () => {
		await expect(discoverOidc('http://idp.example.com')).rejects.toThrow('https');
	});

	it('allows a plaintext loopback issuer for local development', async () => {
		const issuer = 'http://localhost:9000';
		mockDiscovery(discoveryDoc(issuer));
		await expect(discoverOidc(issuer)).resolves.toMatchObject({ issuer });
	});

	it('rejects a document whose issuer does not match the configured one', async () => {
		mockDiscovery(discoveryDoc('https://evil.example.com'));
		await expect(discoverOidc('https://idp.example.com')).rejects.toThrow('mismatch');
	});

	it('rejects a document pointing an endpoint at plaintext http', async () => {
		const issuer = 'https://idp2.example.com';
		mockDiscovery({ ...discoveryDoc(issuer), token_endpoint: 'http://idp2.example.com/token' });
		await expect(discoverOidc(issuer)).rejects.toThrow('https');
	});

	it('serves a second lookup from cache without refetching', async () => {
		const issuer = 'https://idp3.example.com';
		const fetchSpy = mockDiscovery(discoveryDoc(issuer));
		await discoverOidc(issuer);
		await discoverOidc(issuer);
		expect(fetchSpy).toHaveBeenCalledTimes(1);
	});
});

describe('endSessionUrl', () => {
	const issuer = 'https://idp4.example.com';

	beforeEach(() => {
		process.env.OIDC_ISSUER = issuer;
		process.env.OIDC_CLIENT_ID = 'motomate';
		process.env.OIDC_CLIENT_SECRET = 'secret';
		process.env.PUBLIC_APP_URL = 'https://moto.example.com';
		mockDiscovery({ ...discoveryDoc(issuer), end_session_endpoint: `${issuer}/logout` });
	});

	afterEach(() => {
		vi.restoreAllMocks();
		delete process.env.PUBLIC_APP_URL;
	});

	it('sends id_token_hint when the ID token is available', async () => {
		const target = new URL((await endSessionUrl(new URL('http://host.test/'), 'jwt.value'))!);
		expect(target.searchParams.get('id_token_hint')).toBe('jwt.value');
		expect(target.searchParams.has('client_id')).toBe(false);
		expect(target.searchParams.get('post_logout_redirect_uri')).toBe(
			'https://moto.example.com/login'
		);
	});

	it('falls back to client_id when no ID token was stored', async () => {
		const target = new URL((await endSessionUrl(new URL('http://host.test/')))!);
		expect(target.searchParams.get('client_id')).toBe('motomate');
		expect(target.searchParams.has('id_token_hint')).toBe(false);
	});

	it('is null when the IdP publishes no end_session_endpoint', async () => {
		const bare = 'https://idp5.example.com';
		process.env.OIDC_ISSUER = bare;
		vi.restoreAllMocks();
		mockDiscovery(discoveryDoc(bare));
		expect(await endSessionUrl(new URL('http://host.test/'))).toBeNull();
	});
});
