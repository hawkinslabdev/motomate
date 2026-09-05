<script lang="ts">
	import type { PageData } from './$types';
	import type { MoneyTotal } from '$lib/utils/money.js';
	import { untrack, tick } from 'svelte';
	import { page } from '$app/state';
	import { replaceState, beforeNavigate } from '$app/navigation';
	import { formatCurrency, formatDateShort, formatMeasurement } from '$lib/utils/format.js';
	import { getMeasurementUnitTranslationKey } from '$lib/utils/measurement.js';
	import { createPrefsSync } from '$lib/utils/prefs-sync.js';
	import { toasts } from '$lib/stores/toasts.svelte.js';
	import ConfirmDialog from '$lib/components/ui/ConfirmDialog.svelte';
	import ViewToggle from '$lib/components/ui/ViewToggle.svelte';
	import ColumnPicker from '$lib/components/ui/ColumnPicker.svelte';
	import TransactionForm from '$lib/components/finance/TransactionForm.svelte';
	import { _, waitLocale } from '$lib/i18n';
	import { quickAdd } from '$lib/stores/quickAdd.svelte.js';
	import { sheet } from '$lib/stores/sheet.svelte.js';

	let {
		data,
		form
	}: { data: PageData; form: { created?: boolean; deleted?: boolean; edited?: boolean } | null } =
		$props();

	$effect(() => {
		waitLocale();
	});

	function openAddForm() {
		sheet.openSheet(TransactionForm, $_('finance.form.addTitle'), {
			vehicleId: data.vehicle.id,
			locale,
			currency,
			odometerUnit: data.vehicle.odometer_unit,
			allDocs: data.allDocs ?? [],
			pagePrefsCategory: data.page_prefs?.last_category,
			onSwitchType: () => {
				sheet.closeSheet();
				quickAdd.open(data.vehicle.id);
			}
		});
	}

	function openEditForm(tx: FinanceTx) {
		entryMenu = null;
		sheet.openSheet(TransactionForm, $_('finance.form.editTitle'), {
			vehicleId: data.vehicle.id,
			locale,
			currency,
			odometerUnit: data.vehicle.odometer_unit,
			allDocs: data.allDocs ?? [],
			editData: {
				id: tx.id,
				category: tx.category ?? 'other',
				amount_cents: tx.amountCents,
				performed_at: tx.date,
				odometer_at_transaction: tx.odometer,
				notes: tx.notes,
				attachments: tx.attachments ?? []
			}
		});
	}

	// Handle ?quick=finance from mobile FAB quick-add flow
	$effect(() => {
		if (page.url.searchParams.get('quick') === 'finance') {
			openAddForm();
			const url = new URL(page.url);
			url.searchParams.delete('quick');
			tick().then(() => replaceState(url, page.state));
		}
	});

	// Handle ?edit=txid; auto-open edit form and highlight the entry
	let highlightId = $state<string | null>(null);
	$effect(() => {
		const editId = page.url.searchParams.get('edit');
		if (!editId) return;
		const tx = data.allTransactions.find((t) => t.id === editId && t.type === 'finance');
		if (tx) {
			openEditForm(tx as FinanceTx);
			highlightId = editId;
			setTimeout(() => (highlightId = null), 1800);
			tick().then(() => {
				document
					.getElementById('tx-' + editId)
					?.scrollIntoView({ behavior: 'smooth', block: 'center' });
			});
		}
		const url = new URL(page.url);
		url.searchParams.delete('edit');
		replaceState(url, page.state);
	});

	const locale = $derived(data.user?.settings?.locale ?? 'en');
	const currency = $derived(data.currency || 'EUR');
	const isHoursVehicle = $derived(data.vehicle.odometer_unit === 'h');
	const unitLabel = $derived($_(getMeasurementUnitTranslationKey(data.vehicle.odometer_unit)));
	const measurementFieldLabel = $derived(
		isHoursVehicle
			? $_('finance.form.usage', { values: { unit: unitLabel } })
			: $_('finance.form.odometer', { values: { unit: unitLabel } })
	);

	// View mode
	let financeViewMode = $state<'timeline' | 'table'>(
		untrack(() => data.page_prefs?.viewMode ?? 'timeline')
	);
	let financeColumnVisible = $state<Record<string, boolean>>(
		untrack(
			() =>
				data.page_prefs?.columnVisibility ?? {
					odometer: true,
					notes: true,
					category: true,
					attachments: false
				}
		)
	);
	let financeColumnOrder = $state<string[]>(
		untrack(
			() =>
				data.page_prefs?.columnOrder ?? [
					'date',
					'category',
					'notes',
					'odometer',
					'amount',
					'attachments'
				]
		)
	);
	let dragColKey = $state<string | null>(null);
	let dragOverKey = $state<string | null>(null);
	let colContextMenu = $state<{ x: number; y: number } | null>(null);
	let financeSortBy = $state<'date' | 'amount' | 'category'>('date');
	let financeSortDir = $state<'asc' | 'desc'>('desc');

	function toggleFinanceSort(col: 'date' | 'amount' | 'category') {
		if (financeSortBy === col) {
			financeSortDir = financeSortDir === 'asc' ? 'desc' : 'asc';
		} else {
			financeSortBy = col;
			financeSortDir = 'desc';
		}
		financePage = 1;
	}

	function onColDragStart(key: string) {
		dragColKey = key;
	}
	function onColDragOver(e: DragEvent, key: string) {
		e.preventDefault();
		dragOverKey = key;
	}
	function onColDrop(key: string) {
		if (!dragColKey || dragColKey === key) {
			dragColKey = null;
			dragOverKey = null;
			return;
		}
		const order = [...financeColumnOrder];
		const from = order.indexOf(dragColKey);
		const to = order.indexOf(key);
		order.splice(from, 1);
		order.splice(to, 0, dragColKey);
		financeColumnOrder = order;
		dragColKey = null;
		dragOverKey = null;
	}
	function onColDragEnd() {
		dragColKey = null;
		dragOverKey = null;
	}
	function onTableContextMenu(e: MouseEvent) {
		e.preventDefault();
		colContextMenu = { x: e.clientX, y: e.clientY };
	}
	function closeColContextMenu() {
		colContextMenu = null;
	}
	function toggleColVisibility(key: string) {
		const col = financeColumns.find((c) => c.key === key);
		if (!col || !col.hideable) return;
		financeColumnVisible = { ...financeColumnVisible, [key]: !(financeColumnVisible[key] ?? true) };
	}

	// Pagination
	let financePage = $state(1);
	const FINANCE_PAGE_SIZE = 25;

	const sortedTransactions = $derived.by(() => {
		const list = [...data.allTransactions];
		list.sort((a, b) => {
			let cmp = 0;
			if (financeSortBy === 'date') cmp = a.date.localeCompare(b.date);
			else if (financeSortBy === 'amount') cmp = a.amountCents - b.amountCents;
			else if (financeSortBy === 'category')
				cmp = (a.category ?? '').localeCompare(b.category ?? '');
			return financeSortDir === 'asc' ? cmp : -cmp;
		});
		return list;
	});

	const totalFinancePages = $derived(
		Math.max(1, Math.ceil(sortedTransactions.length / FINANCE_PAGE_SIZE))
	);

	const pagedTransactions = $derived(
		sortedTransactions.slice((financePage - 1) * FINANCE_PAGE_SIZE, financePage * FINANCE_PAGE_SIZE)
	);

	const financeColumns = [
		{ key: 'date', label: $_('finance.col.date'), hideable: false },
		{ key: 'category', label: $_('finance.col.category'), hideable: true },
		{ key: 'notes', label: $_('finance.col.description'), hideable: true },
		{ key: 'odometer', label: $_('finance.col.odometer'), hideable: true },
		{ key: 'amount', label: $_('finance.col.amount'), hideable: false },
		{ key: 'attachments', label: $_('finance.col.attachments'), hideable: true }
	];

	const orderedVisibleCols = $derived(
		financeColumnOrder
			.map((k) => financeColumns.find((c) => c.key === k)!)
			.filter((c) => c && financeColumnVisible[c.key] !== false)
	);

	// Grouping state
	let groupBy = $state<'category' | 'year' | 'description' | 'none'>(
		untrack(() => data.page_prefs?.groupBy ?? 'category')
	);

	// Persist groupBy, viewMode, columnVisibility
	const prefsSync = createPrefsSync('finance');
	let _firstRun = true;

	beforeNavigate(() => prefsSync.flush());

	$effect(() => {
		const g = groupBy;
		const vm = financeViewMode;
		const cv = financeColumnVisible;
		const co = financeColumnOrder;
		if (_firstRun) {
			_firstRun = false;
			return;
		}
		prefsSync.schedule({ groupBy: g, viewMode: vm, columnVisibility: cv, columnOrder: co });
	});

	const docMap = $derived(new Map((data.allDocs ?? []).map((d) => [d.id, d])));

	type FinanceTx = Extract<(typeof data.allTransactions)[number], { type: 'finance' }>;

	function resolvedAttachments(tx: FinanceTx) {
		return (tx.attachments ?? []).map((id) => docMap.get(id)).filter(Boolean) as NonNullable<
			ReturnType<typeof docMap.get>
		>[];
	}
	// Entry menu state
	let entryMenu = $state<string | null>(null);
	let deletingEntry = $state<{ id: string; type: 'finance' } | null>(null);

	function toggleEntryMenu(id: string) {
		entryMenu = entryMenu === id ? null : id;
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
		{ value: 'fuel', label: $_('finance.categories.fuel') },
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

	function getProfitLossLabel(cents: number) {
		return cents >= 0 ? $_('finance.gain') : $_('finance.loss');
	}

	function getTransactionTitle(tx: (typeof data.allTransactions)[number]) {
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
			const items = (data.byCategory || []).map(([key, total]) => ({
				label: getCategoryLabel(key),
				total,
				key
			}));
			return { label: $_('finance.byCategory'), items };
		}
		if (groupBy === 'year') {
			const items = (data.byYear || [])
				.map(([year, total]) => ({
					label: formatYear(year),
					total,
					key: year.toString()
				}))
				.sort((a, b) => b.key.localeCompare(a.key));
			return { label: $_('finance.byYear'), items };
		}
		if (groupBy === 'description') {
			const items = (data.byDescription || []).map(([desc, total]) => ({
				label: desc,
				total,
				key: desc
			}));
			return { label: $_('finance.byDescription'), items };
		}
		return { label: $_('finance.allTransactions'), items: null };
	});

	$effect(() => {
		const f = form;
		untrack(() => {
			if (f?.created) {
				toasts.success($_('finance.transactionAdded'));
			}
			if (f?.deleted) {
				toasts.success($_('finance.transactionDeleted'));
			}
			if (f?.edited) {
				toasts.success($_('finance.transactionUpdated'));
			}
		});
	});
</script>

<svelte:head><title>{$_('finance.title')} · {data.vehicle.name}</title></svelte:head>

<svelte:window onclick={closeColContextMenu} />

<div class="page-header">
	<div class="page-header-text">
		<h2 class="section-title">{$_('finance.title')}</h2>
		<p class="section-sub">{$_('finance.totalSpent', { values: { name: data.vehicle.name } })}</p>
	</div>
	<div class="page-actions">
		<a href="/insights?v={data.vehicle.id}" class="btn-ghost">{$_('layout.nav.insights')} →</a>
		<button type="button" class="btn-primary" onclick={openAddForm}>
			+ {$_('finance.addExpense')}
		</button>
	</div>
</div>

<div class="page-content">
	{#if !hasTransactions && !hasPurchasePrice}
		<div class="empty-state">
			<span class="empty-emoji">💰</span>
			<p class="empty-title">{$_('finance.empty.title')}</p>
			<p class="empty-desc">{$_('finance.empty.description')}</p>
			<button type="button" class="btn-primary" onclick={openAddForm}>
				+ {$_('finance.addExpense')}
			</button>
		</div>
	{:else}
		{#snippet moneyStat(total: MoneyTotal, showCount = false)}
			{#if total.mixed}
				{#if showCount}
					<span class="money-eyebrow"
						>{$_('finance.investment.currencyCount', {
							values: { count: total.subtotals.length }
						})}</span
					>
				{/if}
				<span class="money-stack">
					{#each total.subtotals as s (s.currency)}
						<span>{formatCurrency(s.cents, s.currency, locale)}</span>
					{/each}
				</span>
			{:else}
				{formatCurrency(total.cents, total.currency, locale)}
			{/if}
		{/snippet}

		<!-- Investment summary -->
		<div class="investment-grid">
			{#if hasPurchasePrice}
				<div class="invest-card">
					<div class="invest-label select-none">{$_('finance.investment.purchasePrice')}</div>
					<div class="invest-amount mono">
						{formatCurrency(data.purchasePriceCents, data.purchasePriceCurrency, locale)}
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
					{@render moneyStat(data.total, true)}
				</div>
				<div class="invest-meta">
					{$_('finance.investment.transactions', { values: { count: data.totalEntries } })}
				</div>
			</div>

			{#if data.vehicle.archived_at && hasPurchasePrice}
				<div class="invest-card">
					<div class="invest-label select-none">{$_('finance.investment.totalInvested')}</div>
					<div class="invest-amount invest-amount--total mono">
						{@render moneyStat(data.totalInvestment, true)}
					</div>
				</div>
			{/if}

			{#if hasSoldPrice}
				<div class="invest-card">
					<div class="invest-label select-none">{$_('finance.investment.soldFor')}</div>
					<div class="invest-amount invest-amount--neutral mono">
						{formatCurrency(data.soldPriceCents!, data.soldPriceCurrency, locale)}
					</div>
				</div>

				{#if data.profitLoss}
					<div class="invest-card invest-card--profit-loss">
						<div class="invest-label">
							{getProfitLossLabel(data.profitLoss.cents)}
						</div>
						<div
							class="invest-amount mono"
							class:invest-amount--profit={data.profitLoss.cents >= 0}
							class:invest-amount--loss={data.profitLoss.cents < 0}
						>
							{data.profitLoss.cents >= 0 ? '+' : ''}{formatCurrency(
								data.profitLoss.cents,
								data.profitLoss.currency,
								locale
							)}
						</div>
					</div>
				{/if}
			{/if}
		</div>

		<!-- Grouping selector -->
		{#if (data.byYear && data.byYear.length > 0) || (data.byCategory && data.byCategory.length > 0)}
			<div class="content-controls">
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
				<div class="view-controls">
					<ViewToggle
						options={[
							{ value: 'timeline', label: $_('common.timeline') },
							{ value: 'table', label: $_('common.table') }
						]}
						value={financeViewMode}
						onchange={(v) => {
							financeViewMode = v as 'timeline' | 'table';
							financePage = 1;
						}}
					/>
					{#if financeViewMode === 'table'}
						<ColumnPicker
							columns={financeColumns}
							visible={financeColumnVisible}
							onchange={(v) => (financeColumnVisible = v)}
						/>
					{/if}
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
								{@render moneyStat(item.total)}
							</span>
						</div>
					{/each}
				</div>
			</div>
		{/if}

		<!-- Transactions -->
		<div class="section">
			<h3 class="section-label">
				{$_('finance.recentTransactions')}
				{#if data.allTransactions.length > 0}
					<span class="section-count">({data.allTransactions.length})</span>
				{/if}
			</h3>

			{#if financeViewMode === 'table'}
				<div class="tx-table-wrap" role="region" oncontextmenu={onTableContextMenu}>
					<table class="tx-table">
						<thead>
							<tr>
								{#each orderedVisibleCols as col (col.key)}
									<th
										class="tx-th"
										class:tx-th--sortable={col.key === 'date' ||
											col.key === 'category' ||
											col.key === 'amount'}
										class:tx-th--right={col.key === 'amount'}
										class:tx-th--center={col.key === 'attachments'}
										class:tx-th--dragging={dragColKey === col.key}
										class:tx-th--dragover={dragOverKey === col.key}
										draggable="true"
										ondragstart={() => onColDragStart(col.key)}
										ondragover={(e) => onColDragOver(e, col.key)}
										ondrop={() => onColDrop(col.key)}
										ondragend={onColDragEnd}
										onclick={() => {
											if (col.key === 'date' || col.key === 'category' || col.key === 'amount') {
												toggleFinanceSort(col.key as 'date' | 'category' | 'amount');
											}
										}}
									>
										{col.key === 'odometer' ? measurementFieldLabel : col.label}
										{#if (col.key === 'date' || col.key === 'category' || col.key === 'amount') && financeSortBy === col.key}
											<span class="sort-arrow">{financeSortDir === 'asc' ? '↑' : '↓'}</span>
										{/if}
										<span class="drag-handle" aria-hidden="true">&#10815;</span>
									</th>
								{/each}
								<th class="tx-th tx-th--center"></th>
							</tr>
						</thead>
						<tbody>
							{#each pagedTransactions as tx}
								<tr id="tx-{tx.id}" class="tx-row" class:tx-row--highlight={highlightId === tx.id}>
									{#each orderedVisibleCols as col (col.key)}
										{#if col.key === 'date'}
											<td class="tx-td mono">{formatDateShort(tx.date, locale)}</td>
										{:else if col.key === 'category'}
											<td class="tx-td">
												<span class="tx-category-badge"
													>{getCategoryLabel(tx.category ?? 'service')}</span
												>
											</td>
										{:else if col.key === 'notes'}
											<td class="tx-td tx-td--notes">{tx.notes?.split('\n')[0] ?? ''}</td>
										{:else if col.key === 'odometer'}
											<td class="tx-td mono">
												{tx.odometer
													? formatMeasurement(tx.odometer, data.vehicle.odometer_unit, locale)
													: ''}
											</td>
										{:else if col.key === 'amount'}
											<td class="tx-td mono tx-td--right"
												>{formatCurrency(tx.amountCents, tx.currency, locale)}</td
											>
										{:else if col.key === 'attachments'}
											<td class="tx-td tx-td--center">
												{#if tx.type === 'finance'}
													{@const attached = resolvedAttachments(tx)}
													{#if attached.length > 0}
														<a
															href="/vehicles/{data.vehicle.id}/documents?highlight={attached[0]
																.id}"
															class="attach-count">{attached.length}</a
														>
													{:else}
														<span class="attach-empty">–</span>
													{/if}
												{/if}
											</td>
										{/if}
									{/each}
									<td class="tx-td tx-td--center">
										{#if tx.type === 'finance'}
											<div class="entry-actions" class:entry-actions--open={entryMenu === tx.id}>
												<button
													class="entry-menu-btn"
													class:active={entryMenu === tx.id}
													onclick={() => toggleEntryMenu(tx.id)}
													aria-label={$_('common.entryOptions')}
													aria-haspopup="true">⋮</button
												>
												{#if entryMenu === tx.id}
													<div class="entry-menu-dropdown" role="menu">
														<button
															role="menuitem"
															class="entry-menu-item"
															onclick={() => openEditForm(tx)}>{$_('common.edit')}</button
														>
														<button
															role="menuitem"
															class="entry-menu-item entry-menu-item--danger"
															onclick={() => {
																deletingEntry = { id: tx.id, type: 'finance' };
																entryMenu = null;
															}}>{$_('common.delete')}</button
														>
													</div>
												{/if}
											</div>
										{/if}
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>

				{#if colContextMenu}
					<div
						class="col-context-menu"
						style="left: {colContextMenu.x}px; top: {colContextMenu.y}px;"
						role="menu"
						tabindex="-1"
						onclick={(e) => e.stopPropagation()}
						onkeydown={(e) => {
							if (e.key === 'Escape') colContextMenu = null;
						}}
					>
						<div class="col-context-title">Columns</div>
						{#each financeColumns as col}
							<label class="col-context-item" class:col-context-item--fixed={!col.hideable}>
								<input
									type="checkbox"
									checked={financeColumnVisible[col.key] !== false}
									disabled={!col.hideable}
									onchange={() => toggleColVisibility(col.key)}
									class="col-context-checkbox"
								/>
								<span>{col.label}</span>
							</label>
						{/each}
					</div>
				{/if}

				{#if totalFinancePages > 1}
					<div class="tx-pagination">
						<button
							type="button"
							class="btn-ghost"
							disabled={financePage <= 1}
							onclick={() => financePage--}>{$_('documents.prevPage')}</button
						>
						<span class="page-label"
							>{$_('documents.pageOf', {
								values: { page: financePage, total: totalFinancePages }
							})}</span
						>
						<button
							type="button"
							class="btn-ghost"
							disabled={financePage >= totalFinancePages}
							onclick={() => financePage++}>{$_('documents.nextPage')}</button
						>
					</div>
				{/if}
			{:else}
				<div class="transaction-list">
					{#each pagedTransactions as tx}
						<div
							id="tx-{tx.id}"
							class="transaction-row"
							class:transaction-row--highlight={highlightId === tx.id}
						>
							<div class="transaction-icon">
								<span class="dot"></span>
							</div>
							<div class="transaction-info">
								<div class="transaction-title">
									{getTransactionTitle(tx)}
									{#if tx.notes && tx.notes.split('\n')[0] !== tx.notes}
										<span class="transaction-note">
											· {tx.notes.split('\n').slice(1).join(' ')}</span
										>
									{/if}
								</div>
								<div class="transaction-meta">
									{formatDateShort(tx.date, locale)}
									{#if tx.odometer}
										<span class="sep">·</span>
										<span class="mono"
											>{formatMeasurement(tx.odometer, data.vehicle.odometer_unit, locale)}</span
										>
									{/if}
									<span class="sep">·</span>
									<span class="tx-category">{getCategoryLabel(tx.category ?? 'service')}</span>
								</div>
								{#if tx.type === 'finance'}
									{@const attached = resolvedAttachments(tx)}
									{#if attached.length > 0}
										<div class="tx-attachments">
											{#each attached as doc}
												<a
													href="/vehicles/{data.vehicle.id}/documents?highlight={doc.id}"
													class="doc-chip doc-chip--link"
												>
													<span class="doc-chip-type">{$_('documents.types.' + doc.doc_type)}</span>
													<span class="doc-chip-name"
														>{doc.name.length > 24 ? doc.name.slice(0, 24) + '…' : doc.name}</span
													>
												</a>
											{/each}
										</div>
									{/if}
								{/if}
							</div>
							<div class="transaction-amount mono">
								{formatCurrency(tx.amountCents, tx.currency, locale)}
							</div>
							{#if tx.type === 'finance'}
								<div class="entry-actions" class:entry-actions--open={entryMenu === tx.id}>
									<button
										class="entry-menu-btn"
										class:active={entryMenu === tx.id}
										onclick={() => toggleEntryMenu(tx.id)}
										aria-label={$_('common.entryOptions')}
										aria-haspopup="true"
									>
										⋮
									</button>
									{#if entryMenu === tx.id}
										<div class="entry-menu-dropdown" role="menu">
											<button
												role="menuitem"
												class="entry-menu-item"
												onclick={() => openEditForm(tx)}
											>
												{$_('common.edit')}
											</button>
											<button
												role="menuitem"
												class="entry-menu-item entry-menu-item--danger"
												onclick={() => {
													deletingEntry = { id: tx.id, type: 'finance' };
													entryMenu = null;
												}}
											>
												{$_('common.delete')}
											</button>
										</div>
									{/if}
								</div>
							{:else}
								<div class="entry-actions">
									<button
										class="entry-menu-btn entry-menu-btn--stub"
										style="opacity: 0;"
										aria-hidden="true"
									>
										⋮
									</button>
								</div>
							{/if}
						</div>
					{/each}
				</div>
				{#if totalFinancePages > 1}
					<div class="tx-pagination">
						<button
							type="button"
							class="btn-ghost"
							disabled={financePage <= 1}
							onclick={() => financePage--}>{$_('documents.prevPage')}</button
						>
						<span class="page-label"
							>{$_('documents.pageOf', {
								values: { page: financePage, total: totalFinancePages }
							})}</span
						>
						<button
							type="button"
							class="btn-ghost"
							disabled={financePage >= totalFinancePages}
							onclick={() => financePage++}>{$_('documents.nextPage')}</button
						>
					</div>
				{/if}
			{/if}
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
	.section-count {
		font-size: var(--text-sm);
		font-weight: 400;
		color: var(--text-muted);
		margin-left: var(--space-1);
	}

	.tx-table-wrap {
		overflow-x: auto;
		border: 1px solid var(--border);
		border-radius: 10px;
	}

	.tx-table {
		width: 100%;
		border-collapse: collapse;
		font-size: var(--text-sm);
	}

	.tx-th {
		padding: 0.625rem 0.875rem;
		text-align: left;
		font-size: var(--text-xs);
		font-weight: 500;
		color: var(--text-muted);
		border-bottom: 1px solid var(--border);
		white-space: nowrap;
		background: var(--bg-subtle);
	}

	.tx-th--sortable {
		cursor: pointer;
		user-select: none;
	}

	.tx-th--sortable:hover {
		color: var(--text);
	}

	.tx-th--right {
		text-align: right;
	}

	.tx-th--center {
		text-align: center;
	}

	.sort-arrow {
		margin-left: 0.25rem;
		color: var(--accent);
	}

	.tx-row {
		border-bottom: 1px solid var(--border);
		transition: background 0.1s;
	}

	.tx-row:last-child {
		border-bottom: none;
	}

	.tx-row:hover {
		background: var(--bg-subtle);
	}

	.tx-row--highlight {
		background: color-mix(in srgb, var(--accent) 6%, var(--bg));
	}

	.tx-td {
		padding: 0.625rem 0.875rem;
		color: var(--text);
		vertical-align: middle;
	}

	.tx-td--right {
		text-align: right;
	}

	.tx-td--center {
		text-align: center;
	}

	.tx-td--notes {
		max-width: 200px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.tx-category-badge {
		font-size: var(--text-xs);
		color: var(--text-muted);
	}

	.attach-count {
		font-size: var(--text-xs);
		color: var(--accent);
		text-decoration: none;
		font-weight: 500;
	}

	.attach-count:hover {
		text-decoration: underline;
	}

	.attach-empty {
		color: var(--text-subtle);
		font-size: var(--text-xs);
	}

	.tx-pagination {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: var(--space-3);
		padding: var(--space-4) 0;
	}

	.page-label {
		font-size: var(--text-sm);
		color: var(--text-muted);
	}

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
		flex-wrap: wrap;
		gap: var(--space-2);
		align-items: center;
		flex-shrink: 0;
	}
	.btn-primary {
		padding: 0.5rem 1rem;
		min-height: 44px;
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
		display: flex;
		flex-direction: column;
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
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		margin-bottom: var(--space-2);
		font-size: var(--text-2xl);
		font-weight: 600;
		font-family: var(--font-mono);
		font-variant-numeric: tabular-nums;
		color: var(--status-ok);
		line-height: 1;
	}
	.money-stack {
		display: inline-flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 0.1rem;
		font-size: var(--text-sm);
		font-weight: 500;
		color: var(--text-muted);
		line-height: 1.35;
	}
	.invest-amount .money-stack {
		align-items: center;
	}
	.money-eyebrow {
		display: block;
		font-size: var(--text-xs);
		font-weight: 500;
		color: var(--text-subtle);
		margin-bottom: var(--space-1);
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

	/* Inline edit form */
	.btn-primary:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}
	/* Content controls row */
	.content-controls {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
		flex-wrap: wrap;
		margin: var(--space-6) 0 0.5rem;
	}
	.view-controls {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		flex-shrink: 0;
	}

	/* Grouping controls */
	.grouping-controls {
		display: flex;
		align-items: center;
		gap: 0.75rem;
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

	.tx-th--dragging {
		opacity: 0.4;
		cursor: grabbing;
	}
	.tx-th--dragover {
		background: var(--accent-subtle);
	}
	.drag-handle {
		margin-left: 4px;
		color: var(--text-subtle);
		font-size: 10px;
		opacity: 0;
		transition: opacity 0.1s;
		cursor: grab;
	}
	.tx-th:hover .drag-handle {
		opacity: 1;
	}
	.col-context-menu {
		position: fixed;
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: 10px;
		box-shadow:
			0 4px 16px rgba(0, 0, 0, 0.1),
			0 1px 4px rgba(0, 0, 0, 0.06);
		z-index: 300;
		min-width: 160px;
		padding: var(--space-2);
	}
	.col-context-title {
		font-size: var(--text-xs);
		font-weight: 600;
		color: var(--text-muted);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		padding: 0.25rem var(--space-2) 0.375rem;
	}
	.col-context-item {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: 0.375rem var(--space-2);
		border-radius: 6px;
		cursor: pointer;
		font-size: var(--text-sm);
		color: var(--text);
		transition: background 0.1s;
	}
	.col-context-item:hover {
		background: var(--bg-muted);
	}
	.col-context-item--fixed {
		opacity: 0.5;
		cursor: default;
	}
	.col-context-item--fixed:hover {
		background: none;
	}
	.col-context-checkbox {
		width: 14px;
		height: 14px;
		flex-shrink: 0;
		accent-color: var(--accent);
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
	.transaction-row--highlight {
		animation: row-highlight 1.8s ease-out forwards;
	}
	@keyframes row-highlight {
		0% {
			background: var(--accent-subtle);
		}
		60% {
			background: var(--accent-subtle);
		}
		100% {
			background: transparent;
		}
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
	.entry-menu-btn--stub:hover {
		opacity: 0 !important;
		cursor: default;
		background: none;
		border-color: transparent;
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

	.doc-chip {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		font-size: var(--text-xs);
		color: var(--text);
		border: 1px solid var(--border);
		border-radius: 6px;
		padding: 2px 6px 2px 4px;
		background: var(--bg);
	}
	.doc-chip-type {
		font-size: 10px;
		font-weight: 500;
		color: var(--text-muted);
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}
	.doc-chip-name {
		color: var(--text);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		max-width: 150px;
	}
	.doc-chip--link {
		text-decoration: none;
		transition:
			border-color 0.1s,
			background 0.1s;
	}
	.doc-chip--link:hover {
		border-color: var(--accent);
		background: var(--accent-subtle);
	}
	.doc-chip--link .doc-chip-type,
	.doc-chip--link .doc-chip-name {
		color: inherit;
	}
	.tx-attachments {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.375rem;
		margin-top: 0.375rem;
	}
	@media (max-width: 640px) {
		.entry-menu-btn {
			opacity: 1;
			width: 44px;
			height: 44px;
		}
		.grouped-amount {
			padding-right: 56px;
		}
		.page-actions {
			flex-direction: row-reverse;
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
