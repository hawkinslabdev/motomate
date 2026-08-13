/* Currency-aware aggregation: Amounts with different currency codes are tracked separately rather than summed together. */

export interface CurrencyAmount {
	amountCents: number;
	currency: string;
}

export interface CurrencySubtotal {
	currency: string;
	cents: number;
}

export type MoneyTotal =
	| { mixed: false; cents: number; currency: string }
	| { mixed: true; subtotals: CurrencySubtotal[] };

export function totalByCurrency(items: CurrencyAmount[], fallbackCurrency = 'EUR'): MoneyTotal {
	const byCurrency = new Map<string, number>();
	for (const item of items) {
		const code = item.currency || fallbackCurrency;
		byCurrency.set(code, (byCurrency.get(code) ?? 0) + item.amountCents);
	}

	if (byCurrency.size <= 1) {
		const [code, cents] = byCurrency.entries().next().value ?? [fallbackCurrency, 0];
		return { mixed: false, cents, currency: code };
	}

	const subtotals = [...byCurrency.entries()]
		.map(([currency, cents]) => ({ currency, cents }))
		.sort((a, b) => Math.abs(b.cents) - Math.abs(a.cents));
	return { mixed: true, subtotals };
}

/* Determines the primary display currency: uses the preferred account currency if available, otherwise defaults to the currency with the largest subtotal. */
export function primaryCurrency(total: MoneyTotal, preferred: string): string {
	if (!total.mixed) return total.currency;
	return total.subtotals.some((s) => s.currency === preferred)
		? preferred
		: total.subtotals[0].currency;
}
