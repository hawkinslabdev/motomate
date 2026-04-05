import { redirect } from '@sveltejs/kit';
import { lucia } from '$lib/auth/index.js';
import type { RequestHandler } from '@sveltejs/kit';

export const POST: RequestHandler = async ({ locals, cookies }) => {
	if (locals.session) {
		await lucia.invalidateSession(locals.session.id);
		const blank = lucia.createBlankSessionCookie();
		cookies.set(blank.name, blank.value, { path: '/', ...blank.attributes });
	}
	redirect(302, '/login');
};
