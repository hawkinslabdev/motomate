<script lang="ts">
	import type { PageData } from './$types';
	import { enhance } from '$app/forms';
	import { formatCurrency, formatDateShort, formatNumber } from '$lib/utils/format.js';
	import { toasts } from '$lib/stores/toasts.js';
	import ConfirmDialog from '$lib/components/ui/ConfirmDialog.svelte';
	import { _, waitLocale } from '$lib/i18n';
	import { quickAdd } from '$lib/stores/quickAdd.js';

	let {
		data,
		form
	}: { data: PageData; form: { created?: boolean; deleted?: boolean; edited?: boolean } | null } =
		$props();

	$effect(() => {
		waitLocale();
	});

	const locale = $derived(data.user?.settings?.locale ?? 'en');
	const currency = $derived(data.currency || 'EUR');

	// Grouping state
	let groupBy = $state<'category' | 'year' | 'description' | 'none'>('category');

	// Form state
	let showForm = $state(false);
	let category = $state('maintenance');
	let amount = $state('');
	let date = $state(new Date().toISOString().slice(0, 10));
	let odometer = $state<string>('');
	let notes = $state('');
	let submitting = $state(false);

	// Entry menu state
	let entryMenu = $state<string | null>(null);
	let editingEntry = $state<{ id: string; type: 'finance' } | null>(null);
	let editSubmitting = $state(false);
	let deletingEntry = $state<{ id: string; type: 'finance' } | null>(null);

	function toggleEntryMenu(id: string) {
		entryMenu = entryMenu === id ? null : id;
	}

	function startEdit(id: string, type: 'finance') {
		editingEntry = { id, type };
		entryMenu = null;
	}

	// Edit form state
	let editCategory = $state('maintenance');
	let editAmount = $state('');
	let editDate = $state('');
	let editOdometer = $state<string>('');
	let editNotes = $state('');

	function prepareEdit(tx: (typeof data.recentTransactions)[number]) {
		editCategory = tx.category || 'other';
		editAmount = tx.amountCents ? (tx.amountCents / 100).toFixed(2) : '';
		editDate = tx.date;
		editOdometer = tx.odometer ? String(tx.odometer) : '';
		editNotes = tx.notes || '';
	}

	// Empty state check
	const hasTransactions = $derived(data.totalEntries > 0);
	const hasPurchasePrice = $derived(data.purchasePriceCents > 0);
	const hasSoldPrice = $derived(data.soldPriceCents !== null && data.soldPriceCents !== undefined);

	const categoryOptions = $derived([
		{ value: 'maintenance', label: $_('finance.categories.maintenance') },
		{ value: 'parts', label: $_('finance.categories.parts') },
		{ value: 'accessories', label: $_('finance.categories.accessories') },
		{ value: 'administrative', label: $_('finance.categories.administrative') },
		{ value: 'other', label: $_('finance.categories.other') }
	]);

	// Format helpers
	function formatYear(year: number) {
		return year.toString();
	}

	function getCategoryLabel(key: string) {
		if (key === 'service') return $_('finance.categories.maintenance');
		const opt = categoryOptions.find((o) => o.value === key);
		return opt?.label ?? key.charAt(0).toUpperCase() + key.slice(1);
	}

	function getProfitLossLabel(cents: number | null) {
		if (cents === null) return '';
		if (cents >= 0) return $_('finance.gain');
		return $_('finance.loss');
	}

	function getTransactionTitle(tx: (typeof data.recentTransactions)[number]) {
		if (tx.type === 'finance' && tx.category) {
			return getCategoryLabel(tx.category);
		}
		return (
			tx.notes?.split('\n')[0] ??
			(tx.type === 'service' ? $_('finance.serviceEntry') : $_('finance.expense'))
		);
	}

	// Compute grouped data based on selection
	const groupedData = $derived.by(() => {
		if (groupBy === 'category') {
			const items = (data.byCategory || []).map(([key, cents]) => ({
				label: getCategoryLabel(key),
				cents,
				key
			}));
			return { label: $_('finance.byCategory'), items };
		}
		if (groupBy === 'year') {
			const items = (data.byYear || [])
				.map(([year, cents]) => ({
					label: formatYear(year),
					cents,
					key: year.toString()
				}))
				.sort((a, b) => b.key.localeCompare(a.key));
			return { label: $_('finance.byYear'), items };
		}
		if (groupBy === 'description') {
			const items = (data.byDescription || []).map(([desc, cents]) => ({
				label: desc,
				cents,
				key: desc
			}));
			return { label: $_('finance.byDescription'), items };
		}
		return { label: $_('finance.allTransactions'), items: null };
	});

	$effect(() => {
		if (form?.created) {
			toasts.success($_('finance.transactionAdded'));
			showForm = false;
			resetForm();
		}
		if (form?.deleted) {
			toasts.success($_('finance.transactionDeleted'));
		}
		if (form?.edited) {
			toasts.success($_('finance.transactionUpdated'));
			editingEntry = null;
		}
	});

	function resetForm() {
		category = 'maintenance';
		amount = '';
		date = new Date().toISOString().slice(0, 10);
		odometer = '';
		notes = '';
	}

	function scrollOnMount(node: HTMLElement) {
		if (typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches) {
			requestAnimationFrame(() => {
				node.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
			});
		}
		return {};
	}
</script>

<svelte:head><title>{$_('finance.title')} · {data.vehicle.name}</title></svelte:head>

<div class="page-header">
	<div class="page-header-text">
		<h2 class="section-title">{$_('finance.title')}</h2>
		<p class="section-sub">{$_('finance.totalSpent', { values: { name: data.vehicle.name } })}</p>
	</div>
	<div class="page-actions">
		{#if showForm && window.innerWidth > 768}
			<button type="button" class="btn-ghost" onclick={() => (showForm = false)}>
				{$_('common.cancel')}
			</button>
		{:else}
			<button
				type="button"
				class="btn-primary"
				onclick={() =>
					window.innerWidth <= 768 ? quickAdd.open(data.vehicle.id) : (showForm = true)}
			>
				+ {$_('finance.addExpense')}
			</button>
		{/if}
	</div>
</div>

<div class="page-content">
	{#if !hasTransactions && !hasPurchasePrice}
		{#if showForm}
			<form
				method="POST"
				action="?/addTransaction"
				use:enhance={() => {
					submitting = true;
					return async ({ update }) => {
						await update();
						submitting = false;
					};
				}}
				use:scrollOnMount
				class="add-form"
			>
				<div class="form-header">
					<span class="form-title">{$_('finance.form.addTitle')}</span>
					<button type="button" class="form-close" onclick={() => (showForm = false)}>✕</button>
				</div>

				<div class="form-row">
					<label class="field">
						<span class="field-label">{$_('finance.form.category')}</span>
						<select name="category" bind:value={category} class="input">
							{#each categoryOptions as opt}
								<option value={opt.value}>{opt.label}</option>
							{/each}
						</select>
					</label>

					<label class="field">
						<span class="field-label">{$_('finance.form.amount', { values: { currency } })}</span>
						<input
							type="number"
							name="amount"
							bind:value={amount}
							min="0"
							step="0.01"
							placeholder="0.00"
							class="input mono"
							required
						/>
					</label>
				</div>

				<div class="form-row">
					<label class="field">
						<span class="field-label">{$_('finance.form.date')}</span>
						<input type="date" name="date" bind:value={date} class="input" required />
					</label>

					<label class="field">
						<span class="field-label"
							>{$_('finance.form.odometer', { values: { unit: data.vehicle.odometer_unit } })}</span
						>
						<input
							type="number"
							name="odometer"
							bind:value={odometer}
							min="0"
							placeholder={$_('finance.form.odometerOptional')}
							class="input mono"
						/>
					</label>
				</div>

				<label class="field">
					<span class="field-label">{$_('finance.form.notes')}</span>
					<input
						type="text"
						name="notes"
						bind:value={notes}
						placeholder="e.g., Motor oil, 4 liters"
						maxlength="200"
						class="input"
					/>
				</label>

				<div class="form-actions">
					<button type="submit" class="btn-primary" disabled={submitting}>
						{submitting ? $_('finance.saving') : $_('finance.save')}
					</button>
					<button type="button" class="btn-cancel" onclick={() => (showForm = false)}>
						{$_('finance.cancel')}
					</button>
				</div>
			</form>
		{:else}
			<div class="empty-state">
				<span class="empty-emoji">💰</span>
				<p class="empty-title">{$_('finance.empty.title')}</p>
				<p class="empty-desc">{$_('finance.empty.description')}</p>
			</div>
		{/if}
	{:else}
		{#if showForm}
			<form
				method="POST"
				action="?/addTransaction"
				use:enhance={() => {
					submitting = true;
					return async ({ update }) => {
						await update();
						submitting = false;
					};
				}}
				use:scrollOnMount
				class="add-form"
			>
				<div class="form-header">
					<span class="form-title">{$_('finance.form.addTitle')}</span>
					<button type="button" class="form-close" onclick={() => (showForm = false)}>✕</button>
				</div>

				<div class="form-row">
					<label class="field">
						<span class="field-label">{$_('finance.form.category')}</span>
						<select name="category" bind:value={category} class="input">
							{#each categoryOptions as opt}
								<option value={opt.value}>{opt.label}</option>
							{/each}
						</select>
					</label>

					<label class="field">
						<span class="field-label">{$_('finance.form.amount', { values: { currency } })}</span>
						<input
							type="number"
							name="amount"
							bind:value={amount}
							min="0"
							step="0.01"
							placeholder="0.00"
							class="input mono"
							required
						/>
					</label>
				</div>

				<div class="form-row">
					<label class="field">
						<span class="field-label">{$_('finance.form.date')}</span>
						<input type="date" name="date" bind:value={date} class="input" required />
					</label>

					<label class="field">
						<span class="field-label"
							>{$_('finance.form.odometer', { values: { unit: data.vehicle.odometer_unit } })}</span
						>
						<input
							type="number"
							name="odometer"
							bind:value={odometer}
							min="0"
							placeholder={$_('finance.form.odometerOptional')}
							class="input mono"
						/>
					</label>
				</div>

				<label class="field">
					<span class="field-label">{$_('finance.form.notes')}</span>
					<input
						type="text"
						name="notes"
						bind:value={notes}
						placeholder="e.g., Motor oil, 4 liters"
						maxlength="200"
						class="input"
					/>
				</label>

				<div class="form-actions">
					<button type="submit" class="btn-primary" disabled={submitting}>
						{submitting ? $_('finance.saving') : $_('finance.save')}
					</button>
					<button type="button" class="btn-cancel" onclick={() => (showForm = false)}>
						{$_('finance.cancel')}
					</button>
				</div>
			</form>
		{/if}

		<!-- Investment summary -->
		<div class="investment-grid">
			{#if hasPurchasePrice}
				<div class="invest-card">
					<div class="invest-label select-none">{$_('finance.investment.purchasePrice')}</div>
					<div class="invest-amount mono">
						{formatCurrency(data.purchasePriceCents, currency, locale)}
					</div>
				</div>
			{:else}
				<div class="invest-card invest-card--hint">
					<div class="invest-label select-none">{$_('finance.investment.purchasePrice')}</div>
					<div class="invest-amount invest-amount--hint mono">
						{$_('finance.investment.notSet')}
					</div>
					<p class="invest-hint select-none">{$_('finance.investment.addHint')}</p>
				</div>
			{/if}

			<div class="invest-card">
				<div class="invest-label select-none">{$_('finance.investment.expenses')}</div>
				<div class="invest-amount invest-amount--neutral mono">
					{formatCurrency(data.totalCents, currency, locale)}
				</div>
				<div class="invest-meta">
					{$_('finance.investment.transactions', { values: { count: data.totalEntries } })}
				</div>
			</div>

			{#if data.vehicle.archived_at && hasPurchasePrice}
				<div class="invest-card">
					<div class="invest-label select-none">{$_('finance.investment.totalInvested')}</div>
					<div class="invest-amount invest-amount--total mono">
						{formatCurrency(data.totalInvestmentCents, currency, locale)}
					</div>
				</div>
			{/if}

			{#if hasSoldPrice}
				<div class="invest-card">
					<div class="invest-label select-none">{$_('finance.investment.soldFor')}</div>
					<div class="invest-amount invest-amount--neutral mono">
						{formatCurrency(data.soldPriceCents!, currency, locale)}
					</div>
				</div>

				<div class="invest-card invest-card--profit-loss">
					<div class="invest-label">
						{getProfitLossLabel(data.profitLossCents)}
					</div>
					<div
						class="invest-amount mono"
						class:invest-amount--profit={data.profitLossCents! >= 0}
						class:invest-amount--loss={data.profitLossCents! < 0}
					>
						{data.profitLossCents! >= 0 ? '+' : ''}{formatCurrency(
							data.profitLossCents!,
							currency,
							locale
						)}
					</div>
				</div>
			{/if}
		</div>

		<!-- Grouping selector -->
		{#if (data.byYear && data.byYear.length > 0) || (data.byCategory && data.byCategory.length > 0)}
			<div class="grouping-controls">
				<span class="grouping-label">{$_('finance.groupBy')}</span>
				<div class="grouping-options">
					<button
						type="button"
						class="grouping-btn"
						class:grouping-btn--active={groupBy === 'category'}
						onclick={() => (groupBy = 'category')}
					>
						{$_('finance.groupCategory')}
					</button>
					<button
						type="button"
						class="grouping-btn"
						class:grouping-btn--active={groupBy === 'year'}
						onclick={() => (groupBy = 'year')}
					>
						{$_('finance.groupYear')}
					</button>
					<button
						type="button"
						class="grouping-btn"
						class:grouping-btn--active={groupBy === 'description'}
						onclick={() => (groupBy = 'description')}
					>
						{$_('finance.groupDescription')}
					</button>
					<button
						type="button"
						class="grouping-btn"
						class:grouping-btn--active={groupBy === 'none'}
						onclick={() => (groupBy = 'none')}
					>
						{$_('finance.groupNone')}
					</button>
				</div>
			</div>
		{/if}

		<!-- Grouped breakdown -->
		{#if groupedData.items && groupedData.items.length > 0}
			<div class="section">
				<h3 class="section-label">{groupedData.label}</h3>
				<div class="grouped-list">
					{#each groupedData.items as item}
						<div class="grouped-row">
							<span class="grouped-label">{item.label}</span>
							<span class="grouped-amount mono">
								{formatCurrency(item.cents, currency, locale)}
							</span>
						</div>
					{/each}
				</div>
			</div>
		{/if}

		<!-- Recent transactions (always shown) -->
		<div class="section">
			<h3 class="section-label">{$_('finance.recentTransactions')}</h3>
			<div class="transaction-list">
				{#each data.recentTransactions as tx}
					<div class="transaction-row">
						<div class="transaction-icon">
							<span class="dot"></span>
						</div>
						<div class="transaction-info">
							<div class="transaction-title">
								{getTransactionTitle(tx)}
								{#if tx.notes && tx.notes.split('\n')[0] !== tx.notes}
									<span class="transaction-note"> · {tx.notes.split('\n').slice(1).join(' ')}</span>
								{/if}
							</div>
							<div class="transaction-meta">
								{formatDateShort(tx.date, locale)}
								{#if tx.odometer}
									<span class="sep">·</span>
									<span class="mono"
										>{formatNumber(tx.odometer, locale)} {data.vehicle.odometer_unit}</span
									>
								{/if}
								{#if tx.category && tx.type === 'finance'}
									<span class="sep">·</span>
									<span class="tx-category">{getCategoryLabel(tx.category)}</span>
								{/if}
							</div>
						</div>
						<div class="transaction-amount mono">
							{formatCurrency(tx.amountCents, currency, locale)}
						</div>
						{#if tx.type === 'finance'}
							<div class="entry-actions" class:entry-actions--open={entryMenu === tx.id}>
								<button
									class="entry-menu-btn"
									class:active={entryMenu === tx.id}
									onclick={() => toggleEntryMenu(tx.id)}
									aria-label="Entry options"
									aria-haspopup="true"
								>
									⋮
								</button>
								{#if entryMenu === tx.id}
									<div class="entry-menu-dropdown" role="menu">
										<button
											role="menuitem"
											class="entry-menu-item"
											onclick={() => {
												prepareEdit(tx);
												startEdit(tx.id, 'finance');
											}}
										>
											Edit
										</button>
										<button
											role="menuitem"
											class="entry-menu-item entry-menu-item--danger"
											onclick={() => {
												deletingEntry = { id: tx.id, type: 'finance' };
												entryMenu = null;
											}}
										>
											Delete
										</button>
									</div>
								{/if}
							</div>
						{/if}
					</div>

					{#if editingEntry?.id === tx.id && tx.type === 'finance'}
						<form
							method="POST"
							action="?/editTransaction"
							class="entry-edit-form"
							use:scrollOnMount
							use:enhance={() => {
								editSubmitting = true;
								return async ({ update }) => {
									await update();
									editSubmitting = false;
								};
							}}
						>
							<input type="hidden" name="id" value={tx.id} />
							<div class="form-row">
								<label class="field">
									<span class="field-label">{$_('finance.form.category')}</span>
									<select name="category" bind:value={editCategory} class="input">
										{#each categoryOptions as opt}
											<option value={opt.value}>{opt.label}</option>
										{/each}
									</select>
								</label>
								<label class="field">
									<span class="field-label"
										>{$_('finance.form.amount', { values: { currency } })}</span
									>
									<input
										type="number"
										name="amount"
										bind:value={editAmount}
										min="0"
										step="0.01"
										class="input mono"
										required
									/>
								</label>
							</div>
							<div class="form-row">
								<label class="field">
									<span class="field-label">{$_('finance.form.date')}</span>
									<input type="date" name="date" bind:value={editDate} class="input" required />
								</label>
								<label class="field">
									<span class="field-label"
										>{$_('finance.form.odometer', {
											values: { unit: data.vehicle.odometer_unit }
										})}</span
									>
									<input
										type="number"
										name="odometer"
										bind:value={editOdometer}
										min="0"
										placeholder={$_('finance.form.odometerOptional')}
										class="input mono"
									/>
								</label>
							</div>
							<label class="field">
								<span class="field-label">{$_('finance.form.notes')}</span>
								<input
									type="text"
									name="notes"
									bind:value={editNotes}
									placeholder={$_('finance.form.notesPlaceholder')}
									maxlength="200"
									class="input"
								/>
							</label>
							<div class="form-actions">
								<button type="submit" class="btn-primary" disabled={editSubmitting}>
									{editSubmitting ? $_('finance.saving') : $_('finance.save')}
								</button>
								<button type="button" class="btn-cancel" onclick={() => (editingEntry = null)}>
									{$_('finance.cancel')}
								</button>
							</div>
						</form>
					{/if}
				{/each}
			</div>
		</div>
	{/if}

	{#if deletingEntry}
		<ConfirmDialog
			open={true}
			title={$_('finance.deleteDialog.title')}
			description={$_('finance.deleteDialog.description')}
			confirmLabel={$_('finance.deleteDialog.confirm')}
			cancelLabel={$_('finance.deleteDialog.cancel')}
			danger={true}
			loading={false}
			onconfirm={() => {
				const form = document.createElement('form');
				form.method = 'POST';
				form.action = '?/deleteTransaction';
				const input = document.createElement('input');
				input.type = 'hidden';
				input.name = 'id';
				input.value = deletingEntry!.id;
				form.appendChild(input);
				document.body.appendChild(form);
				form.submit();
			}}
			onclose={() => (deletingEntry = null)}
		/>
	{/if}
</div>

<style>
	.page-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--space-4);
		flex-wrap: wrap;
		margin-bottom: var(--space-6);
	}
	.page-header-text {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}
	.section-title {
		font-size: var(--text-lg);
		font-weight: 600;
		color: var(--text);
		margin: 0;
	}
	.section-sub {
		font-size: var(--text-sm);
		color: var(--text-muted);
		margin: 0;
	}
	.page-actions {
		display: flex;
		gap: var(--space-2);
		align-items: center;
		flex-shrink: 0;
	}
	.btn-primary {
		padding: 0.5rem 1rem;
		background: var(--accent);
		color: #fff;
		border: none;
		border-radius: 10px;
		font-size: var(--text-sm);
		font-weight: 500;
		cursor: pointer;
	}
	.btn-primary:hover:not(:disabled) {
		background: var(--accent-hover);
	}

	/* Investment grid */
	.investment-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
		gap: 1rem;
	}
	.invest-card {
		background: var(--bg-subtle);
		border: 1px solid var(--border);
		border-radius: 10px;
		padding: 1.25rem;
		text-align: center;
	}
	.invest-card--hint {
		border-style: dashed;
		opacity: 0.8;
	}
	.invest-card--profit-loss {
		border-width: 2px;
	}
	.invest-label {
		font-size: var(--text-xs);
		color: var(--text-muted);
		margin-bottom: 0.5rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}
	.invest-amount {
		font-size: var(--text-2xl);
		font-weight: 600;
		font-family: var(--font-mono);
		font-variant-numeric: tabular-nums;
		color: var(--status-ok);
		line-height: 1;
	}
	.invest-amount--neutral {
		color: var(--text);
	}
	.invest-amount--total {
		color: var(--text);
		font-size: var(--text-3xl);
	}
	.invest-amount--hint {
		color: var(--text-subtle);
		font-size: var(--text-lg);
	}
	.invest-amount--profit {
		color: var(--status-ok);
	}
	.invest-amount--loss {
		color: var(--status-overdue);
	}
	.invest-meta {
		font-size: var(--text-xs);
		color: var(--text-subtle);
		margin-top: 0.5rem;
	}
	.invest-hint {
		font-size: var(--text-xs);
		color: var(--text-subtle);
		margin: 0.5rem 0 0;
	}

	/* Add form */
	.add-form {
		border: 1px solid var(--border);
		border-radius: 10px;
		padding: 1.25rem 1.5rem;
		background: var(--bg-subtle);
		display: flex;
		flex-direction: column;
		gap: 1rem;
		margin-bottom: var(--space-6);
		scroll-margin-top: 1rem;
	}

	/* Inline edit form */
	.entry-edit-form {
		padding: 1.25rem 0 1rem;
		border-bottom: 1px solid var(--border);
		display: flex;
		flex-direction: column;
		gap: 0.875rem;
		scroll-margin-top: 1rem;
	}
	.form-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}
	.form-title {
		font-size: var(--text-base);
		font-weight: 600;
		color: var(--text);
	}
	.form-close {
		background: none;
		border: none;
		font-size: 1.25rem;
		color: var(--text-muted);
		cursor: pointer;
		padding: 0.25rem;
		line-height: 1;
		border-radius: 4px;
	}
	.form-close:hover {
		background: var(--bg-muted);
		color: var(--text);
	}
	.form-row {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.75rem;
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}
	.field-label {
		font-size: var(--text-sm);
		font-weight: 500;
		color: var(--text-muted);
	}
	.input {
		padding: 0.75rem;
		border: 1px solid var(--border);
		border-radius: 10px;
		background: var(--bg);
		color: var(--text);
		font-size: var(--text-md);
		min-height: 48px;
	}
	.input:hover {
		border-color: var(--border-strong);
	}
	.input:focus {
		outline: 2px solid var(--accent);
		outline-offset: 1px;
		border-color: var(--accent);
	}
	.form-actions {
		display: flex;
		gap: 0.75rem;
		margin-top: 0.5rem;
	}
	.btn-primary:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}
	.btn-cancel {
		padding: 0.75rem 1.25rem;
		background: none;
		border: 1px solid var(--border);
		color: var(--text-muted);
		border-radius: 10px;
		font-size: var(--text-sm);
		font-weight: 500;
		cursor: pointer;
		min-height: 48px;
	}
	.btn-cancel:hover {
		background: var(--bg-muted);
		color: var(--text);
	}

	/* Grouping controls */
	.grouping-controls {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		margin: var(--space-6) 0 0.5rem;
		flex-wrap: wrap;
	}
	.grouping-label {
		font-size: var(--text-sm);
		color: var(--text-muted);
		font-weight: 500;
	}
	.grouping-options {
		display: flex;
		flex-wrap: wrap;
		gap: 0.375rem;
	}
	.grouping-btn {
		padding: 0.375rem 0.75rem;
		background: var(--bg-subtle);
		border: 1px solid var(--border);
		border-radius: 8px;
		font-size: var(--text-sm);
		font-weight: 500;
		color: var(--text-muted);
		cursor: pointer;
		transition:
			background 0.1s,
			border-color 0.1s,
			color 0.1s;
	}
	.grouping-btn:hover {
		background: var(--bg-muted);
		border-color: var(--border-strong);
		color: var(--text);
	}
	.grouping-btn--active {
		background: var(--accent);
		border-color: var(--accent);
		color: #fff;
	}

	/* Grouped list */
	.grouped-list {
		display: flex;
		flex-direction: column;
		border-top: 1px solid var(--border);
	}
	.grouped-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.875rem 0;
		border-bottom: 1px solid var(--border);
		transition: background 0.15s ease-out-quart;
	}
	.grouped-row:hover {
		background: var(--bg-subtle);
	}
	.grouped-label {
		font-size: var(--text-base);
		font-weight: 500;
		color: var(--text);
	}
	.grouped-amount {
		font-size: var(--text-base);
		font-weight: 500;
		color: var(--text);
		padding-right: 48px; /* Match entry-menu-btn width for alignment */
	}

	/* Sections */
	.section {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		margin-top: var(--space-6);
	}
	.section-label {
		font-size: var(--text-xs);
		font-weight: 600;
		color: var(--text-muted);
		text-transform: uppercase;
		letter-spacing: 0.07em;
		margin: 0;
	}

	/* Transaction list */
	.transaction-list {
		display: flex;
		flex-direction: column;
		border-top: 1px solid var(--border);
	}
	.transaction-row {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.875rem 0;
		border-bottom: 1px solid var(--border);
		transition: background 0.15s ease-out-quart;
	}
	.transaction-row:hover {
		background: var(--bg-subtle);
	}
	.transaction-icon {
		flex-shrink: 0;
	}
	.dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: var(--text-subtle);
		display: block;
	}
	.transaction-info {
		flex: 1;
		min-width: 0;
	}
	.transaction-title {
		font-size: var(--text-base);
		font-weight: 500;
		color: var(--text);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.transaction-note {
		font-weight: 400;
		color: var(--text-subtle);
	}
	.transaction-meta {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem;
		align-items: center;
		font-size: var(--text-sm);
		color: var(--text-muted);
		margin-top: 0.25rem;
	}
	.sep {
		color: var(--text-subtle);
	}
	.tx-category {
		background: var(--bg-muted);
		border: 1px solid var(--border);
		border-radius: 4px;
		padding: 0.0625rem 0.375rem;
		font-size: var(--text-xs);
	}
	.transaction-amount {
		font-size: var(--text-base);
		font-weight: 500;
		color: var(--text);
		flex-shrink: 0;
	}

	/* Empty state */
	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		text-align: center;
		padding: 3rem 1.5rem;
	}
	.empty-emoji {
		font-size: 3rem;
		margin-bottom: 1rem;
		opacity: 0.8;
	}
	.empty-title {
		font-size: var(--text-lg);
		font-weight: 600;
		color: var(--text);
		margin: 0 0 0.5rem;
	}
	.empty-desc {
		font-size: var(--text-sm);
		color: var(--text-muted);
		margin: 0;
		line-height: var(--leading-base);
		max-width: 320px;
	}

	/* Entry action menu */
	.entry-actions {
		position: relative;
		flex-shrink: 0;
		align-self: center;
	}
	.entry-menu-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 36px;
		height: 36px;
		background: none;
		border: 1px solid transparent;
		border-radius: 6px;
		color: var(--text-subtle);
		font-size: 1rem;
		line-height: 1;
		cursor: pointer;
		opacity: 0;
		transition:
			opacity 0.15s,
			background 0.15s,
			border-color 0.15s;
	}
	.transaction-row:hover .entry-menu-btn,
	.entry-menu-btn:focus,
	.entry-menu-btn.active {
		opacity: 1;
	}
	.entry-menu-btn:hover,
	.entry-menu-btn.active {
		background: var(--bg-muted);
		color: var(--text);
	}
	.entry-menu-dropdown {
		position: absolute;
		right: 0;
		top: calc(100% + 4px);
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: 8px;
		padding: 0.25rem;
		min-width: 120px;
		box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
		z-index: 20;
	}
	.entry-menu-item {
		display: block;
		width: 100%;
		padding: 0.5rem 0.75rem;
		background: none;
		border: none;
		border-radius: 6px;
		font-size: var(--text-sm);
		font-weight: 500;
		color: var(--text);
		cursor: pointer;
		text-align: left;
		min-height: 40px;
	}
	.entry-menu-item:hover {
		background: var(--bg-muted);
	}
	.entry-menu-item--danger {
		color: var(--status-overdue);
	}
	.entry-menu-item--danger:hover {
		background: color-mix(in srgb, var(--status-overdue) 8%, transparent);
	}

	/* Mono helper */
	.mono {
		font-family: var(--font-mono);
		font-variant-numeric: tabular-nums;
	}

	@media (max-width: 640px) {
		.form-row {
			grid-template-columns: 1fr;
		}
		.entry-menu-btn {
			opacity: 1;
			width: 44px;
			height: 44px;
		}
		.grouped-amount {
			padding-right: 56px;
		}
	}
	.btn-ghost {
		background: transparent;
		color: var(--text-muted);
		padding: 0.625rem 1rem;
		border: 1px solid var(--border);
		border-radius: 0.375rem;
		font-size: var(--text-sm);
		font-weight: 500;
		cursor: pointer;
		transition:
			background 0.1s,
			color 0.1s;
	}
	.btn-ghost:hover {
		background: var(--bg-subtle);
		color: var(--text);
	}
</style>
