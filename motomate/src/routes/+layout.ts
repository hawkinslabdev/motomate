import { locale, waitLocale } from 'svelte-i18n';
import '#lib/i18n/index.js';

export const load = async ({ data }: { data: { locale?: string; formatLocale: string } }) => {
	// Locale resolved server-side (DB > cookie > Accept-Language) so server and client agree and hydration dont mismatch
	locale.set(data.locale ?? 'en');
	await waitLocale();
	return { formatLocale: data.formatLocale };
};
