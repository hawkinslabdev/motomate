import { PUBLIC_DEMO_ENABLED } from '$app/env/public';
import type { LayoutServerLoad } from './$types';
import { supportedLocales } from '#lib/i18n/locales.js';

function localeFromAcceptLanguage(header: string | null): string {
	if (!header) return 'en';
	for (const entry of header.split(',')) {
		const code = entry.split(';')[0].trim().split('-')[0].toLowerCase();
		if ((supportedLocales as string[]).includes(code)) return code;
	}
	return 'en';
}

export const load: LayoutServerLoad = async ({ locals, request, cookies }) => {
	// Demo mode forces English so one visitor's locale does not carry over to the next
	if (PUBLIC_DEMO_ENABLED === 'true' && locals.user) {
		return { user: locals.user, locale: 'en' };
	}

	const locale =
		(locals.user as any)?.settings?.locale ??
		cookies.get('locale') ??
		localeFromAcceptLanguage(request.headers.get('accept-language'));

	return {
		user: locals.user,
		locale: (supportedLocales as string[]).includes(locale) ? locale : 'en'
	};
};
