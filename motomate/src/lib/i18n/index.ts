import { register, init, locale, _, waitLocale } from 'svelte-i18n';
import { browser } from '$app/env';
import { supportedLocales } from './locales.js';

/* To add new locale: add JSON to locales/, register below AND add to `locales.ts` */
register('en', () => import('./locales/en.json'));
register('de', () => import('./locales/de.json'));
register('fr', () => import('./locales/fr.json'));
register('it', () => import('./locales/it.json'));
register('es', () => import('./locales/es.json'));
register('nl', () => import('./locales/nl.json'));
register('pt', () => import('./locales/pt.json'));
register('ro', () => import('./locales/ro.json'));

export function readStoredLocale(): string {
	if (!browser) return 'en';
	const stored = localStorage.getItem('locale');
	if (stored && (supportedLocales as string[]).includes(stored)) return stored;
	for (const lang of navigator.languages ?? [navigator.language]) {
		const code = lang.split('-')[0].toLowerCase();
		if ((supportedLocales as string[]).includes(code)) return code;
	}
	return 'en';
}

export function setLocale(code: string): void {
	locale.set(code);
	localStorage.setItem('locale', code);
	document.cookie = `locale=${code}; path=/; max-age=31536000; SameSite=Lax`;
}

function detectInitialLocale(): string {
	return browser ? readStoredLocale() : 'en';
}

init({
	fallbackLocale: 'en',
	initialLocale: detectInitialLocale()
});

export function setUserLocale(userLocale?: string) {
	if (userLocale) {
		locale.set(userLocale);
	}
}

export { locale, _, waitLocale };
