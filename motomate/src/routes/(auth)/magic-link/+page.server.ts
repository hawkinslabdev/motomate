import { redirect } from '@sveltejs/kit';
import { lucia } from '$lib/auth/index.js';
import { verifyMagicLinkToken } from '$lib/auth/magic-link.js';
import { getUserById, updateUserSettings } from '$lib/db/repositories/users.js';
import { rateLimit } from '$lib/auth/rate-limit.js';
import { reauthExpiry } from '$lib/auth/reauth.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url, cookies, getClientAddress }) => {
	if (!rateLimit(`magiclink:consume:${getClientAddress()}`, 20, 15 * 60_000)) {
		return { verified: false, errorKey: 'auth.magicLink.invalid' };
	}

	const token = url.searchParams.get('token') ?? '';
	const userId = token ? await verifyMagicLinkToken(token) : null;
	const user = userId ? await getUserById(userId) : null;

	if (!userId || !user) {
		return { verified: false, errorKey: 'auth.magicLink.invalid' };
	}

	await updateUserSettings(userId, { reauth_until: reauthExpiry() });

	const session = await lucia.createSession(userId, {});
	const cookie = lucia.createSessionCookie(session.id);
	cookies.set(cookie.name, cookie.value, { path: '/', ...cookie.attributes });

	redirect(302, user.onboarding_done ? '/dashboard' : '/onboarding');
};
