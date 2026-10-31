import { fail, redirect } from '@sveltejs/kit';
import { hash } from '@node-rs/argon2';
import { lucia } from '#lib/auth/index.js';
import { getUserByEmail, createUser } from '#lib/db/repositories/users.js';
import { isRegistrationOpen } from '#lib/auth/registration.js';
import { CreateUserSchema } from '#lib/validators/schemas.js';
import { rateLimit } from '#lib/auth/rate-limit.js';
import { verifyAltcha } from '#lib/auth/altcha.js';
import type { UserSettings } from '#lib/db/schema.js';
import type { Actions, PageServerLoad } from './$types';
import { locales as localeMap } from '#lib/i18n/locales.js';

type RegisterMessages = {
	auth: {
		register: {
			passwordMismatch: string;
			errors: {
				registrationClosed: string;
				rateLimited: string;
				verificationFailed: string;
				invalidEmail: string;
				passwordTooShort: string;
				passwordRequired: string;
				emailInUse: string;
			};
		};
	};
};

const localeMessages: Record<string, RegisterMessages> = localeMap;

export const load: PageServerLoad = async ({ locals }) => {
	if (locals.user) redirect(302, '/dashboard');
	const open = await isRegistrationOpen();
	return { registrationDisabled: !open, altchaEnabled: true };
};

export const actions: Actions = {
	default: async ({ request, cookies, getClientAddress }) => {
		const data = Object.fromEntries(await request.formData());
		const rawLocale = String(data.locale ?? '');
		const userLocale = /^[a-z]{2}(-[A-Z]{2})?$/.test(rawLocale) ? rawLocale : 'en';
		const messages = localeMessages[userLocale] ?? localeMessages['en'];
		const errors = messages.auth.register.errors;

		if (!(await isRegistrationOpen())) {
			return fail(403, { error: errors.registrationClosed, email: '' });
		}

		// Coarse: behind a proxy this bucket is shared by every visitor, so it cannot be tight.
		const ip = getClientAddress();
		if (!rateLimit(`register:ip:${ip}`, 50, 60 * 60_000)) {
			return fail(429, { error: errors.rateLimited, email: '' });
		}

		if (!(await verifyAltcha(data.altcha))) {
			return fail(400, {
				error: errors.verificationFailed,
				email: String(data.email ?? '')
			});
		}

		const parsed = CreateUserSchema.safeParse({ email: data.email, password: data.password });

		if (!parsed.success) {
			const field = parsed.error.issues[0]?.path?.[0] as string | undefined;
			const msg = field === 'password' ? errors.passwordTooShort : errors.invalidEmail;
			return fail(400, { error: msg, email: String(data.email ?? '') });
		}

		if (!rateLimit(`register:email:${parsed.data.email}`, 5, 60 * 60_000)) {
			return fail(429, { error: errors.rateLimited, email: parsed.data.email });
		}

		if (!parsed.data.password) {
			return fail(400, { error: errors.passwordRequired, email: parsed.data.email });
		}

		const confirmPassword = String(data.confirm_password ?? '');
		if (confirmPassword !== parsed.data.password) {
			return fail(400, {
				error: '',
				email: parsed.data.email,
				fieldErrors: { confirm_password: messages.auth.register.passwordMismatch }
			});
		}

		// Hash before the existence check so response time is constant and cannot enumerate emails
		const password_hash = await hash(parsed.data.password, {
			memoryCost: 19456,
			timeCost: 2,
			outputLen: 32,
			parallelism: 1
		});

		const existing = await getUserByEmail(parsed.data.email);
		if (existing) {
			return fail(400, {
				error: errors.emailInUse,
				email: parsed.data.email
			});
		}

		const rawTheme = String(data.theme ?? '');
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
