import { fail, redirect } from '@sveltejs/kit';
import { lucia } from '$lib/auth/index.js';
import { getUserByEmail, createUser, updateUserSettings } from '$lib/db/repositories/users.js';
import { env as pubEnv } from '$env/dynamic/public';
import { isRegistrationOpen } from '$lib/auth/registration.js';
import {
	createMagicLinkToken,
	sendMagicLinkEmail,
	logMagicLink,
	isSmtpConfigured
} from '$lib/auth/magic-link.js';
import { verifyAltcha } from '$lib/auth/altcha.js';
import { getOidcConfig } from '$lib/auth/oidc.js';
import { LoginSchema, MagicLinkRequestSchema } from '$lib/validators/schemas.js';
import { rateLimit } from '$lib/auth/rate-limit.js';
import { ts } from '$lib/server/log.js';
import type { Actions, PageServerLoad } from './$types';
import { hash, verify } from '@node-rs/argon2';
import { locales as localeMap } from '$lib/i18n/locales.js';

type AuthErrors = {
	auth: {
		login: {
			errors: {
				rateLimited: string;
				invalidFormat: string;
				invalidCredentials: string;
				invalidEmail: string;
				verificationFailed: string;
			};
		};
	};
};

const localeMessages: Record<string, AuthErrors> = localeMap;

const ARGON2_OPTS = { memoryCost: 19456, timeCost: 2, outputLen: 32, parallelism: 1 };

let _smtpWarned = false;

// Uses a pre-computed hash to ensure every login attempt takes same amount of time
let _dummyHash: string | undefined;
async function getDummyHash(): Promise<string> {
	if (!_dummyHash) _dummyHash = await hash('_timing_dummy_', ARGON2_OPTS);
	return _dummyHash;
}

export const load: PageServerLoad = async ({ locals, url }) => {
	if (locals.user) redirect(302, '/dashboard');
	const smtpEnabled = isSmtpConfigured();
	if (!smtpEnabled && !_smtpWarned) {
		console.warn(
			`${ts()} [MotoMate] SMTP_HOST is not set. Magic links are written to this log instead of being emailed.`
		);
		_smtpWarned = true;
	}
	const initialMode = url.searchParams.get('mode') === 'magic' ? 'magic' : 'password';
	return {
		registrationEnabled: await isRegistrationOpen(),
		smtpEnabled,
		altchaEnabled: true,
		initialMode,
		oidcName: getOidcConfig()?.name ?? null
	};
};

export const actions: Actions = {
	login: async ({ request, cookies, getClientAddress }) => {
		const ip = getClientAddress();
		const data = Object.fromEntries(await request.formData());
		const rawLocale = String(data.locale ?? cookies.get('locale') ?? 'en');
		const userLocale = rawLocale in localeMessages ? rawLocale : 'en';
		const messages = localeMessages[userLocale] ?? localeMessages['en'];
		const errors = messages.auth.login.errors;

		// Behind a proxy all requests share one address, so this is a coarse backstop; the per-account bucket does the real work
		if (!rateLimit(`login:ip:${ip}`, 100, 15 * 60_000)) {
			return fail(429, { error: errors.rateLimited, email: '' });
		}
		const remember = data.remember === 'on';
		const parsed = LoginSchema.safeParse(data);

		if (!parsed.success) {
			return fail(400, {
				error: errors.invalidFormat,
				email: String(data.email ?? '')
			});
		}

		if (!rateLimit(`login:email:${parsed.data.email}`, 10, 15 * 60_000)) {
			return fail(429, { error: errors.rateLimited, email: parsed.data.email });
		}

		const user = await getUserByEmail(parsed.data.email);

		// Always run Argon2 verify; even when the user doesn't exist so response time is constant and can't be used to enumerate valid email addresses.
		const hashToCheck = user?.password_hash ?? (await getDummyHash());
		const valid = await verify(hashToCheck, parsed.data.password, ARGON2_OPTS);

		if (!user || !user.password_hash || !valid) {
			return fail(400, { error: errors.invalidCredentials, email: parsed.data.email });
		}

		if (pubEnv.PUBLIC_DEMO_ENABLED === 'true') {
			// Demo mode: always reset locale to English so shared account is never mutated by visitor browser locale.
			if (user.settings?.locale !== 'en') {
				await updateUserSettings(user.id, { locale: 'en' });
			}
		} else {
			// Apply pre-login locale/theme to DB, but only when the DB still has the default value; never overwrite a setting the user already customized.
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
		const data = Object.fromEntries(await request.formData());
		const userLocale =
			((locals.user as any)?.settings?.locale ?? String(data.locale ?? '')) || 'en';
		const messages = localeMessages[userLocale] ?? localeMessages['en'];
		const errors = messages.auth.login.errors;

		const ip = getClientAddress();

		if (!rateLimit(`magic:ip:${ip}`, 50, 60 * 60_000)) {
			return fail(429, { error: errors.rateLimited });
		}

		if (!(await verifyAltcha(data.altcha))) {
			return fail(400, { error: errors.verificationFailed });
		}
		const parsed = MagicLinkRequestSchema.safeParse(data);

		if (!parsed.success) {
			return fail(400, { error: errors.invalidEmail });
		}

		// Per-address: the mail that lands in someone's inbox is the thing worth bounding.
		if (!rateLimit(`magic:email:${parsed.data.email}`, 5, 60 * 60_000)) {
			return fail(429, { error: errors.rateLimited });
		}

		// Same response whether or not the address has an account, so this cannot enumerate users.
		let user = await getUserByEmail(parsed.data.email);
		if (!user && (await isRegistrationOpen())) {
			user = await createUser({ email: parsed.data.email });
		}

		const smtp = isSmtpConfigured();
		if (user) {
			const token = await createMagicLinkToken(user.id);
			if (smtp) await sendMagicLinkEmail(parsed.data.email, token);
			else logMagicLink(parsed.data.email, token);
		}

		return { magic: true, logged: !smtp };
	}
};
