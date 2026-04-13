<script lang="ts">
	import type { PageData } from './$types';
	import { untrack } from 'svelte';
	import { enhance } from '$app/forms';
	import { page } from '$app/stores';
	import { replaceState, beforeNavigate } from '$app/navigation';
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

	// Handle ?quick=finance from mobile FAB quick-add flow
	$effect(() => {
		if ($page.url.searchParams.get('quick') === 'finance') {
			showForm = true;
			const url = new URL($page.url);
			url.searchParams.delete('quick');
			replaceState(url, $page.state);
		}
	});

	const locale = $derived(data.user?.settings?.locale ?? 'en');
	const currency = $derived(data.currency || 'EUR');

	// Grouping state
	let groupBy = $state<'category' | 'year' | 'description' | 'none'>(
		untrack(() => data.page_prefs?.groupBy ?? 'category')
	);

	// Form state
	let showForm = $state(false);
	let category = $state(untrack(() => data.page_prefs?.last_category ?? 'maintenance'));

	// Re-read last_category from server data each time form opens so it reflects the
	// category saved after the previous submission (data is refreshed by use:enhance update()).
	$effect(() => {
		if (showForm) {
			category = untrack(() => data.page_prefs?.last_category ?? 'maintenance');
		}
	});

	// Persist groupBy and last_category
	let _prefTimer: ReturnType<typeof setTimeout>;
	let _pendingPrefs: object | null = null;
	let _firstRun = true;

	function flushPrefs() {
		if (!_pendingPrefs) return;
		const body = JSON.stringify({ page_prefs: { finance: _pendingPrefs } });
		_pendingPrefs = null;
		clearTimeout(_prefTimer);
		fetch('/api/prefs', {
			method: 'PATCH',
			keepalive: true,
			headers: { 'content-type': 'application/json' },
			body
		});
	}

	beforeNavigate(() => flushPrefs());

	$effect(() => {
		const g = groupBy;
		const c = category;
		if (_firstRun) {
			_firstRun = false;
			return;
		}
		_pendingPrefs = { groupBy: g, last_category: c };
		clearTimeout(_prefTimer);
		_prefTimer = setTimeout(flushPrefs, 600);
	});
	let amount = $state('');
	let date = $state(new Date().toISOString().slice(0, 10));
	let odometer = $state<string>('');
	let notes = $state('');
	let submitting = $state(false);

	// Attachment state for create form
	let attachFile = $state<File | null>(null);
	let attachType = $state('other');
	let showLinkNew = $state(false);
	let newLinkedDocIds = $state(new Set<string>());

	// Attachment state for edit form
	let editAttachFile = $state<File | null>(null);
	let editAttachType = $state('other');
	let editShowLink = $state(false);
	let editUploading = $state(false);

	const docTypeEntries = Object.entries({
		service: 'documents.types.service',
		quotation: 'documents.types.quotation',
		papers: 'documents.types.papers',
		photo: 'documents.types.photo',
		notes: 'documents.types.notes',
		other: 'documents.types.other'
	});

	function handleAttachPick(e: Event) {
		const input = e.target as HTMLInputElement;
		attachFile = input.files?.[0] ?? null;
	}
	function clearAttach() {
		attachFile = null;
	}
	function toggleNewLink(id: string) {
		const next = new Set(newLinkedDocIds);
		next.has(id) ? next.delete(id) : next.add(id);
		newLinkedDocIds = next;
	}

	function handleEditAttachPick(e: Event) {
		const input = e.target as HTMLInputElement;
		editAttachFile = input.files?.[0] ?? null;
	}
	function clearEditAttach() {
		editAttachFile = null;
	}

	const docMap = $derived(new Map((data.allDocs ?? []).map((d) => [d.id, d])));

	function resolvedAttachments(tx: (typeof data.recentTransactions)[number]) {
		return (((tx as any).attachments as string[]) ?? [])
			.map((id) => docMap.get(id))
			.filter(Boolean) as NonNullable<ReturnType<typeof docMap.get>>[];
	}
	function unlinkedDocs(tx: (typeof data.recentTransactions)[number]) {
		const attached = new Set(((tx as any).attachments as string[]) ?? []);
		return (data.allDocs ?? []).filter((d) => !attached.has(d.id));
	}

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
		amount = '';
		date = new Date().toISOString().slice(0, 10);
		odometer = '';
		notes = '';
		attachFile = null;
		newLinkedDocIds = new Set();
		showLinkNew = false;
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
				enctype="multipart/form-data"
				use:enhance={({ formData }) => {
					if (attachFile) formData.set('attachment_file', attachFile);
					for (const id of newLinkedDocIds) formData.append('linked_doc_id', id);
					submitting = true;
					return async ({ update }) => {
						await update();
						submitting = false;
						attachType = 'other';
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

				<div class="form-attachments">
					<span class="field-label"
						>{$_('vehicle.forms.fields.attachments', {
							values: { optional: $_('common.optional') }
						})}</span
					>
					<div class="attach-actions">
						{#if attachFile}
							<span class="doc-chip">
								<span class="doc-chip-name">{attachFile.name}</span>
								<button
									type="button"
									class="doc-chip-remove"
									onclick={clearAttach}
									aria-label="Remove">×</button
								>
							</span>
							<select name="attachment_type" class="input attach-type" bind:value={attachType}>
								{#each docTypeEntries as [val, key]}
									<option value={val}>{$_(key)}</option>
								{/each}
							</select>
						{:else}
							<label class="attach-action-btn">
								<svg
									width="13"
									height="13"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="2"
									stroke-linecap="round"
									stroke-linejoin="round"
									aria-hidden="true"
									><path
										d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"
									/></svg
								>
								{$_('vehicle.forms.attachFile')}
								<input
									type="file"
									class="attach-file-input"
									accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
									onchange={handleAttachPick}
								/>
							</label>
						{/if}
						<button
							type="button"
							class="attach-action-btn"
							onclick={() => (showLinkNew = !showLinkNew)}
						>
							<svg
								width="13"
								height="13"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
								stroke-linecap="round"
								stroke-linejoin="round"
								aria-hidden="true"
								><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path
									d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"
								/></svg
							>
							{$_('vehicle.forms.linkDocument')}
						</button>
					</div>
					{#if showLinkNew}
						<div class="link-picker">
							<div class="link-picker-header">
								<span class="link-picker-title">{$_('vehicle.forms.attachments.pickerTitle')}</span>
								<button
									type="button"
									class="link-picker-close"
									onclick={() => (showLinkNew = false)}>×</button
								>
							</div>
							{#if (data.allDocs ?? []).length === 0}
								<p class="link-picker-empty">{$_('vehicle.forms.attachments.noDocuments')}</p>
							{:else}
								<ul class="link-picker-list">
									{#each data.allDocs as doc}
										<li>
											<label class="link-picker-item link-picker-item--check">
												<input
													type="checkbox"
													checked={newLinkedDocIds.has(doc.id)}
													onchange={() => toggleNewLink(doc.id)}
												/>
												<span class="doc-chip-type">{$_('documents.types.' + doc.doc_type)}</span>
												<span class="link-picker-item-name">{doc.name}</span>
											</label>
										</li>
									{/each}
								</ul>
							{/if}
						</div>
					{/if}
					{#if newLinkedDocIds.size > 0}
						<div class="attach-chips">
							{#each [...newLinkedDocIds] as id}
								{@const doc = docMap.get(id)}
								{#if doc}
									<span class="doc-chip">
										<span class="doc-chip-type">{$_('documents.types.' + doc.doc_type)}</span>
										<span class="doc-chip-name"
											>{doc.name.length > 24 ? doc.name.slice(0, 24) + '…' : doc.name}</span
										>
										<button
											type="button"
											class="doc-chip-remove"
											onclick={() => toggleNewLink(id)}
											aria-label="Remove">×</button
										>
									</span>
								{/if}
							{/each}
						</div>
					{/if}
				</div>

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
				enctype="multipart/form-data"
				use:enhance={({ formData }) => {
					if (attachFile) formData.set('attachment_file', attachFile);
					for (const id of newLinkedDocIds) formData.append('linked_doc_id', id);
					submitting = true;
					return async ({ update }) => {
						await update();
						submitting = false;
						attachType = 'other';
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

				<div class="form-attachments">
					<span class="field-label"
						>{$_('vehicle.forms.fields.attachments', {
							values: { optional: $_('common.optional') }
						})}</span
					>
					<div class="attach-actions">
						{#if attachFile}
							<span class="doc-chip">
								<span class="doc-chip-name">{attachFile.name}</span>
								<button
									type="button"
									class="doc-chip-remove"
									onclick={clearAttach}
									aria-label="Remove">×</button
								>
							</span>
							<select name="attachment_type" class="input attach-type" bind:value={attachType}>
								{#each docTypeEntries as [val, key]}
									<option value={val}>{$_(key)}</option>
								{/each}
							</select>
						{:else}
							<label class="attach-action-btn">
								<svg
									width="13"
									height="13"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="2"
									stroke-linecap="round"
									stroke-linejoin="round"
									aria-hidden="true"
									><path
										d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"
									/></svg
								>
								{$_('vehicle.forms.attachFile')}
								<input
									type="file"
									class="attach-file-input"
									accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
									onchange={handleAttachPick}
								/>
							</label>
						{/if}
						<button
							type="button"
							class="attach-action-btn"
							onclick={() => (showLinkNew = !showLinkNew)}
						>
							<svg
								width="13"
								height="13"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
								stroke-linecap="round"
								stroke-linejoin="round"
								aria-hidden="true"
								><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path
									d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"
								/></svg
							>
							{$_('vehicle.forms.linkDocument')}
						</button>
					</div>
					{#if showLinkNew}
						<div class="link-picker">
							<div class="link-picker-header">
								<span class="link-picker-title">{$_('vehicle.forms.attachments.pickerTitle')}</span>
								<button
									type="button"
									class="link-picker-close"
									onclick={() => (showLinkNew = false)}>×</button
								>
							</div>
							{#if (data.allDocs ?? []).length === 0}
								<p class="link-picker-empty">{$_('vehicle.forms.attachments.noDocuments')}</p>
							{:else}
								<ul class="link-picker-list">
									{#each data.allDocs as doc}
										<li>
											<label class="link-picker-item link-picker-item--check">
												<input
													type="checkbox"
													checked={newLinkedDocIds.has(doc.id)}
													onchange={() => toggleNewLink(doc.id)}
												/>
												<span class="doc-chip-type">{$_('documents.types.' + doc.doc_type)}</span>
												<span class="link-picker-item-name">{doc.name}</span>
											</label>
										</li>
									{/each}
								</ul>
							{/if}
						</div>
					{/if}
					{#if newLinkedDocIds.size > 0}
						<div class="attach-chips">
							{#each [...newLinkedDocIds] as id}
								{@const doc = docMap.get(id)}
								{#if doc}
									<span class="doc-chip">
										<span class="doc-chip-type">{$_('documents.types.' + doc.doc_type)}</span>
										<span class="doc-chip-name"
											>{doc.name.length > 24 ? doc.name.slice(0, 24) + '…' : doc.name}</span
										>
										<button
											type="button"
											class="doc-chip-remove"
											onclick={() => toggleNewLink(id)}
											aria-label="Remove">×</button
										>
									</span>
								{/if}
							{/each}
						</div>
					{/if}
				</div>

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

					{#if editingEntry?.id === tx.id && tx.type === 'finance'}
						<div class="entry-edit-form" use:scrollOnMount>
							<form
								method="POST"
								action="?/editTransaction"
								use:enhance={() => {
									editSubmitting = true;
									return async ({ update }) => {
										await update();
										editSubmitting = false;
										editAttachFile = null;
										editShowLink = false;
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

							<!-- Attachment management — separate form actions -->
							<div class="edit-attachments">
								<span class="field-label"
									>{$_('vehicle.forms.fields.attachments', {
										values: { optional: $_('common.optional') }
									})}</span
								>
								{#if resolvedAttachments(tx).length > 0}
									<div class="attach-chips">
										{#each resolvedAttachments(tx) as doc}
											<span class="doc-chip">
												<span class="doc-chip-type">{$_('documents.types.' + doc.doc_type)}</span>
												<span class="doc-chip-name"
													>{doc.name.length > 24 ? doc.name.slice(0, 24) + '…' : doc.name}</span
												>
												<form method="POST" action="?/unlinkFinanceDocument" use:enhance>
													<input type="hidden" name="transaction_id" value={tx.id} />
													<input type="hidden" name="document_id" value={doc.id} />
													<button type="submit" class="doc-chip-remove" aria-label="Remove"
														>×</button
													>
												</form>
											</span>
										{/each}
									</div>
								{/if}
								<div class="attach-actions">
									<form
										method="POST"
										action="?/uploadToFinanceTransaction"
										enctype="multipart/form-data"
										use:enhance={({ formData }) => {
											if (editAttachFile) formData.set('file', editAttachFile);
											editUploading = true;
											return async ({ update }) => {
												await update();
												editUploading = false;
											};
										}}
									>
										<input type="hidden" name="transaction_id" value={tx.id} />
										{#if editAttachFile}
											<span class="doc-chip">
												<span class="doc-chip-name">{editAttachFile.name}</span>
												<button
													type="button"
													class="doc-chip-remove"
													onclick={clearEditAttach}
													aria-label="Remove">×</button
												>
											</span>
											<select name="doc_type" class="input attach-type" bind:value={editAttachType}>
												{#each docTypeEntries as [val, key]}
													<option value={val}>{$_(key)}</option>
												{/each}
											</select>
											<button type="submit" class="attach-save" disabled={editUploading}>
												{editUploading
													? $_('vehicle.forms.attachments.uploading')
													: $_('common.save')}
											</button>
										{:else}
											<label class="attach-action-btn">
												<svg
													width="13"
													height="13"
													viewBox="0 0 24 24"
													fill="none"
													stroke="currentColor"
													stroke-width="2"
													stroke-linecap="round"
													stroke-linejoin="round"
													aria-hidden="true"
													><path
														d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"
													/></svg
												>
												{$_('vehicle.forms.attachFile')}
												<input
													type="file"
													class="attach-file-input"
													accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
													onchange={handleEditAttachPick}
												/>
											</label>
										{/if}
									</form>
									<button
										type="button"
										class="attach-action-btn"
										onclick={() => (editShowLink = !editShowLink)}
									>
										<svg
											width="13"
											height="13"
											viewBox="0 0 24 24"
											fill="none"
											stroke="currentColor"
											stroke-width="2"
											stroke-linecap="round"
											stroke-linejoin="round"
											aria-hidden="true"
											><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path
												d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"
											/></svg
										>
										{$_('vehicle.forms.linkDocument')}
									</button>
								</div>
								{#if editShowLink}
									{@const available = unlinkedDocs(tx)}
									<div class="link-picker">
										<div class="link-picker-header">
											<span class="link-picker-title"
												>{$_('vehicle.forms.attachments.pickerTitle')}</span
											>
											<button
												type="button"
												class="link-picker-close"
												onclick={() => (editShowLink = false)}>×</button
											>
										</div>
										{#if available.length === 0}
											<p class="link-picker-empty">
												{$_('vehicle.forms.attachments.noDocuments')}
											</p>
										{:else}
											<ul class="link-picker-list">
												{#each available as doc}
													<li>
														<form method="POST" action="?/linkFinanceDocument" use:enhance>
															<input type="hidden" name="transaction_id" value={tx.id} />
															<input type="hidden" name="document_id" value={doc.id} />
															<button type="submit" class="link-picker-item">
																<span class="doc-chip-type"
																	>{$_('documents.types.' + doc.doc_type)}</span
																>
																<span class="link-picker-item-name">{doc.name}</span>
															</button>
														</form>
													</li>
												{/each}
											</ul>
										{/if}
									</div>
								{/if}
							</div>
						</div>
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
		border: 1px solid var(--border);
		border-radius: 8px;
		background: var(--bg-subtle);
		padding: 1rem 1.25rem;
		margin-bottom: 0.5rem;
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

	/* ── Attachment UI ── */
	.form-attachments {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.attach-actions {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
	}
	.attach-action-btn {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		background: none;
		border: 1px solid var(--border);
		border-radius: 6px;
		cursor: pointer;
		font-size: var(--text-sm);
		color: var(--text-muted);
		padding: 0.25rem 0.5rem;
		line-height: 1;
		transition:
			border-color 0.1s,
			color 0.1s;
	}
	.attach-action-btn:hover {
		border-color: var(--border-strong);
		color: var(--text);
	}
	.attach-file-input {
		display: none;
	}
	.attach-type {
		font-size: var(--text-xs) !important;
		padding: 0.25rem 0.375rem !important;
		width: auto !important;
	}
	.attach-chips {
		display: flex;
		flex-wrap: wrap;
		gap: 0.375rem;
	}
	.attach-save {
		padding: 0.25rem 0.75rem;
		background: var(--accent);
		color: #fff;
		border: none;
		border-radius: 6px;
		font-size: var(--text-xs);
		font-weight: 500;
		cursor: pointer;
	}
	.attach-save:hover:not(:disabled) {
		background: var(--accent-hover);
	}
	.attach-save:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}
	.edit-attachments {
		border-top: 1px solid var(--border);
		margin-top: 0.625rem;
		padding-top: 0.625rem;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
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
	.doc-chip-remove {
		background: none;
		border: none;
		cursor: pointer;
		color: var(--text-subtle);
		padding: 0;
		font-size: 0.85rem;
		line-height: 1;
		flex-shrink: 0;
		margin-left: 1px;
	}
	.doc-chip-remove:hover {
		color: var(--status-overdue);
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
	.link-picker {
		margin-top: 0.5rem;
		border: 1px solid var(--border);
		border-radius: 10px;
		background: var(--bg);
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.07);
		overflow: hidden;
		max-width: min(320px, 90vw);
	}
	.link-picker-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.5rem 0.75rem;
		border-bottom: 1px solid var(--border);
	}
	.link-picker-title {
		font-size: var(--text-sm);
		font-weight: 500;
		color: var(--text);
	}
	.link-picker-close {
		background: none;
		border: none;
		cursor: pointer;
		color: var(--text-muted);
		font-size: 1rem;
		padding: 0;
		line-height: 1;
	}
	.link-picker-close:hover {
		color: var(--text);
	}
	.link-picker-empty {
		font-size: var(--text-sm);
		color: var(--text-muted);
		padding: 0.75rem;
		margin: 0;
	}
	.link-picker-list {
		list-style: none;
		margin: 0;
		padding: 0.25rem;
		max-height: 200px;
		overflow-y: auto;
	}
	.link-picker-list li {
		margin: 0;
	}
	.link-picker-item {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		width: 100%;
		padding: 0.375rem 0.5rem;
		background: none;
		border: none;
		border-radius: 6px;
		cursor: pointer;
		text-align: left;
		transition: background 0.1s;
	}
	.link-picker-item:hover {
		background: var(--bg-subtle);
	}
	.link-picker-item--check {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		cursor: pointer;
	}
	.link-picker-item--check input[type='checkbox'] {
		flex-shrink: 0;
	}
	.link-picker-item-name {
		font-size: var(--text-sm);
		color: var(--text);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
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
