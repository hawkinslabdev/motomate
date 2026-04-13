import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getServiceLogsByVehicle } from '$lib/db/repositories/service-logs.js';
import {
	getFinanceTransactionsByVehicle,
	createFinanceTransaction,
	updateFinanceTransaction,
	deleteFinanceTransaction
} from '$lib/db/repositories/finance-transactions.js';
import { updateUserSettings } from '$lib/db/repositories/users.js';

export const load: PageServerLoad = async ({ parent, params, locals }) => {
	const { vehicle } = await parent();

	// Get all service logs with costs
	const serviceLogs = await getServiceLogsByVehicle(params.id, locals.user!.id);

	// Get all finance transactions
	const financeTransactions = await getFinanceTransactionsByVehicle(params.id, locals.user!.id);

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
			category: tx.category
		}))
	].sort((a, b) => b.date.localeCompare(a.date));

	// Calculate totals
	const totalCents = allTransactions.reduce((sum, tx) => sum + tx.amountCents, 0);
	const totalEntries = allTransactions.length;

	// Group by year, category, and description
	const byYear = new Map<number, number>();
	const byCategory = new Map<string, number>();
	const byDescription = new Map<string, number>();

	const categoryLabels: Record<string, string> = {
		maintenance: 'Maintenance',
		parts: 'Parts',
		accessories: 'Accessories',
		administrative: 'Administrative',
		other: 'Other expenses'
	};

	for (const tx of allTransactions) {
		// Year breakdown
		const year = new Date(tx.date).getFullYear();
		byYear.set(year, (byYear.get(year) || 0) + tx.amountCents);

		// Category breakdown — finance transactions use their category field;
		// service logs (category: null) are grouped under 'service'
		const catKey = tx.category ?? (tx.type === 'service' ? 'service' : 'other');
		byCategory.set(catKey, (byCategory.get(catKey) || 0) + tx.amountCents);

		// Description breakdown — first line of notes, fallback to category label or type
		const descKey =
			tx.notes?.split('\n')[0]?.trim() ||
			(tx.category ? (categoryLabels[tx.category] ?? tx.category) : 'Service entry');
		byDescription.set(descKey, (byDescription.get(descKey) || 0) + tx.amountCents);
	}

	// Sort years descending
	const sortedYears = [...byYear.entries()].sort((a, b) => b[0] - a[0]);

	// Sort categories and descriptions by amount descending
	const sortedCategories = [...byCategory.entries()].sort((a, b) => b[1] - a[1]);
	const sortedDescriptions = [...byDescription.entries()].sort((a, b) => b[1] - a[1]);

	// Get recent transactions (last 10)
	const recentTransactions = allTransactions.slice(0, 10);

	// Calculate total investment (purchase + maintenance)
	const purchasePriceCents = vehicle.purchase_price_cents || 0;
	const totalInvestmentCents = purchasePriceCents + totalCents;

	// Calculate profit/loss if sold
	const soldPriceCents = vehicle.sold_price_cents || null;
	const profitLossCents = soldPriceCents !== null ? soldPriceCents - totalInvestmentCents : null;

	return {
		vehicle,
		totalCents,
		totalEntries,
		byYear: sortedYears,
		byCategory: sortedCategories,
		byDescription: sortedDescriptions,
		recentTransactions,
		currency: (vehicle as any).currency || 'EUR',
		purchasePriceCents,
		soldPriceCents,
		totalInvestmentCents,
		profitLossCents,
		page_prefs: locals.user!.settings?.page_prefs?.finance ?? null
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
			odometer_at_transaction: odometer
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
