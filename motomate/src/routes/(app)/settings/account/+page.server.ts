import { fail } from '@sveltejs/kit';
import { hash, verify } from '@node-rs/argon2';
import type { Actions, PageServerLoad } from './$types';
import {
	updateUserEmail,
	updateUserPassword,
	getUserById,
	getUserByEmail
} from '$lib/db/repositories/users.js';
import en from '$lib/i18n/locales/en.json';
import de from '$lib/i18n/locales/de.json';
import fr from '$lib/i18n/locales/fr.json';
import es from '$lib/i18n/locales/es.json';
import it from '$lib/i18n/locales/it.json';
import nl from '$lib/i18n/locales/nl.json';
import pt from '$lib/i18n/locales/pt.json';

type AccountErrors = {
	settings: {
		account: {
			email: { errors: { invalid: string; sameAsCurrent: string; alreadyInUse: string } };
			password: {
				errors: {
					allRequired: string;
					tooShort: string;
					noMatch: string;
					noPasswordSet: string;
					incorrect: string;
					sameAsCurrent: string;
				};
			};
		};
	};
};

const localeMessages: Record<string, AccountErrors> = { en, de, fr, es, it, nl, pt };

const ARGON2_OPTS = { memoryCost: 19456, timeCost: 2, outputLen: 32, parallelism: 1 } as const;

export const load: PageServerLoad = async ({ locals }) => {
	return { user: locals.user! };
};

export const actions: Actions = {
	changeEmail: async ({ request, locals }) => {
		const user = locals.user!;
		const userLocale = (user as any)?.settings?.locale ?? 'en';
		const messages = localeMessages[userLocale] ?? localeMessages['en'];
		const errors = messages.settings.account.email.errors;

		const data = Object.fromEntries(await request.formData());
		const newEmail = String(data.email ?? '')
			.trim()
			.toLowerCase();

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

	changePassword: async ({ request, locals }) => {
		const userId = locals.user!.id;
		const userLocale = (locals.user as any)?.settings?.locale ?? 'en';
		const messages = localeMessages[userLocale] ?? localeMessages['en'];
		const errors = messages.settings.account.password.errors;

		const data = Object.fromEntries(await request.formData());

		const currentPassword = String(data.current_password ?? '');
		const newPassword = String(data.new_password ?? '');
		const confirmPassword = String(data.confirm_password ?? '');

		if (!currentPassword || !newPassword) {
			return fail(400, { passwordError: errors.allRequired });
		}
		if (newPassword.length < 8) {
			return fail(400, { passwordError: errors.tooShort });
		}
		if (newPassword !== confirmPassword) {
			return fail(400, { passwordError: errors.noMatch });
		}

		const fullUser = await getUserById(userId);
		if (!fullUser?.password_hash) {
			return fail(400, {
				passwordError: errors.noPasswordSet
			});
		}

		const valid = await verify(fullUser.password_hash, currentPassword, ARGON2_OPTS);
		if (!valid) return fail(400, { passwordError: errors.incorrect });

		const samePassword = await verify(fullUser.password_hash, newPassword, ARGON2_OPTS);
		if (samePassword) return fail(400, { passwordError: errors.sameAsCurrent });

		const passwordHash = await hash(newPassword, ARGON2_OPTS);
		await updateUserPassword(userId, passwordHash);
		return { savedPassword: true };
	}
};
