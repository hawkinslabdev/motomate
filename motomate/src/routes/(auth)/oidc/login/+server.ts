import { redirect, error } from '@sveltejs/kit';
import { getOidcConfig, discoverOidc, randomToken, pkceChallenge } from '$lib/auth/oidc.js';
import { isSecureCookie } from '$lib/auth/index.js';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ cookies, url }) => {
	const config = getOidcConfig();
	if (!config) error(404);

	const discovery = await discoverOidc(config.issuer);
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
	cookies.set('oidc_state', state, cookieOpts);
	cookies.set('oidc_verifier', verifier, cookieOpts);

	const authUrl = new URL(discovery.authorization_endpoint);
	authUrl.searchParams.set('response_type', 'code');
	authUrl.searchParams.set('client_id', config.clientId);
	authUrl.searchParams.set('redirect_uri', `${url.origin}/oidc/callback`);
	authUrl.searchParams.set('scope', config.scopes);
	authUrl.searchParams.set('state', state);
	authUrl.searchParams.set('code_challenge', challenge);
	authUrl.searchParams.set('code_challenge_method', 'S256');

	redirect(302, authUrl.toString());
};
