import { describe, expect, it } from 'vitest';
import { primaryCurrency, totalByCurrency } from '#lib/utils/money.js';

describe('totalByCurrency', () => {
	it('collapses an empty set to zero in the fallback currency', () => {
		expect(totalByCurrency([], 'GBP')).toEqual({ mixed: false, cents: 0, currency: 'GBP' });
	});

	it('sums a single-currency set into one value', () => {
		const result = totalByCurrency([
			{ amountCents: 1000, currency: 'EUR' },
			{ amountCents: 500, currency: 'EUR' }
		]);
		expect(result).toEqual({ mixed: false, cents: 1500, currency: 'EUR' });
	});

	it('keeps distinct currencies split into subtotals sorted by magnitude', () => {
		const result = totalByCurrency([
			{ amountCents: 500, currency: 'USD' },
			{ amountCents: 1000, currency: 'EUR' },
			{ amountCents: 200, currency: 'USD' }
		]);
		expect(result).toEqual({
			mixed: true,
			subtotals: [
				{ currency: 'EUR', cents: 1000 },
				{ currency: 'USD', cents: 700 }
			]
		});
	});

	it('falls back to the account currency for a missing code', () => {
		expect(totalByCurrency([{ amountCents: 100, currency: '' }], 'CHF')).toEqual({
			mixed: false,
			cents: 100,
			currency: 'CHF'
		});
	});
});

describe('primaryCurrency', () => {
	const mixed = totalByCurrency([
		{ amountCents: 500, currency: 'USD' },
		{ amountCents: 1000, currency: 'EUR' }
	]);

	it('returns the only currency of a single-currency total', () => {
		expect(primaryCurrency(totalByCurrency([{ amountCents: 100, currency: 'GBP' }]), 'EUR')).toBe(
			'GBP'
		);
	});

	it('prefers the account currency when it is one of the subtotals', () => {
		expect(primaryCurrency(mixed, 'USD')).toBe('USD');
	});

	it('falls back to the largest subtotal when the account currency is absent', () => {
		expect(primaryCurrency(mixed, 'CHF')).toBe('EUR');
	});
});
