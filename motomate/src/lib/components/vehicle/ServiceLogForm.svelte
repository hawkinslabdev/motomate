<script lang="ts">
	import { untrack } from 'svelte';
	import { enhance } from '$app/forms';
	import { SvelteSet } from 'svelte/reactivity';
	import { sheet } from '$lib/stores/sheet.svelte.js';
	import { drafts } from '$lib/stores/drafts.svelte.js';
	import { _, waitLocale } from '$lib/i18n';
	import { getMeasurementUnitTranslationKey } from '$lib/utils/measurement.js';
	import type { ActiveTracker, TaskTemplate } from '$lib/db/schema.js';
	import DraftBanner from '$lib/components/ui/DraftBanner.svelte';

	type Tracker = ActiveTracker & { template: TaskTemplate };
	interface DocRecord {
		id: string;
		name: string;
		doc_type: string;
	}

	let {
		odometerUnit,
		currentOdometer,
		today,
		trackers,
		allDocs = [],
		vehicleId
	}: {
		odometerUnit: 'km' | 'mi' | 'h';
		currentOdometer: number;
		today: string;
		trackers: Tracker[];
		allDocs?: DocRecord[];
		vehicleId?: string;
	} = $props();

	$effect(() => {
		waitLocale();
	});

	const isHoursVehicle = $derived(odometerUnit === 'h');
	const unitLabel = $derived($_(getMeasurementUnitTranslationKey(odometerUnit)));
	const measurementFieldLabel = $derived(
		isHoursVehicle
			? $_('vehicle.forms.fields.usage', { values: { unit: unitLabel } })
			: $_('vehicle.forms.fields.odometer', { values: { unit: unitLabel } })
	);

	const _initDraft = untrack(() => (vehicleId ? drafts.get(vehicleId, 'service') : null));

	let performedAt = $state(untrack(() => (_initDraft?.fields.performed_at as string) ?? today));
	let odoAtService = $state(
		untrack(() => (_initDraft?.fields.odometer_at_service as string) ?? String(currentOdometer))
	);
	let notesValue = $state(untrack(() => (_initDraft?.fields.notes as string) ?? ''));
	let remarkValue = $state(untrack(() => (_initDraft?.fields.remark as string) ?? ''));
	let costValue = $state(untrack(() => (_initDraft?.fields.cost as string) ?? ''));
	let showDraftBanner = $state(!!_initDraft);

	let submitting = $state(false);
	let attachFile = $state<File | null>(null);
	let attachType = $state('service');
	let showLinkNew = $state(false);
	let newLinkedDocIds = new SvelteSet<string>();

	function saveDraft() {
		if (!vehicleId) return;
		drafts.save(
			vehicleId,
			'service',
			{
				performed_at: performedAt,
				odometer_at_service: odoAtService,
				notes: notesValue,
				remark: remarkValue,
				cost: costValue
			},
			attachFile !== null
		);
		sheet.hint = $_('draft.autosaved');
	}
	function discardDraft() {
		if (vehicleId) drafts.clear(vehicleId, 'service');
		showDraftBanner = false;
		performedAt = today;
		odoAtService = String(currentOdometer);
		notesValue = '';
		remarkValue = '';
		costValue = '';
		attachFile = null;
	}

	const docTypeEntries = Object.entries({
		service: 'documents.types.service',
		quotation: 'documents.types.quotation',
		papers: 'documents.types.papers',
		photo: 'documents.types.photo',
		notes: 'documents.types.notes',
		other: 'documents.types.other'
	});

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
</script>

<form
	method="POST"
	action="?/logService"
	enctype="multipart/form-data"
	class="form"
	use:enhance={({ formData }) => {
		if (attachFile) formData.set('attachment_file', attachFile);
		for (const id of newLinkedDocIds) formData.append('linked_doc_id', id);
		submitting = true;
		return async ({ result, update }) => {
			await update();
			submitting = false;
			if (result.type === 'success') {
				if (vehicleId) drafts.clear(vehicleId, 'service');
				sheet.closeSheet();
			}
		};
	}}
>
	{#if showDraftBanner}
		<DraftBanner
			savedAt={_initDraft!.savedAt}
			hasUnsavedFile={_initDraft!.hasUnsavedFile ?? false}
			onDiscard={discardDraft}
		/>
	{/if}
	<div class="form-row">
		<label class="field">
			<span class="field-label">{$_('vehicle.forms.fields.date')}</span>
			<input
				type="date"
				name="performed_at"
				bind:value={performedAt}
				oninput={saveDraft}
				class="input"
				required
			/>
		</label>
		<label class="field">
			<span class="field-label">{measurementFieldLabel}</span>
			<input
				type="number"
				name="odometer_at_service"
				bind:value={odoAtService}
				oninput={saveDraft}
				min="0"
				class="input mono"
				required
			/>
		</label>
	</div>

	{#if trackers.length > 0}
		<fieldset class="tracker-select">
			<legend class="field-label"
				>{$_('vehicle.forms.fields.resetCycle', {
					values: { optional: $_('vehicle.forms.fields.checkToReset') }
				})}</legend
			>
			<div class="tracker-checkboxes">
				{#each trackers as t (t.id)}
					<label class="tracker-checkbox">
						<input type="checkbox" name="reset_trackers" value={t.id} />
						<span class="tracker-check-label">
							<span class="tracker-check-name">{t.template.name}</span>
							{#if (t as any).reminder_only}
								<span class="tracker-check-status">{$_('maintenance.tracker.reminderBadge')}</span>
							{:else if t.status === 'due'}
								<span class="tracker-check-status tracker-check-status--due"
									>{$_('maintenance.tracker.status.due')}</span
								>
							{:else if t.status === 'overdue'}
								<span class="tracker-check-status tracker-check-status--overdue"
									>{$_('maintenance.tracker.status.overdue')}</span
								>
							{/if}
						</span>
					</label>
				{/each}
			</div>
		</fieldset>
	{/if}

	<label class="field">
		<span class="field-label">{$_('vehicle.forms.fields.description')}</span>
		<input
			type="text"
			name="notes"
			bind:value={notesValue}
			oninput={saveDraft}
			placeholder={$_('vehicle.forms.placeholders.description')}
			maxlength="200"
			class="input"
		/>
	</label>

	<label class="field">
		<span class="field-label"
			>{$_('vehicle.forms.fields.remark', { values: { optional: $_('common.optional') } })}</span
		>
		<input
			type="text"
			name="remark"
			bind:value={remarkValue}
			oninput={saveDraft}
			placeholder={$_('vehicle.forms.placeholders.additionalDetails')}
			maxlength="200"
			class="input"
		/>
	</label>

	<label class="field">
		<span class="field-label"
			>{$_('vehicle.forms.fields.cost', { values: { optional: $_('common.optional') } })}</span
		>
		<input
			type="number"
			name="cost"
			bind:value={costValue}
			oninput={saveDraft}
			min="0"
			step="0.01"
			placeholder={$_('vehicle.forms.placeholders.cost')}
			class="input mono"
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
			{submitting ? $_('common.saving') : $_('vehicle.forms.submit.service')}
		</button>
		<button type="button" class="btn-ghost" onclick={() => sheet.closeSheet()}>
			{$_('common.cancel')}
		</button>
	</div>
</form>

<style>
	.form {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
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

	.tracker-select {
		border: 1px solid var(--border);
		border-radius: 10px;
		padding: var(--space-3);
		margin: 0;
	}

	.tracker-checkboxes {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		margin-top: var(--space-2);
	}

	.tracker-checkbox {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		cursor: pointer;
	}

	.tracker-check-label {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		flex: 1;
	}

	.tracker-check-name {
		font-size: var(--text-sm);
		color: var(--text);
	}

	.tracker-check-status {
		font-size: var(--text-xs);
		color: var(--text-muted);
		background: var(--bg-muted);
		border: 1px solid var(--border);
		border-radius: 4px;
		padding: 0.1rem 0.4rem;
	}

	.tracker-check-status--due {
		color: var(--status-due);
		border-color: color-mix(in srgb, var(--status-due) 30%, transparent);
		background: color-mix(in srgb, var(--status-due) 8%, var(--bg));
	}

	.tracker-check-status--overdue {
		color: var(--status-overdue);
		border-color: color-mix(in srgb, var(--status-overdue) 30%, transparent);
		background: color-mix(in srgb, var(--status-overdue) 8%, var(--bg));
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

	.btn-ghost {
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

	.btn-ghost:hover {
		background: var(--bg-muted);
		color: var(--text);
	}
</style>
