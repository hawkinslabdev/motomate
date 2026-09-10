import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('$env/dynamic/private', () => ({
	env: {
		OIDC_ISSUER: 'https://idp.example.com',
		OIDC_CLIENT_ID: 'motomate',
		OIDC_CLIENT_SECRET: 'shhh',
		OIDC_NAME: 'Authelia'
	}
}));
vi.mock('$env/dynamic/public', () => ({ env: {} }));
vi.mock('$lib/auth/index.js', () => ({
	isSecureCookie: false,
	lucia: {
		createSession: vi.fn(async () => ({ id: 's_new' })),
		createSessionCookie: () => ({ name: 'session', value: 's_new', attributes: {} })
	}
}));
vi.mock('$lib/auth/rate-limit.js', () => ({ rateLimit: () => true }));
vi.mock('$lib/db/repositories/users.js', () => ({
	getUserByEmail: vi.fn(),
	getUserByOidcSub: vi.fn(),
	createUser: vi.fn(),
	updateUserSettings: vi.fn(async () => {})
}));
vi.mock('$lib/auth/registration.js', () => ({ isOidcSignupOpen: vi.fn(async () => false) }));

import { GET as loginGet } from '../routes/(auth)/oidc/login/+server.js';
import { GET as callbackGet } from '../routes/(auth)/oidc/callback/+server.js';
import { safeReturnPath } from '$lib/auth/oidc.js';
import { updateUserSettings } from '$lib/db/repositories/users.js';
import { isReauthActive } from '$lib/auth/reauth.js';

const DISCOVERY = {
	issuer: 'https://idp.example.com',
	authorization_endpoint: 'https://idp.example.com/authorize',
	token_endpoint: 'https://idp.example.com/token',
	userinfo_endpoint: 'https://idp.example.com/userinfo'
};

const SUB = 'idp-subject-1';

function cookieJar(initial: Record<string, string> = {}) {
	const store = new Map(Object.entries(initial));
	return {
		store,
		get: (k: string) => store.get(k),
		set: (k: string, v: string) => store.set(k, v),
		delete: (k: string) => store.delete(k)
	};
}

function linkedUser() {
	return { id: 'u_1', settings: { oidc_sub: SUB } };
}

async function redirectOf(fn: () => unknown): Promise<{ status: number; location: string }> {
	try {
		await fn();
	} catch (e) {
		const r = e as { status: number; location: string };
		if (r.location) return r;
		throw e;
	}
	throw new Error('expected a redirect');
}

function stubFetch(userinfo: Record<string, unknown> | null) {
	globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
		const href = String(input);
		if (href.includes('openid-configuration')) {
			return new Response(JSON.stringify(DISCOVERY), { status: 200 });
		}
		if (href.includes('/token')) {
			return new Response(JSON.stringify({ access_token: 'at', id_token: 'it' }), { status: 200 });
		}
		if (href.includes('/userinfo')) {
			if (!userinfo) return new Response('nope', { status: 401 });
			return new Response(JSON.stringify(userinfo), { status: 200 });
		}
		throw new Error(`unexpected fetch ${href}`);
	}) as never;
}

describe('safeReturnPath', () => {
	it('keeps a same-origin path', () => {
		expect(safeReturnPath('/settings/account', '/fallback')).toBe('/settings/account');
	});

	it('rejects protocol-relative and absolute targets', () => {
		expect(safeReturnPath('//evil.test/x', '/fallback')).toBe('/fallback');
		expect(safeReturnPath('https://evil.test', '/fallback')).toBe('/fallback');
		expect(safeReturnPath('/\\evil.test', '/fallback')).toBe('/fallback');
		expect(safeReturnPath(null, '/fallback')).toBe('/fallback');
	});
});

describe('oidc step-up login', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		stubFetch({ sub: SUB, email: 'rider@test.com', email_verified: true });
	});

	it('asks the provider to re-prompt and remembers where to return', async () => {
		const cookies = cookieJar();
		const { location } = await redirectOf(() =>
			loginGet({
				url: new URL('http://localhost/oidc/login?reauth=1&return=/settings/account'),
				cookies,
				locals: { user: linkedUser() },
				getClientAddress: () => '1.2.3.4'
			} as never)
		);

		expect(new URL(location).searchParams.get('prompt')).toBe('login');
		expect(cookies.get('oidc_reauth')).toBe('/settings/account');
	});

	it('does not send prompt=login on an ordinary sign-in', async () => {
		const cookies = cookieJar();
		const { location } = await redirectOf(() =>
			loginGet({
				url: new URL('http://localhost/oidc/login'),
				cookies,
				locals: {},
				getClientAddress: () => '1.2.3.4'
			} as never)
		);

		expect(new URL(location).searchParams.get('prompt')).toBeNull();
		expect(cookies.get('oidc_reauth')).toBeUndefined();
	});

	it('refuses step-up without a linked session', async () => {
		await expect(
			loginGet({
				url: new URL('http://localhost/oidc/login?reauth=1'),
				cookies: cookieJar(),
				locals: {},
				getClientAddress: () => '1.2.3.4'
			} as never)
		).rejects.toMatchObject({ status: 403 });
	});

	it('confines the return target to this origin', async () => {
		const cookies = cookieJar();
		await redirectOf(() =>
			loginGet({
				url: new URL('http://localhost/oidc/login?reauth=1&return=//evil.test/x'),
				cookies,
				locals: { user: linkedUser() },
				getClientAddress: () => '1.2.3.4'
			} as never)
		);

		expect(cookies.get('oidc_reauth')).toBe('/settings/account');
	});
});

describe('oidc step-up callback', () => {
	const pending = () => ({
		oidc_state: 'st',
		oidc_verifier: 'vf',
		oidc_reauth: '/settings/account'
	});

	beforeEach(() => vi.clearAllMocks());

	it('stamps a window when the provider returns the same subject', async () => {
		stubFetch({ sub: SUB, email: 'rider@test.com', email_verified: true });
		const { location } = await redirectOf(() =>
			callbackGet({
				url: new URL('http://localhost/oidc/callback?code=c&state=st'),
				cookies: cookieJar(pending()),
				locals: { user: linkedUser() },
				getClientAddress: () => '1.2.3.4'
			} as never)
		);

		expect(location).toBe('/settings/account');
		const [userId, patch] = vi.mocked(updateUserSettings).mock.calls[0] as [
			string,
			{ reauth_until: string }
		];
		expect(userId).toBe('u_1');
		expect(isReauthActive(patch.reauth_until)).toBe(true);
	});

	it('refuses when the provider returns a different subject', async () => {
		stubFetch({ sub: 'someone-else', email: 'other@test.com', email_verified: true });
		const { location } = await redirectOf(() =>
			callbackGet({
				url: new URL('http://localhost/oidc/callback?code=c&state=st'),
				cookies: cookieJar(pending()),
				locals: { user: linkedUser() },
				getClientAddress: () => '1.2.3.4'
			} as never)
		);

		expect(location).toBe('/settings/account?error=reauth');
		expect(updateUserSettings).not.toHaveBeenCalled();
	});

	it('refuses when userinfo cannot be read', async () => {
		stubFetch(null);
		const { location } = await redirectOf(() =>
			callbackGet({
				url: new URL('http://localhost/oidc/callback?code=c&state=st'),
				cookies: cookieJar(pending()),
				locals: { user: linkedUser() },
				getClientAddress: () => '1.2.3.4'
			} as never)
		);

		expect(location).toBe('/settings/account?error=reauth');
		expect(updateUserSettings).not.toHaveBeenCalled();
	});

	it('never creates a session out of a step-up, even with no session to confirm', async () => {
		stubFetch({ sub: SUB, email: 'rider@test.com', email_verified: true });
		const { location } = await redirectOf(() =>
			callbackGet({
				url: new URL('http://localhost/oidc/callback?code=c&state=st'),
				cookies: cookieJar(pending()),
				locals: {},
				getClientAddress: () => '1.2.3.4'
			} as never)
		);

		expect(location).toBe('/login?error=oidc');
		expect(updateUserSettings).not.toHaveBeenCalled();
	});

	it('clears the pending cookies whatever the outcome', async () => {
		stubFetch({ sub: SUB, email: 'rider@test.com', email_verified: true });
		const cookies = cookieJar(pending());
		await redirectOf(() =>
			callbackGet({
				url: new URL('http://localhost/oidc/callback?code=c&state=st'),
				cookies,
				locals: { user: linkedUser() },
				getClientAddress: () => '1.2.3.4'
			} as never)
		);

		expect(cookies.get('oidc_state')).toBeUndefined();
		expect(cookies.get('oidc_verifier')).toBeUndefined();
		expect(cookies.get('oidc_reauth')).toBeUndefined();
	});
});
