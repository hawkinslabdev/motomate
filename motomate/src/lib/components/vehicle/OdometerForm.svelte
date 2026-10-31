<script lang="ts">
	import { enhance } from '$app/forms';
	import { untrack } from 'svelte';
	import { sheet } from '#lib/stores/sheet.svelte.js';
	import { _, waitLocale } from '#lib/i18n/index.js';
	import { getMeasurementUnitTranslationKey } from '#lib/utils/measurement.js';
	import { drafts } from '#lib/stores/drafts.svelte.js';
	import DraftBanner from '#lib/components/ui/DraftBanner.svelte';

	let {
		odometerUnit,
		currentOdometer,
		today,
		editData,
		vehicleId
	}: {
		odometerUnit: 'km' | 'mi' | 'h';
		currentOdometer: number;
		today: string;
		editData?: { id: string; odometer: number; recorded_at: string; remark?: string };
		vehicleId: string;
	} = $props();

	$effect(() => {
		waitLocale();
	});

	const isHoursVehicle = $derived(odometerUnit === 'h');
	const unitLabel = $derived($_(getMeasurementUnitTranslationKey(odometerUnit)));
	const currentReadingLabel = $derived(
		$_('vehicle.forms.fields.currentReading', { values: { unit: unitLabel } })
	);
	const measurementFieldLabel = $derived(
		isHoursVehicle
			? $_('vehicle.forms.fields.usage', { values: { unit: unitLabel } })
			: $_('vehicle.forms.fields.odometer', { values: { unit: unitLabel } })
	);

	const _initDraft = untrack(() =>
		!editData && vehicleId ? drafts.get(vehicleId, 'odometer') : null
	);

	let odoValue = $state(
		untrack(
			() =>
				(_initDraft?.fields.odometer as string) ??
				(editData ? String(editData.odometer) : String(currentOdometer))
		)
	);
	let recordedAt = $state(
		untrack(() => (_initDraft?.fields.recorded_at as string) ?? editData?.recorded_at ?? today)
	);
	let remarkValue = $state(
		untrack(() => (_initDraft?.fields.remark as string) ?? editData?.remark ?? '')
	);
	let showDraftBanner = $state(untrack(() => !!_initDraft && !editData));
	let odoDirty = $state(false);
	let submitting = $state(false);

	function saveDraft() {
		if (!vehicleId || editData) return;
		drafts.save(vehicleId, 'odometer', {
			odometer: odoValue,
			recorded_at: recordedAt,
			remark: remarkValue
		});
		sheet.hint = $_('draft.autosaved');
	}
	function discardDraft() {
		if (vehicleId) drafts.clear(vehicleId, 'odometer');
		showDraftBanner = false;
		odoValue = String(currentOdometer);
		recordedAt = today;
		remarkValue = '';
	}

	const odoWarning = $derived.by((): string | undefined => {
		if (!odoDirty || editData) return undefined;
		const num = Number(odoValue);
		if (!Number.isInteger(num) || num < 0) return undefined;
		if (num === currentOdometer)
			return $_('vehicle.forms.warnings.odoSame', { values: { num, unit: unitLabel } });
		if (num < currentOdometer)
			return $_('vehicle.forms.warnings.odoLower', {
				values: { current: currentOdometer, unit: unitLabel }
			});
		return undefined;
	});
</script>

<form
	method="POST"
	action={editData ? '?/editOdometerLog' : '?/updateOdometer'}
	class="form"
	use:enhance={() => {
		submitting = true;
		return async ({ result, update }) => {
			await update();
			submitting = false;
			if (result.type === 'success') {
				if (vehicleId && !editData) drafts.clear(vehicleId, 'odometer');
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

	{#if odoWarning}
		<div class="form-warning">{odoWarning}</div>
	{/if}

	<div class="form-row">
		<label class="field">
			<span class="field-label">{editData ? measurementFieldLabel : currentReadingLabel}</span>
			<input
				type="number"
				name="odometer"
				bind:value={odoValue}
				oninput={() => {
					odoDirty = true;
					saveDraft();
				}}
				min="0"
				class="input mono"
				required
			/>
		</label>
		<label class="field">
			<span class="field-label">{$_('vehicle.forms.fields.date')}</span>
			<input
				type="date"
				name="recorded_at"
				bind:value={recordedAt}
				oninput={saveDraft}
				class="input"
			/>
		</label>
	</div>

	<label class="field">
		<span class="field-label"
			>{$_('vehicle.forms.fields.remark', { values: { optional: $_('common.optional') } })}</span
		>
		<input
			type="text"
			name="remark"
			bind:value={remarkValue}
			oninput={saveDraft}
			placeholder={$_('vehicle.forms.placeholders.beforeTrip')}
			maxlength="200"
			class="input"
		/>
	</label>

	<div class="form-actions">
		<button type="submit" class="btn-primary" disabled={submitting}>
			{submitting
				? $_('common.saving')
				: editData
					? $_('common.save')
					: $_('vehicle.forms.submit.odometer')}
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

	.mono {
		font-family: var(--font-mono);
		font-variant-numeric: tabular-nums;
	}

	.form-warning {
		padding: var(--space-3);
		background: color-mix(in srgb, var(--status-due) 8%, var(--bg));
		border: 1px solid color-mix(in srgb, var(--status-due) 30%, transparent);
		border-radius: 8px;
		font-size: var(--text-sm);
		color: var(--status-due);
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
