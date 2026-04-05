import { browser } from '$app/environment';
import { locale, waitLocale } from 'svelte-i18n';
import '$lib/i18n';

export const load = async ({ data }: { data: { locale?: string } }) => {
	// data.locale is resolved server-side from: user DB settings → locale cookie → Accept-Language.
	// The cookie is written by the auth layout and app layout on every locale change, so server
	// and client always agree — no hydration mismatch, no locale flash.
	locale.set(data.locale ?? 'en');
	await waitLocale();
};
