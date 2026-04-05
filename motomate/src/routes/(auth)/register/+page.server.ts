import { fail, redirect } from '@sveltejs/kit';
import { hash } from '@node-rs/argon2';
import { lucia } from '$lib/auth/index.js';
import { getUserByEmail, createUser } from '$lib/db/repositories/users.js';
import { CreateUserSchema } from '$lib/validators/schemas.js';
import { rateLimit } from '$lib/auth/rate-limit.js';
import type { UserSettings } from '$lib/db/schema.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (locals.user) redirect(302, '/dashboard');
	return {};
};

export const actions: Actions = {
	default: async ({ request, cookies, getClientAddress }) => {
		const ip = getClientAddress();
		if (!rateLimit(`register:${ip}`, 5, 60 * 60_000)) {
			return fail(429, { error: 'Too many attempts. Please try again later.', email: '' });
		}

		const data = Object.fromEntries(await request.formData());
		const parsed = CreateUserSchema.safeParse({ email: data.email, password: data.password });

		if (!parsed.success) {
			const msg = parsed.error.issues[0]?.message ?? 'Invalid input';
			return fail(400, { error: msg, email: String(data.email ?? '') });
		}

		if (!parsed.data.password) {
			return fail(400, { error: 'Password is required', email: parsed.data.email });
		}

		const confirmPassword = String(data.confirm_password ?? '');
		if (confirmPassword !== parsed.data.password) {
			return fail(400, {
				error: '',
				email: parsed.data.email,
				fieldErrors: { confirm_password: 'Passwords do not match' }
			});
		}

		// Hash before the existence check so response time is constant regardless
		// of whether the email is already registered (timing oracle prevention).
		const password_hash = await hash(parsed.data.password, {
			memoryCost: 19456,
			timeCost: 2,
			outputLen: 32,
			parallelism: 1
		});

		const existing = await getUserByEmail(parsed.data.email);
		if (existing) {
			// Neutral message — does not confirm whether the address is registered.
			return fail(400, {
				error: 'Check your details and try again, or log in if you already have an account.',
				email: parsed.data.email
			});
		}

		const rawTheme = String(data.theme ?? '');
		const rawLocale = String(data.locale ?? '');
		const initialSettings: Partial<UserSettings> = {};
		if (rawTheme === 'light' || rawTheme === 'dark' || rawTheme === 'system') {
			initialSettings.theme = rawTheme;
		}
		if (rawLocale && /^[a-z]{2}(-[A-Z]{2})?$/.test(rawLocale)) {
			initialSettings.locale = rawLocale;
		}

		const user = await createUser({ email: parsed.data.email, password_hash, initialSettings });
		const session = await lucia.createSession(user.id, {});
		const cookie = lucia.createSessionCookie(session.id);
		cookies.set(cookie.name, cookie.value, { path: '/', ...cookie.attributes });

		redirect(302, '/onboarding');
	}
};
