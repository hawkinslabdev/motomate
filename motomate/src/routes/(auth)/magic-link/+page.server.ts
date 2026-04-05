import { redirect } from '@sveltejs/kit';
import { lucia } from '$lib/auth/index.js';
import { verifyMagicLinkToken } from '$lib/auth/magic-link.js';
import { getUserById } from '$lib/db/repositories/users.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url, cookies }) => {
	const token = url.searchParams.get('token');
	if (!token) return { verified: false, error: 'No token provided.' };

	const userId = await verifyMagicLinkToken(token);
	if (!userId) return { verified: false, error: 'This link is invalid or has expired.' };

	const user = await getUserById(userId);
	if (!user) return { verified: false, error: 'User not found.' };

	const session = await lucia.createSession(userId, {});
	const cookie = lucia.createSessionCookie(session.id);
	cookies.set(cookie.name, cookie.value, { path: '/', ...cookie.attributes });

	redirect(302, user.onboarding_done ? '/dashboard' : '/onboarding');
};
