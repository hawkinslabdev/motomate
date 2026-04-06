import { fail, redirect } from '@sveltejs/kit';
import { lucia } from '$lib/auth/index.js';
import { getUserByEmail, createUser, updateUserSettings } from '$lib/db/repositories/users.js';
import { createMagicLinkToken, sendMagicLinkEmail } from '$lib/auth/magic-link.js';
import { LoginSchema, MagicLinkRequestSchema } from '$lib/validators/schemas.js';
import { rateLimit } from '$lib/auth/rate-limit.js';
import type { Actions, PageServerLoad } from './$types';
import { hash, verify } from '@node-rs/argon2';
import en from '$lib/i18n/locales/en.json';
import de from '$lib/i18n/locales/de.json';
import fr from '$lib/i18n/locales/fr.json';
import es from '$lib/i18n/locales/es.json';
import it from '$lib/i18n/locales/it.json';
import nl from '$lib/i18n/locales/nl.json';
import pt from '$lib/i18n/locales/pt.json';

type AuthErrors = {
	auth: {
		login: {
			errors: {
				rateLimited: string;
				invalidFormat: string;
				invalidCredentials: string;
				invalidEmail: string;
			};
		};
	};
};

const localeMessages: Record<string, AuthErrors> = { en, de, fr, es, it, nl, pt };

const ARGON2_OPTS = { memoryCost: 19456, timeCost: 2, outputLen: 32, parallelism: 1 };

// Uses a pre-computed hash to ensure every login attempt takes the same amount of time.
// This prevents abusers from using response speeds to guess if an email address exists in the database.
let _dummyHash: string | undefined;
async function getDummyHash(): Promise<string> {
	if (!_dummyHash) _dummyHash = await hash('_timing_dummy_', ARGON2_OPTS);
	return _dummyHash;
}

export const load: PageServerLoad = async ({ locals }) => {
	if (locals.user) redirect(302, '/dashboard');
	return {};
};

export const actions: Actions = {
	login: async ({ request, cookies, getClientAddress, locals }) => {
		const ip = getClientAddress();
		const userLocale = (locals.user as any)?.settings?.locale ?? 'en';
		const messages = localeMessages[userLocale] ?? localeMessages['en'];
		const errors = messages.auth.login.errors;

		if (!rateLimit(`login:${ip}`, 10, 15 * 60_000)) {
			return fail(429, { error: errors.rateLimited, email: '' });
		}

		const data = Object.fromEntries(await request.formData());
		const remember = data.remember === 'on';
		const parsed = LoginSchema.safeParse(data);

		if (!parsed.success) {
			return fail(400, {
				error: errors.invalidFormat,
				email: String(data.email ?? '')
			});
		}

		const user = await getUserByEmail(parsed.data.email);

		// Always run Argon2 verify — even when the user doesn't exist — so response
		// time is constant and can't be used to enumerate valid email addresses.
		const hashToCheck = user?.password_hash ?? (await getDummyHash());
		const valid = await verify(hashToCheck, parsed.data.password, ARGON2_OPTS);

		if (!user || !user.password_hash || !valid) {
			return fail(400, { error: errors.invalidCredentials, email: parsed.data.email });
		}

		// Apply pre-login locale/theme to DB, but only when the DB still has
		// the default value — never overwrite a setting the user already customized.
		const rawTheme = String(data.theme ?? '');
		const rawLocale = String(data.locale ?? '');
		const settingsPatch: Record<string, string> = {};
		if (
			(rawTheme === 'light' || rawTheme === 'dark' || rawTheme === 'system') &&
			rawTheme !== 'system' &&
			user.settings?.theme === 'system'
		) {
			settingsPatch.theme = rawTheme;
		}
		if (
			rawLocale &&
			rawLocale !== 'en' &&
			/^[a-z]{2}(-[A-Z]{2})?$/.test(rawLocale) &&
			user.settings?.locale === 'en'
		) {
			settingsPatch.locale = rawLocale;
		}
		if (Object.keys(settingsPatch).length > 0) {
			await updateUserSettings(user.id, settingsPatch);
		}

		const session = await lucia.createSession(user.id, {});
		const cookie = lucia.createSessionCookie(session.id);
		cookies.set(cookie.name, cookie.value, {
			path: '/',
			...cookie.attributes,
			maxAge: remember ? 60 * 60 * 24 * 30 : undefined
		});

		redirect(302, user.onboarding_done ? '/dashboard' : '/onboarding');
	},

	magic: async ({ request, getClientAddress, locals }) => {
		const ip = getClientAddress();
		const userLocale = (locals.user as any)?.settings?.locale ?? 'en';
		const messages = localeMessages[userLocale] ?? localeMessages['en'];
		const errors = messages.auth.login.errors;

		if (!rateLimit(`magic:${ip}`, 5, 60 * 60_000)) {
			return fail(429, { error: errors.rateLimited });
		}

		const data = Object.fromEntries(await request.formData());
		const parsed = MagicLinkRequestSchema.safeParse(data);

		if (!parsed.success) {
			return fail(400, { error: errors.invalidEmail });
		}

		// Find or create user (passwordless)
		let user = await getUserByEmail(parsed.data.email);
		if (!user) {
			user = await createUser({ email: parsed.data.email });
		}

		const token = await createMagicLinkToken(user.id);
		await sendMagicLinkEmail(parsed.data.email, token);

		return { magic: true };
	}
};
