import { describe, it, expect } from 'vitest';
import { locales } from '$lib/i18n/locales.js';

type Tree = { [key: string]: Tree | string };

const REFERENCE = 'en';
const codes = Object.keys(locales as Record<string, Tree>);
const translations = codes.filter((code) => code !== REFERENCE);

function flatten(tree: Tree, prefix = ''): Map<string, string> {
	const out = new Map<string, string>();
	for (const [key, value] of Object.entries(tree)) {
		const path = prefix ? `${prefix}.${key}` : key;
		if (typeof value === 'string') out.set(path, value);
		else for (const [k, v] of flatten(value, path)) out.set(k, v);
	}
	return out;
}

function placeholders(value: string): string[] {
	return [...value.matchAll(/\{(\w+)[^}]*\}/g)].map((m) => m[1]).sort();
}

const flat = Object.fromEntries(
	codes.map((code) => [code, flatten((locales as Record<string, Tree>)[code])])
);
const reference = flat[REFERENCE];

describe('i18n completeness', () => {
	it('ships more than one locale to compare', () => {
		expect(codes).toContain(REFERENCE);
		expect(translations.length).toBeGreaterThan(0);
	});

	it.each(translations)('%s has every key en has', (code) => {
		const missing = [...reference.keys()].filter((key) => !flat[code].has(key));
		expect(missing).toEqual([]);
	});

	it.each(translations)('%s has no key en does not have', (code) => {
		const extra = [...flat[code].keys()].filter((key) => !reference.has(key));
		expect(extra).toEqual([]);
	});

	it.each(codes)('%s has no empty values', (code) => {
		const blank = [...flat[code].entries()]
			.filter(([, value]) => value.trim() === '')
			.map(([key]) => key);
		expect(blank).toEqual([]);
	});

	it.each(translations)('%s keeps the same interpolation placeholders as en', (code) => {
		const mismatched = [...reference.entries()]
			.filter(([key, value]) => {
				const translated = flat[code].get(key);
				if (translated === undefined) return false;
				return placeholders(value).join(',') !== placeholders(translated).join(',');
			})
			.map(([key]) => key);
		expect(mismatched).toEqual([]);
	});

	it.each(codes)('%s uses no em dash', (code) => {
		const offenders = [...flat[code].entries()]
			.filter(([, value]) => value.includes('—'))
			.map(([key]) => key);
		expect(offenders).toEqual([]);
	});

	// \b is ascii only here
	function words(...alternatives: string[]): RegExp {
		return new RegExp(`(?<![\\p{L}\\p{N}])(?:${alternatives.join('|')})(?![\\p{L}\\p{N}])`, 'iu');
	}

	// lowercase sie means them
	function exactWords(...alternatives: string[]): RegExp {
		return new RegExp(`(?<![\\p{L}\\p{N}])(?:${alternatives.join('|')})(?![\\p{L}\\p{N}])`, 'u');
	}

	const FORMAL_ADDRESS: Record<string, RegExp> = {
		de: exactWords('Sie', 'Ihr', 'Ihre', 'Ihren', 'Ihrem', 'Ihrer', 'Ihres', 'Ihnen'),
		es: words('usted'),
		it: words('Lei', 'La sua', 'Il suo'),
		nl: words('uw'),
		pt: words('você', 'o seu', 'a sua', 'os seus', 'as suas'),
		ro: words('dumneavoastră', 'dumneavoastra')
	};

	it.each(Object.keys(FORMAL_ADDRESS))('%s stays informal throughout', (code) => {
		const pattern = FORMAL_ADDRESS[code];
		const offenders = [...flat[code].entries()]
			.filter(([, value]) => pattern.test(value))
			.map(([key]) => key);
		expect(offenders).toEqual([]);
	});

	it('fr stays formal throughout', () => {
		const informal = words('tu', 'ton', 'ta', 'tes', 'toi');
		const offenders = [...flat['fr'].entries()]
			.filter(([, value]) => informal.test(value))
			.map(([key]) => key);
		expect(offenders).toEqual([]);
	});

	it.each(codes)('%s has no leftover untranslated english copy', (code) => {
		if (code === REFERENCE) return;
		const shared = [...reference.entries()].filter(([key, value]) => {
			const translated = flat[code].get(key);
			if (translated !== value) return false;
			// icu plurals can match legitimately
			if (/\{\s*\w+\s*,\s*(plural|select|selectordinal)\s*,/.test(value)) return false;
			return value.split(/\s+/).length >= 5;
		});
		expect(shared.map(([key]) => key)).toEqual([]);
	});
});
