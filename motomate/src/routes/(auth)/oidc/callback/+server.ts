import { redirect, error } from '@sveltejs/kit';
import {
	getOidcConfig,
	discoverOidc,
	exchangeCode,
	fetchUserinfo,
	isEmailVerified,
	redirectUri,
	oidcCookie
} from '$lib/auth/oidc.js';
import { lucia, isSecureCookie } from '$lib/auth/index.js';
import {
	getUserByEmail,
	getUserByOidcSub,
	createUser,
	updateUserSettings
} from '$lib/db/repositories/users.js';
import { isOidcSignupOpen } from '$lib/auth/registration.js';
import { rateLimit } from '$lib/auth/rate-limit.js';
import { ts } from '$lib/server/log.js';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, cookies, getClientAddress }) => {
	const config = getOidcConfig();
	if (!config) error(404);

	if (!rateLimit(`oidc:callback:${getClientAddress()}`, 30, 15 * 60_000)) {
		error(429, 'Too many requests');
	}

	const code = url.searchParams.get('code');
	const state = url.searchParams.get('state');
	const stateCookie = oidcCookie('state', isSecureCookie);
	const verifierCookie = oidcCookie('verifier', isSecureCookie);
	const storedState = cookies.get(stateCookie);
	const verifier = cookies.get(verifierCookie);
	cookies.delete(stateCookie, { path: '/' });
	cookies.delete(verifierCookie, { path: '/' });

	if (!code || !state || !verifier || state !== storedState) {
		console.error(
			`${ts()} [MotoMate] OIDC callback rejected: code=${!!code} state=${!!state} verifier=${!!verifier} stateMatch=${state === storedState}`
		);
		redirect(302, '/login?error=oidc');
	}

	let userinfo = null;
	let idToken: string | undefined;
	try {
		const discovery = await discoverOidc(config.issuer);
		const tokens = await exchangeCode(discovery, config, code, verifier, redirectUri(url));
		idToken = tokens.id_token;
		userinfo = await fetchUserinfo(discovery, tokens.access_token);
	} catch (e) {
		console.error(`${ts()} [MotoMate] OIDC token exchange failed`, e);
	}

	const emailTrusted = config.trustUnverifiedEmail || isEmailVerified(userinfo?.email_verified);

	if (!userinfo?.sub || !userinfo.email || !emailTrusted) {
		console.error(
			`${ts()} [MotoMate] OIDC userinfo unusable: sub=${!!userinfo?.sub} email=${!!userinfo?.email} emailVerified=${isEmailVerified(userinfo?.email_verified)}`
		);
		if (userinfo?.sub && userinfo.email) {
			console.error(
				`${ts()} [MotoMate] The IdP did not report this email as verified. If it never runs an email verification flow and its addresses are administrator-assigned, set OIDC_TRUST_UNVERIFIED_EMAIL=true.`
			);
		}
		redirect(302, '/login?error=oidc');
	}

	let user = await getUserByOidcSub(userinfo.sub);

	if (!user) {
		const byEmail = await getUserByEmail(userinfo.email);
		if (byEmail) {
			if (byEmail.settings?.oidc_sub) {
				console.error(
					`${ts()} [MotoMate] OIDC account conflict: local account already linked to a different subject`
				);
				redirect(302, '/login?error=oidc');
			}
			await updateUserSettings(byEmail.id, { oidc_sub: userinfo.sub });
			user = byEmail;
		} else {
			if (!(await isOidcSignupOpen())) {
				console.error(`${ts()} [MotoMate] OIDC signup rejected: registration is closed`);
				redirect(302, '/login?error=oidc_closed');
			}
			user = await createUser({
				email: userinfo.email,
				initialSettings: { oidc_sub: userinfo.sub }
			});
		}
	}

	const session = await lucia.createSession(user.id, {});
	const cookie = lucia.createSessionCookie(session.id);
	cookies.set(cookie.name, cookie.value, { path: '/', ...cookie.attributes });

	if (idToken && idToken.length <= 3500) {
		cookies.set(oidcCookie('id_token', isSecureCookie), idToken, {
			path: '/',
			httpOnly: true,
			secure: isSecureCookie,
			sameSite: 'lax',
			maxAge: 30 * 24 * 60 * 60
		});
	}

	redirect(302, user.onboarding_done ? '/dashboard' : '/onboarding');
};
