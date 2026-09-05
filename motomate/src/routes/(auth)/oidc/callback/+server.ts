import { redirect, error } from '@sveltejs/kit';
import { getOidcConfig, discoverOidc, exchangeCode, fetchUserinfo } from '$lib/auth/oidc.js';
import { lucia } from '$lib/auth/index.js';
import { getUserByEmail, createUser } from '$lib/db/repositories/users.js';
import { isRegistrationOpen } from '$lib/auth/registration.js';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, cookies }) => {
	const config = getOidcConfig();
	if (!config) error(404);

	const code = url.searchParams.get('code');
	const state = url.searchParams.get('state');
	const storedState = cookies.get('oidc_state');
	const verifier = cookies.get('oidc_verifier');
	cookies.delete('oidc_state', { path: '/' });
	cookies.delete('oidc_verifier', { path: '/' });

	if (!code || !state || !verifier || state !== storedState) {
		redirect(302, '/login?error=oidc');
	}

	const discovery = await discoverOidc(config.issuer);
	const tokens = await exchangeCode(
		discovery,
		config,
		code,
		verifier,
		`${url.origin}/oidc/callback`
	);
	const userinfo = await fetchUserinfo(discovery, tokens.access_token);

	if (!userinfo.email) redirect(302, '/login?error=oidc');

	let user = await getUserByEmail(userinfo.email);
	if (!user) {
		if (!(await isRegistrationOpen())) redirect(302, '/login?error=oidc_closed');
		user = await createUser({ email: userinfo.email });
	}

	const session = await lucia.createSession(user.id, {});
	const cookie = lucia.createSessionCookie(session.id);
	cookies.set(cookie.name, cookie.value, { path: '/', ...cookie.attributes });

	redirect(302, user.onboarding_done ? '/dashboard' : '/onboarding');
};
