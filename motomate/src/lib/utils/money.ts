/* Currency-aware aggregation; since amounts carry a per-row currency and are never converted, so distinct codes stay separate(d?) instead of being summed together. */

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
