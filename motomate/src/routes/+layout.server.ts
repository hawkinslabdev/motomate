import { PUBLIC_DEMO_ENABLED } from '$app/env/public';
import type { LayoutServerLoad } from './$types';
import { supportedLocales } from '#lib/i18n/locales.js';
import { browserNumberFormat, formatLocale } from '#lib/utils/format.js';
import { updateUserSettings } from '#lib/db/repositories/users.js';

function localeFromAcceptLanguage(header: string | null): string {
	if (!header) return 'en';
	for (const entry of header.split(',')) {
		const code = entry.split(';')[0].trim().split('-')[0].toLowerCase();
		if ((supportedLocales as string[]).includes(code)) return code;
	}
	return 'en';
}

export const load: LayoutServerLoad = async ({ locals, request, cookies }) => {
	const acceptLanguage = request.headers.get('accept-language');
	const detected = browserNumberFormat(acceptLanguage);
	const numberFormat = locals.user?.settings?.number_format ?? detected;

	// Stored for output rendered without a browser request, such as notifications
	if (
		locals.user &&
		acceptLanguage &&
		PUBLIC_DEMO_ENABLED !== 'true' &&
		(locals.user.settings?.detected_number_format ?? null) !== detected
	) {
		await updateUserSettings(locals.user.id, { detected_number_format: detected });
	}

	// Demo mode forces English so one visitor's locale does not carry over to the next
	if (PUBLIC_DEMO_ENABLED === 'true' && locals.user) {
		return { user: locals.user, locale: 'en', formatLocale: formatLocale('en', numberFormat) };
	}

	const locale =
		(locals.user as any)?.settings?.locale ??
		cookies.get('locale') ??
		localeFromAcceptLanguage(acceptLanguage);
	const safeLocale = (supportedLocales as string[]).includes(locale) ? locale : 'en';

	return {
		user: locals.user,
		locale: safeLocale,
		formatLocale: formatLocale(safeLocale, numberFormat)
	};
};
