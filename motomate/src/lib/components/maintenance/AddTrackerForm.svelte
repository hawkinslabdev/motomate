<script lang="ts">
	import { enhance } from '$app/forms';
	import { sheet } from '$lib/stores/sheet.svelte.js';
	import { _, waitLocale } from '$lib/i18n';
	import { getMeasurementUnitTranslationKey } from '$lib/utils/measurement.js';

	let {
		vehicleId: _vehicleId,
		odometerUnit
	}: {
		vehicleId: string;
		odometerUnit: 'km' | 'mi' | 'h';
	} = $props();

	$effect(() => {
		waitLocale();
	});

	const isHoursVehicle = $derived(odometerUnit === 'h');
	const unitLabel = $derived($_(getMeasurementUnitTranslationKey(odometerUnit)));
	const intervalFieldLabel = $derived(
		$_('maintenance.addTask.fields.intervalKm', { values: { unit: unitLabel } })
	);
	const intervalPlaceholder = $derived(
		isHoursVehicle
			? $_('maintenance.addTask.placeholders.hours')
			: $_('maintenance.addTask.placeholders.km')
	);

	let submitting = $state(false);
</script>

<form
	method="POST"
	action="?/addTask"
	class="add-task-form"
	use:enhance={() => {
		submitting = true;
		return async ({ result, update }) => {
			await update();
			submitting = false;
			if (result.type === 'success') {
				sheet.closeSheet();
			}
		};
	}}
>
	<div class="form-fields">
		<label class="field">
			<span class="field-label">{$_('maintenance.addTask.fields.name')}</span>
			<input
				name="name"
				type="text"
				placeholder={$_('maintenance.addTask.placeholders.name')}
				required
				class="input"
			/>
		</label>
		<label class="field">
			<span class="field-label">{intervalFieldLabel}</span>
			<input
				name="interval_km"
				type="number"
				min="1"
				placeholder={intervalPlaceholder}
				class="input mono"
			/>
		</label>
		<label class="field">
			<span class="field-label">{$_('maintenance.addTask.fields.intervalMonths')}</span>
			<input
				name="interval_months"
				type="number"
				min="1"
				placeholder={$_('maintenance.addTask.placeholders.months')}
				class="input mono"
			/>
		</label>
	</div>
	<div class="form-actions">
		<button type="submit" class="btn-primary" disabled={submitting}>
			{submitting ? $_('maintenance.saving') : $_('maintenance.addTask.submit')}
		</button>
		<button type="button" class="btn-ghost" onclick={() => sheet.closeSheet()}>
			{$_('common.cancel')}
		</button>
	</div>
</form>

<style>
	.add-task-form {
		display: flex;
		flex-direction: column;
		gap: var(--space-5);
	}

	.form-fields {
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

	.form-actions {
		display: flex;
		gap: var(--space-3);
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
