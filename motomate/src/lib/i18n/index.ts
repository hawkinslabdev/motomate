import { register, init, locale, _, waitLocale } from 'svelte-i18n';
import { browser } from '$app/environment';

register('en', () => import('./locales/en.json'));
register('de', () => import('./locales/de.json'));
register('fr', () => import('./locales/fr.json'));
register('it', () => import('./locales/it.json'));
register('es', () => import('./locales/es.json'));
register('nl', () => import('./locales/nl.json'));
register('pt', () => import('./locales/pt.json'));

const SUPPORTED_LOCALES = ['en', 'de', 'fr', 'it', 'es', 'nl', 'pt'];

function detectInitialLocale(): string {
	if (!browser) return 'en';
	const stored = localStorage.getItem('locale');
	if (stored && SUPPORTED_LOCALES.includes(stored)) return stored;
	return 'en';
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
