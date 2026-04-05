type Messages = Record<string, unknown>;

const cache = new Map<string, Messages>();

async function loadLocale(locale: string): Promise<Messages> {
	if (cache.has(locale)) return cache.get(locale)!;
	try {
		const mod = await import(`./locales/${locale}.json`);
		const messages = mod.default ?? mod;
		cache.set(locale, messages);
		return messages;
	} catch {
		return {};
	}
}

function resolve(obj: Messages, key: string): string | undefined {
	const parts = key.split('.');
	let cur: unknown = obj;
	for (const part of parts) {
		if (cur == null || typeof cur !== 'object') return undefined;
		cur = (cur as Record<string, unknown>)[part];
	}
	return typeof cur === 'string' ? cur : undefined;
}

/**
 * Resolve an i18n key server-side, falling back to English then the key itself.
 * If the key does not look like a dot-path (no dot), it is returned as-is
 * so legacy hardcoded strings still work.
 */
export async function serverT(key: string, locale = 'en'): Promise<string> {
	if (!key.includes('.')) return key;
	const messages = await loadLocale(locale);
	const resolved = resolve(messages, key);
	if (resolved !== undefined) return resolved;
	// Fallback to English
	const en = await loadLocale('en');
	return resolve(en, key) ?? key;
}
