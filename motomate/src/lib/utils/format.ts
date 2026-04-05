/**
 * Locale-aware formatting utilities.
 * All functions accept a locale string (e.g. 'en', 'de', 'fr') from user settings.
 */

const _numFmtCache = new Map<string, Intl.NumberFormat>();
const _currFmtCache = new Map<string, Intl.NumberFormat>();

/** Format an odometer or plain integer with thousand-separators. */
export function formatNumber(value: number, locale = 'en'): string {
	let fmt = _numFmtCache.get(locale);
	if (!fmt) {
		fmt = new Intl.NumberFormat(locale);
		_numFmtCache.set(locale, fmt);
	}
	return fmt.format(value);
}

/** Format cost stored in cents as a locale-aware currency string. */
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

/** Format a YYYY-MM-DD string as a short date (e.g. "12 Jan"). */
export function formatDateShort(dateStr: string, locale = 'en'): string {
	const d = new Date(dateStr + 'T00:00:00'); // force local midnight parse
	return d.toLocaleDateString(locale, { day: 'numeric', month: 'short' });
}

/** Format a YYYY-MM-DD string as a long date (e.g. "12 January 2025"). */
export function formatDateLong(dateStr: string, locale = 'en'): string {
	const d = new Date(dateStr + 'T00:00:00');
	return d.toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' });
}

/**
 * Format a datetime string (SQLite `datetime('now')` returns "YYYY-MM-DD HH:MM:SS")
 * as a short date + time, e.g. "5 Jan 2026, 14:30".
 */
export function formatDateTime(dateStr: string, locale = 'en'): string {
	// SQLite stores datetimes without 'T'; make ISO-compatible before parsing
	const iso = dateStr.includes('T') ? dateStr : dateStr.replace(' ', 'T');
	const d = new Date(iso);
	return d.toLocaleString(locale, {
		day: 'numeric',
		month: 'short',
		year: 'numeric',
		hour: '2-digit',
		minute: '2-digit'
	});
}

/** Format a YYYY-MM key as "Month Year" (e.g. "January 2025"). */
export function formatYearMonth(ym: string, locale = 'en'): string {
	const [y, m] = ym.split('-');
	return new Date(+y, +m - 1).toLocaleDateString(locale, { month: 'long', year: 'numeric' });
}
