import { json } from '@sveltejs/kit';
import { lucia, isSecureCookie } from '$lib/auth/index.js';
import { endSessionUrl, oidcCookie } from '$lib/auth/oidc.js';
import type { RequestHandler } from '@sveltejs/kit';

export const POST: RequestHandler = async ({ locals, cookies, url }) => {
	const wasOidc = !!locals.user?.settings?.oidc_sub;
	const idTokenCookie = oidcCookie('id_token', isSecureCookie);
	const idToken = cookies.get(idTokenCookie);
	cookies.delete(idTokenCookie, { path: '/' });

	if (locals.session) {
		await lucia.invalidateSession(locals.session.id);
		const blank = lucia.createBlankSessionCookie();
		cookies.set(blank.name, blank.value, { path: '/', ...blank.attributes });
	}

	const target = wasOidc ? await endSessionUrl(url, idToken) : null;
	return json({ redirect: target ?? '/login' });
};
