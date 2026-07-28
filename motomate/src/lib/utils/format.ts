/* Utility functions for formatting numbers, dates, currencies, etc. in a locale-aware way */
import type { MoneyTotal } from './money.js';

const _numFmtCache = new Map<string, Intl.NumberFormat>();
const _currFmtCache = new Map<string, Intl.NumberFormat>();

/* Format odometer with thousand-seperators */
export function formatNumber(value: number, locale = 'en'): string {
	let fmt = _numFmtCache.get(locale);
	if (!fmt) {
		fmt = new Intl.NumberFormat(locale);
		_numFmtCache.set(locale, fmt);
	}
	return fmt.format(value);
}

/* Format a measurement reading with unit token */
export function formatMeasurement(value: number, unit: string, locale = 'en'): string {
	return `${formatNumber(value, locale)} ${unit}`;
}

/* Format cost stored in cents as a locale-aware currency string */
export function formatCurrency(cents: number, currency = 'EUR', locale = 'en'): string {
	const key = `${locale}:${currency}`;
	let fmt = _currFmtCache.get(key);
	if (!fmt) {
		fmt = new Intl.NumberFormat(locale, {
			style: 'currency',
			currency,
			minimumFractionDigits: 2,
			maximumFractionDigits: 2
		});
		_currFmtCache.set(key, fmt);
	}
	return fmt.format(cents / 100);
}

/* Format a currency-grouped total; mixed currencies render as subtotals joined by a middot */
export function formatMoneyTotal(total: MoneyTotal, locale = 'en'): string {
	if (!total.mixed) return formatCurrency(total.cents, total.currency, locale);
	return total.subtotals.map((s) => formatCurrency(s.cents, s.currency, locale)).join(' · ');
}

/* Format a date string as "5 Jan 2026", omitting the year if its the current yearr */
export function formatDateShort(dateStr: string, locale = 'en'): string {
	const d = new Date(dateStr + 'T00:00:00');
	const now = new Date();
	const currentYear = now.getFullYear();
	const targetYear = d.getFullYear();
	const nextJan1 = new Date(currentYear + 1, 0, 1);
	const monthsDiff = (d.getTime() - now.getTime()) / (30.44 * 24 * 60 * 60 * 1000);
	const includeYear =
		targetYear !== currentYear || d.getTime() > nextJan1.getTime() || monthsDiff > 6;
	const opts: Intl.DateTimeFormatOptions = {
		day: 'numeric',
		month: 'short',
		...(includeYear && { year: '2-digit' })
	};
	return d.toLocaleDateString(locale, opts);
}

/* Format a date string as "5 January 2026" */
export function formatDateLong(dateStr: string, locale = 'en'): string {
	const d = new Date(dateStr + 'T00:00:00');
	return d.toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' });
}

/* Format a datetime string as "5 Jan 2026, 14:30" */
export function formatDateTime(dateStr: string, locale = 'en', timezone?: string): string {
	// SQLite stores datetimes without 'T'; make ISO-compatible before parsing
	const iso = dateStr.includes('T') ? dateStr : dateStr.replace(' ', 'T');
	// SQLite datetime('now') is UTC but omits the Z suffix; append it so Date parses correctly
	const utcIso = iso.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(iso) ? iso : iso + 'Z';
	const d = new Date(utcIso);
	return d.toLocaleString(locale, {
		day: 'numeric',
		month: 'short',
		year: 'numeric',
		hour: '2-digit',
		minute: '2-digit',
		...(timezone ? { timeZone: timezone } : {})
	});
}

/* Format a year-month string like "2024-01" as "January 2024" */
export function formatYearMonth(ym: string, locale = 'en'): string {
	const [y, m] = ym.split('-');
	return new Date(+y, +m - 1).toLocaleDateString(locale, { month: 'long', year: 'numeric' });
}
