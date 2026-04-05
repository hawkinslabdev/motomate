import type { LayoutServerLoad } from './$types';

const SUPPORTED_LOCALES = ['en', 'de', 'fr', 'it', 'es', 'nl', 'pt'];

function localeFromAcceptLanguage(header: string | null): string {
	if (!header) return 'en';
	for (const entry of header.split(',')) {
		const code = entry.split(';')[0].trim().split('-')[0].toLowerCase();
		if (SUPPORTED_LOCALES.includes(code)) return code;
	}
	return 'en';
}

export const load: LayoutServerLoad = async ({ locals, request, cookies }) => {
	const locale =
		(locals.user as any)?.settings?.locale ??
		cookies.get('locale') ??
		localeFromAcceptLanguage(request.headers.get('accept-language'));

	return {
		user: locals.user,
		locale: SUPPORTED_LOCALES.includes(locale) ? locale : 'en'
	};
};
