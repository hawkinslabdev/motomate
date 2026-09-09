import { redirect, error } from '@sveltejs/kit';
import {
	getOidcConfig,
	discoverOidc,
	randomToken,
	pkceChallenge,
	redirectUri,
	oidcCookie
} from '$lib/auth/oidc.js';
import { isSecureCookie } from '$lib/auth/index.js';
import { rateLimit } from '$lib/auth/rate-limit.js';
import { ts } from '$lib/server/log.js';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ cookies, url, getClientAddress }) => {
	const config = getOidcConfig();
	if (!config) error(404);

	if (!rateLimit(`oidc:login:${getClientAddress()}`, 30, 15 * 60_000)) {
		error(429, 'Too many requests');
	}

	let discovery;
	try {
		discovery = await discoverOidc(config.issuer);
	} catch (e) {
		console.error(`${ts()} [MotoMate] OIDC discovery failed`, e);
		redirect(302, '/login?error=oidc');
	}

	const state = randomToken();
	const verifier = randomToken();
	const challenge = pkceChallenge(verifier);

	const cookieOpts = {
		path: '/',
		httpOnly: true,
		secure: isSecureCookie,
		sameSite: 'lax' as const,
		maxAge: 600
	};
	cookies.set(oidcCookie('state', isSecureCookie), state, cookieOpts);
	cookies.set(oidcCookie('verifier', isSecureCookie), verifier, cookieOpts);

	const authUrl = new URL(discovery.authorization_endpoint);
	authUrl.searchParams.set('response_type', 'code');
	authUrl.searchParams.set('client_id', config.clientId);
	authUrl.searchParams.set('redirect_uri', redirectUri(url));
	authUrl.searchParams.set('scope', config.scopes);
	authUrl.searchParams.set('state', state);
	authUrl.searchParams.set('code_challenge', challenge);
	authUrl.searchParams.set('code_challenge_method', 'S256');

	redirect(302, authUrl.toString());
};
