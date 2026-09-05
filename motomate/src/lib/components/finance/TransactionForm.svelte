<script lang="ts">
	import { enhance } from '$app/forms';
	import { SvelteSet } from 'svelte/reactivity';
	import { untrack } from 'svelte';
	import { sheet } from '$lib/stores/sheet.svelte.js';
	import { _, waitLocale } from '$lib/i18n';
	import { getMeasurementUnitTranslationKey } from '$lib/utils/measurement.js';
	import { drafts } from '$lib/stores/drafts.svelte.js';
	import DraftBanner from '$lib/components/ui/DraftBanner.svelte';

	interface DocRecord {
		id: string;
		name: string;
		doc_type: string;
	}

	interface EditData {
		id: string;
		category: string;
		amount_cents: number;
		performed_at: string;
		odometer_at_transaction?: number | null;
		notes?: string | null;
		attachments?: string[] | null;
	}

	let {
		vehicleId,
		locale: _locale,
		currency,
		odometerUnit,
		allDocs = [],
		pagePrefsCategory,
		editData,
		onSwitchType
	}: {
		vehicleId: string;
		locale: string;
		currency: string;
		odometerUnit: 'km' | 'mi' | 'h';
		allDocs?: DocRecord[];
		pagePrefsCategory?: string;
		editData?: EditData;
		onSwitchType?: () => void;
	} = $props();

	const _initDraft = untrack(() =>
		!editData && vehicleId ? drafts.get(vehicleId, 'finance') : null
	);

	$effect(() => {
		waitLocale();
	});

	const isHoursVehicle = $derived(odometerUnit === 'h');
	const unitLabel = $derived($_(getMeasurementUnitTranslationKey(odometerUnit)));
	const measurementFieldLabel = $derived(
		isHoursVehicle
			? $_('finance.form.usage', { values: { unit: unitLabel } })
			: $_('finance.form.odometer', { values: { unit: unitLabel } })
	);

	const categoryOptions = $derived([
		{ value: 'maintenance', label: $_('finance.categories.maintenance') },
		{ value: 'parts', label: $_('finance.categories.parts') },
		{ value: 'accessories', label: $_('finance.categories.accessories') },
		{ value: 'administrative', label: $_('finance.categories.administrative') },
		{ value: 'fuel', label: $_('finance.categories.fuel') },
		{ value: 'other', label: $_('finance.categories.other') }
	]);

	const docTypeEntries = Object.entries({
		service: 'documents.types.service',
		quotation: 'documents.types.quotation',
		papers: 'documents.types.papers',
		photo: 'documents.types.photo',
		notes: 'documents.types.notes',
		other: 'documents.types.other'
	});

	let category = $state(
		untrack(
			() =>
				(_initDraft?.fields.category as string) ??
				editData?.category ??
				pagePrefsCategory ??
				'maintenance'
		)
	);
	let amount = $state(
		untrack(
			() =>
				(_initDraft?.fields.amount as string) ??
				(editData ? String(editData.amount_cents / 100) : '')
		)
	);
	let date = $state(
		untrack(
			() =>
				(_initDraft?.fields.date as string) ??
				editData?.performed_at ??
				new Date().toISOString().slice(0, 10)
		)
	);
	let odometer = $state(
		untrack(
			() =>
				(_initDraft?.fields.odometer as string) ??
				(editData?.odometer_at_transaction != null ? String(editData.odometer_at_transaction) : '')
		)
	);
	let notes = $state(untrack(() => (_initDraft?.fields.notes as string) ?? editData?.notes ?? ''));
	let showDraftBanner = $state(untrack(() => !!_initDraft && !editData));
	let submitting = $state(false);

	let attachFile = $state<File | null>(null);
	let attachType = $state('other');
	let showLinkNew = $state(false);
	// Seeded with what the transaction already has, so editing submits the kept list and drops removals
	let newLinkedDocIds = new SvelteSet<string>(untrack(() => editData?.attachments ?? []));

	const docMap = $derived(new Map(allDocs.map((d) => [d.id, d])));

	function handleAttachPick(e: Event) {
		const input = e.target as HTMLInputElement;
		attachFile = input.files?.[0] ?? null;
		saveDraft();
	}
	function clearAttach() {
		attachFile = null;
		saveDraft();
	}
	function toggleLink(id: string) {
		if (newLinkedDocIds.has(id)) newLinkedDocIds.delete(id);
		else newLinkedDocIds.add(id);
	}
	function saveDraft() {
		if (!vehicleId || editData) return;
		drafts.save(
			vehicleId,
			'finance',
			{ category, amount, date, odometer, notes },
			attachFile !== null
		);
		sheet.hint = $_('draft.autosaved');
	}
	function discardDraft() {
		if (vehicleId) drafts.clear(vehicleId, 'finance');
		showDraftBanner = false;
		category = pagePrefsCategory ?? 'maintenance';
		amount = '';
		date = new Date().toISOString().slice(0, 10);
		odometer = '';
		notes = '';
		attachFile = null;
	}
</script>

<form
	method="POST"
	action={editData ? '?/editTransaction' : '?/addTransaction'}
	enctype="multipart/form-data"
	class="tx-form"
	use:enhance={({ formData }) => {
		if (attachFile) formData.set('attachment_file', attachFile);
		for (const id of newLinkedDocIds) formData.append('linked_doc_id', id);
		submitting = true;
		return async ({ result, update }) => {
			await update();
			submitting = false;
			attachType = 'other';
			if (result.type === 'success') {
				if (vehicleId && !editData) drafts.clear(vehicleId, 'finance');
				sheet.closeSheet();
			}
		};
	}}
>
	{#if !editData && onSwitchType}
		<button type="button" class="switch-type-link" onclick={onSwitchType}>
			← {$_('finance.form.switchType')}
		</button>
	{/if}
	{#if showDraftBanner}<DraftBanner
			savedAt={_initDraft!.savedAt}
			hasUnsavedFile={_initDraft!.hasUnsavedFile ?? false}
			onDiscard={discardDraft}
		/>{/if}

	{#if editData}
		<input type="hidden" name="id" value={editData.id} />
	{/if}

	<div class="form-row">
		<label class="field">
			<span class="field-label">{$_('finance.form.category')}</span>
			<select name="category" bind:value={category} onchange={saveDraft} class="input">
				{#each categoryOptions as opt (opt.value)}
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
				oninput={saveDraft}
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
			<input type="date" name="date" bind:value={date} oninput={saveDraft} class="input" required />
		</label>

		<label class="field">
			<span class="field-label">{measurementFieldLabel}</span>
			<input
				type="number"
				name="odometer"
				bind:value={odometer}
				oninput={saveDraft}
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
			oninput={saveDraft}
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
						aria-label={$_('common.remove')}>×</button
					>
				</span>
				<select name="attachment_type" class="input attach-type" bind:value={attachType}>
					{#each docTypeEntries as [val, key] (val)}
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
			<button type="button" class="attach-action-btn" onclick={() => (showLinkNew = !showLinkNew)}>
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
					<button type="button" class="link-picker-close" onclick={() => (showLinkNew = false)}
						>×</button
					>
				</div>
				{#if allDocs.length === 0}
					<p class="link-picker-empty">{$_('vehicle.forms.attachments.noDocuments')}</p>
				{:else}
					<ul class="link-picker-list">
						{#each allDocs as doc (doc.id)}
							<li>
								<label class="link-picker-item link-picker-item--check">
									<input
										type="checkbox"
										checked={newLinkedDocIds.has(doc.id)}
										onchange={() => toggleLink(doc.id)}
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
				{#each [...newLinkedDocIds] as id (id)}
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
								onclick={() => toggleLink(id)}
								aria-label={$_('common.remove')}>×</button
							>
						</span>
					{/if}
				{/each}
			</div>
		{/if}
	</div>

	<div class="form-actions">
		<button type="submit" class="btn-primary" disabled={submitting}>
			{submitting
				? $_('finance.saving')
				: editData
					? $_('finance.form.editTitle')
					: $_('finance.save')}
		</button>
		<button type="button" class="btn-cancel" onclick={() => sheet.closeSheet()}>
			{$_('finance.cancel')}
		</button>
	</div>
</form>

<style>
	.tx-form {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}

	.switch-type-link {
		align-self: flex-start;
		background: none;
		border: none;
		padding: 0;
		font-size: var(--text-sm);
		color: var(--text-muted);
		cursor: pointer;
	}

	.switch-type-link:hover {
		color: var(--text);
		text-decoration: underline;
	}

	/* The sheet is 420px on desktop, so paired fields stack rather than share a row */
	.form-row {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
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
		width: 100%;
		min-height: 48px;
		box-sizing: border-box;
	}

	.input:hover {
		border-color: var(--border-strong);
	}

	.input:focus {
		outline: 2px solid var(--accent);
		outline-offset: 1px;
		border-color: var(--accent);
	}

	.mono {
		font-family: var(--font-mono);
		font-variant-numeric: tabular-nums;
	}

	.form-attachments {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	.attach-actions {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	.attach-action-btn {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.375rem 0.625rem;
		border: 1px solid var(--border);
		border-radius: 8px;
		background: none;
		cursor: pointer;
		font-size: var(--text-sm);
		color: var(--text-muted);
		width: 100%;
	}

	.attach-action-btn:hover {
		background: var(--bg-muted);
		color: var(--text);
	}

	.attach-file-input {
		display: none;
	}

	.attach-type {
		min-height: 36px;
		padding: 0.375rem 0.5rem;
	}

	.attach-chips {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}

	.doc-chip {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		background: var(--bg-muted);
		border: 1px solid var(--border);
		border-radius: 6px;
		padding: 0.25rem 0.5rem;
		font-size: var(--text-xs);
	}

	.doc-chip-name {
		font-size: var(--text-xs);
		color: var(--text);
		max-width: 140px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.doc-chip-type {
		font-size: var(--text-xs);
		color: var(--text-muted);
	}

	.doc-chip-remove {
		background: none;
		border: none;
		cursor: pointer;
		color: var(--text-subtle);
		padding: 0;
		line-height: 1;
		font-size: 1rem;
	}

	.doc-chip-remove:hover {
		color: var(--status-overdue);
	}

	.link-picker {
		border: 1px solid var(--border);
		border-radius: 10px;
		overflow: hidden;
	}

	.link-picker-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.625rem var(--space-3);
		border-bottom: 1px solid var(--border);
		background: var(--bg-subtle);
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
		color: var(--text-subtle);
		font-size: 1.125rem;
		line-height: 1;
		padding: 0;
	}

	.link-picker-empty {
		padding: var(--space-3);
		font-size: var(--text-sm);
		color: var(--text-muted);
		margin: 0;
	}

	.link-picker-list {
		list-style: none;
		margin: 0;
		padding: var(--space-1);
		max-height: 180px;
		overflow-y: auto;
	}

	.link-picker-item {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: 0.375rem var(--space-2);
		border-radius: 6px;
		cursor: pointer;
		font-size: var(--text-sm);
	}

	.link-picker-item:hover {
		background: var(--bg-muted);
	}

	.link-picker-item--check input {
		accent-color: var(--accent);
	}

	.link-picker-item-name {
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.form-actions {
		display: flex;
		gap: var(--space-3);
		padding-top: var(--space-2);
	}

	.form-actions > * {
		flex: 1;
	}

	.btn-primary {
		padding: 0.75rem 1.25rem;
		background: var(--accent);
		color: #fff;
		border: none;
		border-radius: 10px;
		font-size: var(--text-sm);
		font-weight: 500;
		cursor: pointer;
		min-height: 48px;
	}

	.btn-primary:hover {
		background: var(--accent-hover);
	}

	.btn-primary:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.btn-cancel {
		padding: 0.75rem 1.25rem;
		background: transparent;
		border: 1px solid var(--border);
		border-radius: 10px;
		font-size: var(--text-sm);
		font-weight: 500;
		cursor: pointer;
		color: var(--text-muted);
		min-height: 48px;
	}

	.btn-cancel:hover {
		background: var(--bg-muted);
		color: var(--text);
	}
</style>
