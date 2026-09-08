import { redirect, error } from '@sveltejs/kit';
import {
	getOidcConfig,
	discoverOidc,
	exchangeCode,
	fetchUserinfo,
	isEmailVerified
} from '$lib/auth/oidc.js';
import { lucia } from '$lib/auth/index.js';
import {
	getUserByEmail,
	getUserByOidcSub,
	createUser,
	updateUserSettings
} from '$lib/db/repositories/users.js';
import { isOidcSignupOpen } from '$lib/auth/registration.js';
import { rateLimit } from '$lib/auth/rate-limit.js';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, cookies, getClientAddress }) => {
	const config = getOidcConfig();
	if (!config) error(404);

	if (!rateLimit(`oidc:callback:${getClientAddress()}`, 30, 15 * 60_000)) {
		error(429, 'Too many requests');
	}

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

	if (!userinfo.sub || !userinfo.email || !isEmailVerified(userinfo.email_verified)) {
		redirect(302, '/login?error=oidc');
	}

	let user = await getUserByOidcSub(userinfo.sub);

	if (!user) {
		const byEmail = await getUserByEmail(userinfo.email);
		if (byEmail) {
			if (byEmail.settings?.oidc_sub) redirect(302, '/login?error=oidc');
			await updateUserSettings(byEmail.id, { oidc_sub: userinfo.sub });
			user = byEmail;
		} else {
			if (!(await isOidcSignupOpen())) redirect(302, '/login?error=oidc_closed');
			user = await createUser({
				email: userinfo.email,
				initialSettings: { oidc_sub: userinfo.sub }
			});
		}
	}

	const session = await lucia.createSession(user.id, {});
	const cookie = lucia.createSessionCookie(session.id);
	cookies.set(cookie.name, cookie.value, { path: '/', ...cookie.attributes });

	redirect(302, user.onboarding_done ? '/dashboard' : '/onboarding');
};
