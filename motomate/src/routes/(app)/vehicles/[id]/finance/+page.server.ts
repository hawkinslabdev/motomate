import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getServiceLogsByVehicle } from '$lib/db/repositories/service-logs.js';
import {
	getFinanceTransactionsByVehicle,
	createFinanceTransaction,
	updateFinanceTransaction,
	updateFinanceTransactionAttachments,
	deleteFinanceTransaction
} from '$lib/db/repositories/finance-transactions.js';
import { getDocumentsByVehicle } from '$lib/db/repositories/documents.js';
import { totalByCurrency, type CurrencyAmount, type MoneyTotal } from '$lib/utils/money.js';
import { collectAttachmentIds } from '$lib/server/finance-attachments.js';
import { updateUserSettings } from '$lib/db/repositories/users.js';

export const load: PageServerLoad = async ({ parent, params, locals }) => {
	const { vehicle } = await parent();

	// Get all service logs with costs
	const serviceLogs = await getServiceLogsByVehicle(params.id, locals.user!.id);

	// Get all finance transactions
	const financeTransactions = await getFinanceTransactionsByVehicle(params.id, locals.user!.id);

	// Get all vehicle documents (for attachment link picker)
	const allDocs = await getDocumentsByVehicle(params.id, locals.user!.id);

	// Filter service logs with costs
	const serviceLogsWithCosts = serviceLogs.filter((log) => log.cost_cents && log.cost_cents > 0);

	// Combine all transactions (service logs + finance transactions)
	const allTransactions = [
		...serviceLogsWithCosts.map((log) => ({
			id: log.id,
			type: 'service' as const,
			date: log.performed_at,
			odometer: log.odometer_at_service,
			amountCents: log.cost_cents!,
			currency: log.currency,
			notes: log.notes,
			category: null // service logs don't have category
		})),
		...financeTransactions.map((tx) => ({
			id: tx.id,
			type: 'finance' as const,
			date: tx.performed_at,
			odometer: tx.odometer_at_transaction,
			amountCents: tx.amount_cents,
			currency: tx.currency,
			notes: tx.notes,
			category: tx.category,
			attachments: tx.attachments
		}))
	].sort((a, b) => b.date.localeCompare(a.date));

	const account = locals.user!.settings?.currency ?? 'EUR';

	const total = totalByCurrency(allTransactions, account);
	const totalEntries = allTransactions.length;

	const byYear = new Map<number, CurrencyAmount[]>();
	const byCategory = new Map<string, CurrencyAmount[]>();
	const byDescription = new Map<string, CurrencyAmount[]>();

	const categoryLabels: Record<string, string> = {
		maintenance: 'Maintenance',
		parts: 'Parts',
		accessories: 'Accessories',
		administrative: 'Administrative',
		other: 'Other expenses'
	};

	const pushAmount = <K>(map: Map<K, CurrencyAmount[]>, key: K, item: CurrencyAmount) => {
		const bucket = map.get(key);
		if (bucket) bucket.push(item);
		else map.set(key, [item]);
	};

	for (const tx of allTransactions) {
		const item: CurrencyAmount = { amountCents: tx.amountCents, currency: tx.currency };

		const year = new Date(tx.date).getFullYear();
		pushAmount(byYear, year, item);

		// Note finance transactions use their category field; service logs (category: null) are grouped under 'service'
		const catKey = tx.category ?? (tx.type === 'service' ? 'service' : 'other');
		pushAmount(byCategory, catKey, item);

		// Description breakdown; first line of notes, fallback to category label or type
		const descKey =
			tx.notes?.split('\n')[0]?.trim() ||
			(tx.category ? (categoryLabels[tx.category] ?? tx.category) : 'Service entry');
		pushAmount(byDescription, descKey, item);
	}

	const magnitude = (t: MoneyTotal) =>
		t.mixed ? t.subtotals.reduce((s, x) => s + Math.abs(x.cents), 0) : Math.abs(t.cents);

	const sortedYears = [...byYear.entries()]
		.map(([year, items]) => [year, totalByCurrency(items, account)] as const)
		.sort((a, b) => b[0] - a[0]);
	const sortedCategories = [...byCategory.entries()]
		.map(([key, items]) => [key, totalByCurrency(items, account)] as const)
		.sort((a, b) => magnitude(b[1]) - magnitude(a[1]));
	const sortedDescriptions = [...byDescription.entries()]
		.map(([key, items]) => [key, totalByCurrency(items, account)] as const)
		.sort((a, b) => magnitude(b[1]) - magnitude(a[1]));

	// Older rows predate the purchase/sold price currency columns; fall back to the account currency for those
	const purchasePriceCents = vehicle.purchase_price_cents || 0;
	const purchasePriceCurrency = vehicle.purchase_price_currency ?? account;
	const investmentItems: CurrencyAmount[] = [
		...(purchasePriceCents > 0
			? [{ amountCents: purchasePriceCents, currency: purchasePriceCurrency }]
			: []),
		...allTransactions.map((tx) => ({ amountCents: tx.amountCents, currency: tx.currency }))
	];
	const totalInvestment = totalByCurrency(investmentItems, account);

	// Profit/loss only computes when sold price and investment share one currency
	const soldPriceCents = vehicle.sold_price_cents || null;
	const soldPriceCurrency = vehicle.sold_price_currency ?? account;
	const profitLoss =
		soldPriceCents !== null &&
		!totalInvestment.mixed &&
		totalInvestment.currency === soldPriceCurrency
			? { cents: soldPriceCents - totalInvestment.cents, currency: soldPriceCurrency }
			: null;

	return {
		vehicle,
		total,
		totalEntries,
		byYear: sortedYears,
		byCategory: sortedCategories,
		byDescription: sortedDescriptions,
		allTransactions,
		currency: account,
		purchasePriceCents,
		purchasePriceCurrency,
		soldPriceCents,
		soldPriceCurrency,
		totalInvestment,
		profitLoss,
		page_prefs: locals.user!.settings?.page_prefs?.finance ?? null,
		allDocs
	};
};

export const actions: Actions = {
	addTransaction: async ({ request, locals, params }) => {
		const formData = await request.formData();
		const category = String(formData.get('category') || 'other');
		const amount = String(formData.get('amount') || '');
		const date = String(formData.get('date') || '');
		const odometer = formData.get('odometer') ? Number(formData.get('odometer')) : null;
		const notes = String(formData.get('notes') || '').trim() || null;

		// Validate
		if (!amount || !date) {
			return fail(400, { error: 'Amount and date are required' });
		}

		const amountCents = Math.round(parseFloat(amount) * 100);
		if (isNaN(amountCents) || amountCents <= 0) {
			return fail(400, { error: 'Invalid amount' });
		}

		if (!date.match(/^\d{4}-\d{2}-\d{2}$/)) {
			return fail(400, { error: 'Invalid date format' });
		}

		// Validate category
		const validCategories = [
			'maintenance',
			'parts',
			'accessories',
			'administrative',
			'fuel',
			'other'
		];
		if (!validCategories.includes(category)) {
			return fail(400, { error: 'Invalid category' });
		}

		const attachments = await collectAttachmentIds(formData, locals.user!.id, params.id);
		if ('error' in attachments) return fail(attachments.status, { error: attachments.error });

		// Create transaction
		await createFinanceTransaction(locals.user!.id, {
			vehicle_id: params.id,
			category: category as
				| 'maintenance'
				| 'parts'
				| 'accessories'
				| 'administrative'
				| 'fuel'
				| 'other',
			amount_cents: amountCents,
			currency: (locals.user as any)?.settings?.currency || 'EUR',
			notes,
			performed_at: date,
			odometer_at_transaction: odometer,
			attachments: attachments.ids
		});

		// Persist last used category so the form pre-selects it next time
		const existingPrefs = (locals.user as any)?.settings?.page_prefs ?? {};
		await updateUserSettings(locals.user!.id, {
			page_prefs: {
				...existingPrefs,
				finance: { ...(existingPrefs.finance ?? {}), last_category: category }
			}
		});

		return { created: true };
	},

	editTransaction: async ({ request, locals, params }) => {
		const formData = await request.formData();
		const id = String(formData.get('id') || '');
		const category = String(formData.get('category') || 'other');
		const amount = String(formData.get('amount') || '');
		const date = String(formData.get('date') || '');
		const odometer = formData.get('odometer') ? Number(formData.get('odometer')) : null;
		const notes = String(formData.get('notes') || '').trim() || null;

		// Validate
		if (!id || !amount || !date) {
			return fail(400, { error: 'Missing required fields' });
		}

		const amountCents = Math.round(parseFloat(amount) * 100);
		if (isNaN(amountCents) || amountCents <= 0) {
			return fail(400, { error: 'Invalid amount' });
		}

		if (!date.match(/^\d{4}-\d{2}-\d{2}$/)) {
			return fail(400, { error: 'Invalid date format' });
		}

		// Validate category
		const validCategories = [
			'maintenance',
			'parts',
			'accessories',
			'administrative',
			'fuel',
			'other'
		];
		if (!validCategories.includes(category)) {
			return fail(400, { error: 'Invalid category' });
		}

		const attachments = await collectAttachmentIds(formData, locals.user!.id, params.id);
		if ('error' in attachments) return fail(attachments.status, { error: attachments.error });

		// Update transaction
		await updateFinanceTransaction(id, params.id, locals.user!.id, {
			category: category as
				| 'maintenance'
				| 'parts'
				| 'accessories'
				| 'administrative'
				| 'fuel'
				| 'other',
			amount_cents: amountCents,
			notes,
			performed_at: date,
			odometer_at_transaction: odometer
		});

		// The form submits the attachments it kept plus anything newly linked, so replace the list
		await updateFinanceTransactionAttachments(id, params.id, locals.user!.id, attachments.ids);

		return { edited: true };
	},

	deleteTransaction: async ({ request, locals, params }) => {
		const formData = await request.formData();
		const id = String(formData.get('id') || '');

		if (!id) {
			return fail(400, { error: 'Missing transaction ID' });
		}

		await deleteFinanceTransaction(id, params.id, locals.user!.id);

		return { deleted: true };
	}
};
