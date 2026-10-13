<script lang="ts">
	import { untrack } from 'svelte';
	import { enhance } from '$app/forms';
	import { sheet } from '$lib/stores/sheet.svelte.js';
	import { _, waitLocale } from '$lib/i18n';
	import { drafts } from '$lib/stores/drafts.svelte.js';
	import DraftBanner from '$lib/components/ui/DraftBanner.svelte';

	let {
		today,
		editData,
		vehicleId
	}: {
		today: string;
		editData?: { id: string; recorded_at: string; remark: string };
		vehicleId?: string;
	} = $props();

	const _initDraft = untrack(() => (!editData && vehicleId ? drafts.get(vehicleId, 'note') : null));

	let recordedAt = $state(
		untrack(() => (_initDraft?.fields.recorded_at as string) ?? editData?.recorded_at ?? today)
	);
	let remarkValue = $state(
		untrack(() => (_initDraft?.fields.remark as string) ?? editData?.remark ?? '')
	);
	let showDraftBanner = $state(untrack(() => !!_initDraft && !editData));

	$effect(() => {
		waitLocale();
	});

	let submitting = $state(false);

	function saveDraft() {
		if (!vehicleId || editData) return;
		drafts.save(vehicleId, 'note', { recorded_at: recordedAt, remark: remarkValue });
		sheet.hint = $_('draft.autosaved');
	}

	function discardDraft() {
		if (vehicleId) drafts.clear(vehicleId, 'note');
		showDraftBanner = false;
		recordedAt = today;
		remarkValue = '';
	}
</script>

<form
	method="POST"
	action={editData ? '?/editOdometerLog' : '?/logNote'}
	class="form"
	use:enhance={() => {
		submitting = true;
		return async ({ result, update }) => {
			await update();
			submitting = false;
			if (result.type === 'success') {
				if (vehicleId && !editData) drafts.clear(vehicleId, 'note');
				sheet.closeSheet();
			}
		};
	}}
>
	{#if editData}
		<input type="hidden" name="id" value={editData.id} />
	{/if}

	{#if showDraftBanner}
		<DraftBanner savedAt={_initDraft!.savedAt} onDiscard={discardDraft} />
	{/if}

	<label class="field">
		<span class="field-label">{$_('vehicle.forms.fields.date')}</span>
		<input
			type="date"
			name="recorded_at"
			bind:value={recordedAt}
			oninput={saveDraft}
			class="input"
			required
		/>
	</label>

	<label class="field">
		<span class="field-label">{$_('vehicle.forms.fields.notes')}</span>
		<input
			type="text"
			name="remark"
			bind:value={remarkValue}
			oninput={saveDraft}
			placeholder={$_('vehicle.forms.placeholders.note')}
			maxlength="400"
			class="input"
		/>
	</label>

	<div class="form-actions">
		<button type="submit" class="btn-primary" disabled={submitting}>
			{submitting ? $_('common.saving') : $_('common.save')}
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
		border: 1px solid var(--border-input);
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
		color: var(--accent-fg);
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
