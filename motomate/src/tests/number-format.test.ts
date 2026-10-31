import { describe, it, expect } from 'vitest';
import {
	browserNumberFormat,
	formatCurrency,
	formatDateLong,
	formatLocale,
	formatNumber
} from '#lib/utils/format.js';

describe('number format', () => {
	it('keeps language defaults without a number format', () => {
		expect(formatNumber(18400.5, formatLocale('en'))).toBe('18,400.5');
		expect(formatNumber(18400.5, formatLocale('nl'))).toBe('18.400,5');
	});

	it('applies the chosen separators regardless of language', () => {
		expect(formatNumber(18400.5, formatLocale('en', 'dot'))).toBe('18.400,5');
		expect(formatNumber(18400.5, formatLocale('nl', 'comma'))).toBe('18,400.5');
		expect(formatNumber(18400.5, formatLocale('en', 'space'))).toBe('18 400,5');
		expect(formatCurrency(1840050, 'EUR', formatLocale('en', 'dot'))).toBe('€18.400,50');
	});

	it('leaves date formatting untouched', () => {
		expect(formatDateLong('2026-01-05', formatLocale('en', 'dot'))).toBe(
			formatDateLong('2026-01-05', 'en')
		);
	});
});

describe('browserNumberFormat', () => {
	it('uses the first Accept-Language tag', () => {
		expect(browserNumberFormat('en-NL,en;q=0.9,nl;q=0.8')).toBe('dot');
		expect(browserNumberFormat('en-US;q=0.9')).toBe('comma');
		expect(browserNumberFormat('fr-FR')).toBe('space');
	});

	it('detects locales that do not group four-digit numbers', () => {
		expect(browserNumberFormat('es-ES,es;q=0.9')).toBe('dot');
		expect(browserNumberFormat('pt-PT')).toBe('space');
		expect(browserNumberFormat('pl-PL')).toBe('space');
	});

	it('returns null to keep the language default', () => {
		expect(browserNumberFormat('de-CH')).toBeNull();
		expect(browserNumberFormat('not a tag')).toBeNull();
		expect(browserNumberFormat(null)).toBeNull();
		expect(browserNumberFormat('')).toBeNull();
	});
});
