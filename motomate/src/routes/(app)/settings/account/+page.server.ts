import { fail, redirect } from '@sveltejs/kit';
import { hash, verify } from '@node-rs/argon2';
import type { Actions, PageServerLoad } from './$types';
import {
	updateUserEmail,
	updateUserPassword,
	getUserById,
	getUserByEmail,
	updateUserSettings,
	deleteUser
} from '$lib/db/repositories/users.js';
import { lucia } from '$lib/auth/index.js';
import { ARGON2_OPTS, isReauthActive, verifyReauth } from '$lib/auth/reauth.js';
import { getOidcConfig } from '$lib/auth/oidc.js';
import { locales as localeMap } from '$lib/i18n/locales.js';

type AccountErrors = {
	settings: {
		account: {
			email: { errors: { invalid: string; sameAsCurrent: string; alreadyInUse: string } };
			delete: { errors: { mismatch: string } };
			password: {
				errors: {
					allRequired: string;
					tooShort: string;
					noMatch: string;
					noPasswordSet: string;
					incorrect: string;
					sameAsCurrent: string;
					reauthRequired: string;
				};
			};
		};
	};
};

const localeMessages: Record<string, AccountErrors> = localeMap;

export const load: PageServerLoad = async ({ locals, url }) => {
	const record = await getUserById(locals.user!.id);
	return {
		user: locals.user!,
		hasPassword: !!record?.password_hash,
		reauthActive: isReauthActive(record?.settings?.reauth_until),
		stepUpProvider: record?.settings?.oidc_sub ? (getOidcConfig()?.name ?? null) : null,
		reauthFailed: url.searchParams.get('error') === 'reauth'
	};
};

export const actions: Actions = {
	changeEmail: async ({ request, locals }) => {
		const user = locals.user!;
		const userLocale = (user as any)?.settings?.locale ?? 'en';
		const messages = localeMessages[userLocale] ?? localeMessages['en'];
		const errors = messages.settings.account.email.errors;
		const passwordErrors = messages.settings.account.password.errors;

		const data = Object.fromEntries(await request.formData());
		const newEmail = String(data.email ?? '')
			.trim()
			.toLowerCase();

		const record = await getUserById(user.id);
		const proof = await verifyReauth(record, String(data.current_password ?? ''));
		if (proof !== 'ok') {
			return fail(400, {
				emailError: proof === 'stepup' ? passwordErrors.reauthRequired : passwordErrors.incorrect
			});
		}

		if (!newEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
			return fail(400, { emailError: errors.invalid });
		}
		if (newEmail === user.email) {
			return fail(400, { emailError: errors.sameAsCurrent });
		}

		const taken = await getUserByEmail(newEmail);
		if (taken) return fail(400, { emailError: errors.alreadyInUse });

		await updateUserEmail(user.id, newEmail);
		return { savedEmail: true };
	},

	changePassword: async ({ request, locals, cookies }) => {
		const userId = locals.user!.id;
		const userLocale = (locals.user as any)?.settings?.locale ?? 'en';
		const messages = localeMessages[userLocale] ?? localeMessages['en'];
		const errors = messages.settings.account.password.errors;

		const data = Object.fromEntries(await request.formData());

		const currentPassword = String(data.current_password ?? '');
		const newPassword = String(data.new_password ?? '');
		const confirmPassword = String(data.confirm_password ?? '');

		const fullUser = await getUserById(userId);
		const reauthActive = isReauthActive(fullUser?.settings?.reauth_until);

		if (!newPassword || (!reauthActive && !currentPassword)) {
			return fail(400, { passwordError: errors.allRequired });
		}
		if (newPassword.length < 8) {
			return fail(400, { passwordError: errors.tooShort });
		}
		if (newPassword !== confirmPassword) {
			return fail(400, { passwordError: errors.noMatch });
		}

		const proof = await verifyReauth(fullUser, currentPassword);
		if (proof !== 'ok') {
			return fail(400, {
				passwordError:
					proof === 'stepup'
						? fullUser?.settings?.oidc_sub
							? errors.reauthRequired
							: errors.noPasswordSet
						: errors.incorrect
			});
		}

		if (fullUser?.password_hash) {
			const samePassword = await verify(fullUser.password_hash, newPassword, ARGON2_OPTS);
			if (samePassword) return fail(400, { passwordError: errors.sameAsCurrent });
		}

		const passwordHash = await hash(newPassword, ARGON2_OPTS);
		await updateUserPassword(userId, passwordHash);

		if (reauthActive) await updateUserSettings(userId, { reauth_until: null });

		await lucia.invalidateUserSessions(userId);
		const session = await lucia.createSession(userId, {});
		const cookie = lucia.createSessionCookie(session.id);
		cookies.set(cookie.name, cookie.value, { path: '/', ...cookie.attributes });

		return { savedPassword: true };
	},

	deleteAccount: async ({ request, locals }) => {
		const userId = locals.user!.id;
		const sessionId = locals.session!.id;
		const userLocale = (locals.user as any)?.settings?.locale ?? 'en';
		const messages = localeMessages[userLocale] ?? localeMessages['en'];

		const data = Object.fromEntries(await request.formData());
		const record = await getUserById(userId);
		const errors = messages.settings.account.password.errors;
		const proof = await verifyReauth(record, String(data.current_password ?? ''));
		if (proof !== 'ok') {
			return fail(400, {
				deleteError: proof === 'stepup' ? errors.reauthRequired : errors.incorrect
			});
		}

		const typed = String(data.confirm_email ?? '')
			.trim()
			.toLowerCase();
		if (typed !== locals.user!.email.trim().toLowerCase()) {
			return fail(400, { deleteError: messages.settings.account.delete.errors.mismatch });
		}

		await deleteUser(userId);
		await lucia.invalidateSession(sessionId);
		throw redirect(302, '/');
	}
};
