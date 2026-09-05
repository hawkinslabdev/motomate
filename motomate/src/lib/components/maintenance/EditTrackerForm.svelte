<script lang="ts">
	import { enhance } from '$app/forms';
	import { untrack } from 'svelte';
	import { sheet } from '$lib/stores/sheet.svelte.js';
	import { _, waitLocale } from '$lib/i18n';
	import { getMeasurementUnitTranslationKey } from '$lib/utils/measurement.js';
	import type { ActiveTracker, TaskTemplate } from '$lib/db/schema.js';

	type Tracker = ActiveTracker & { template: TaskTemplate };

	let {
		tracker,
		vehicleId: _vehicleId,
		odometerUnit
	}: {
		tracker: Tracker;
		vehicleId: string;
		odometerUnit: 'km' | 'mi' | 'h';
	} = $props();

	$effect(() => {
		waitLocale();
	});

	const isHoursVehicle = $derived(odometerUnit === 'h');
	const unitLabel = $derived($_(getMeasurementUnitTranslationKey(odometerUnit)));
	const intervalFieldLabel = $derived(
		$_('maintenance.editTracker.fields.everyKm', { values: { unit: unitLabel } })
	);
	const measurementFieldLabel = $derived(
		isHoursVehicle
			? $_('maintenance.editTracker.fields.usage', { values: { unit: unitLabel } })
			: $_('maintenance.editTracker.fields.odometer', { values: { unit: unitLabel } })
	);
	const intervalPlaceholder = $derived(
		isHoursVehicle
			? $_('maintenance.addTask.placeholders.hours')
			: $_('maintenance.addTask.placeholders.km')
	);

	let reminderOnly = $state(untrack(() => tracker.reminder_only ?? false));
	let submitting = $state(false);
</script>

<form
	method="POST"
	action="?/updateTracker"
	class="edit-form"
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
	<input type="hidden" name="id" value={tracker.id} />

	<div class="edit-section">
		<span class="edit-section-label">{$_('maintenance.editTracker.sections.identity')}</span>
		<div class="edit-row">
			<label class="field">
				<span class="field-label">{$_('maintenance.editTracker.fields.name')}</span>
				<input type="text" name="name" required value={tracker.template.name} class="input" />
			</label>
			<label class="field">
				<span class="field-label">{$_('maintenance.editTracker.fields.description')}</span>
				<input
					type="text"
					name="description"
					value={tracker.template.description ?? ''}
					class="input"
				/>
			</label>
		</div>
	</div>

	<div class="edit-section">
		<span class="edit-section-label">{$_('maintenance.editTracker.sections.interval')}</span>
		<div class="edit-row">
			<label class="field">
				<span class="field-label">{intervalFieldLabel}</span>
				<input
					type="number"
					name="interval_km"
					min="1"
					value={tracker.template.interval_measurement ?? tracker.template.interval_km ?? ''}
					placeholder={intervalPlaceholder}
					class="input mono"
				/>
			</label>
			<label class="field">
				<span class="field-label">{$_('maintenance.editTracker.fields.everyMonths')}</span>
				<input
					type="number"
					name="interval_months"
					min="1"
					value={tracker.template.interval_months ?? ''}
					placeholder="e.g. 12"
					class="input mono"
				/>
			</label>
		</div>
	</div>

	<div class="edit-section">
		<span class="edit-section-label">{$_('maintenance.editTracker.sections.lastServiced')}</span>
		<div class="edit-row">
			<label class="field">
				<span class="field-label">{$_('maintenance.editTracker.fields.date')}</span>
				<input type="date" name="last_done_at" value={tracker.last_done_at ?? ''} class="input" />
			</label>
			<label class="field">
				<span class="field-label">{measurementFieldLabel}</span>
				<input
					type="number"
					name="last_done_odometer"
					min="0"
					placeholder="e.g. 0"
					value={tracker.last_done_measurement ?? tracker.last_done_odometer ?? ''}
					class="input mono"
				/>
			</label>
		</div>
	</div>

	<div class="edit-section">
		<span class="edit-section-label">
			{$_('maintenance.editTracker.sections.nextDue')}
			<span class="field-hint">{$_('maintenance.editTracker.fields.autoCompute')}</span>
		</span>
		<div class="edit-row">
			<label class="field">
				<span class="field-label">{measurementFieldLabel}</span>
				<input
					type="number"
					name="next_due_odometer"
					min="0"
					value={tracker.next_due_measurement ?? tracker.next_due_odometer ?? ''}
					placeholder="auto"
					class="input mono"
				/>
			</label>
			<label class="field">
				<span class="field-label">{$_('maintenance.editTracker.fields.date')}</span>
				<input type="date" name="next_due_at" value={tracker.next_due_at ?? ''} class="input" />
			</label>
		</div>
	</div>

	<div class="edit-section">
		<div class="field-toggle">
			<span class="field-label">{$_('maintenance.editTracker.fields.reminderOnly')}</span>
			<input type="hidden" name="reminder_only" value={reminderOnly ? 'true' : 'false'} />
			<button
				type="button"
				class="toggle-btn"
				class:toggle-btn--on={reminderOnly}
				onclick={() => (reminderOnly = !reminderOnly)}
				aria-label={reminderOnly ? 'Disable reminder mode' : 'Enable reminder mode'}
			>
				<span class="toggle-thumb"></span>
			</button>
		</div>
		<p class="toggle-hint">{$_('maintenance.editTracker.fields.reminderOnlyHint')}</p>
	</div>

	<div class="form-actions">
		<button type="submit" class="btn-primary" disabled={submitting}>
			{submitting ? $_('maintenance.saving') : $_('maintenance.editTracker.submit')}
		</button>
		<button type="button" class="btn-ghost" onclick={() => sheet.closeSheet()}>
			{$_('maintenance.addTask.cancel')}
		</button>
	</div>
</form>

<style>
	.edit-form {
		display: flex;
		flex-direction: column;
		gap: var(--space-5);
	}

	.edit-section {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}

	.edit-section-label {
		font-size: var(--text-sm);
		font-weight: 600;
		color: var(--text);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}

	.edit-row {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: var(--space-3);
	}

	@media (max-width: 480px) {
		.edit-row {
			grid-template-columns: 1fr;
		}
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

	.field-hint {
		font-size: var(--text-xs);
		font-weight: 400;
		color: var(--text-subtle);
		text-transform: none;
		letter-spacing: 0;
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

	.field-toggle {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
	}

	.toggle-btn {
		position: relative;
		width: 40px;
		height: 22px;
		border-radius: 11px;
		background: var(--border-strong);
		border: none;
		cursor: pointer;
		transition: background 0.2s;
		flex-shrink: 0;
	}

	.toggle-btn--on {
		background: var(--accent);
	}

	.toggle-thumb {
		position: absolute;
		top: 3px;
		left: 3px;
		width: 16px;
		height: 16px;
		border-radius: 50%;
		background: #fff;
		transition: transform 0.2s;
	}

	.toggle-btn--on .toggle-thumb {
		transform: translateX(18px);
	}

	.toggle-hint {
		font-size: var(--text-xs);
		color: var(--text-muted);
		margin: 0;
		line-height: var(--leading-base);
	}

	.form-actions {
		display: flex;
		gap: var(--space-3);
		padding: var(--space-3) 0;
		position: sticky;
		bottom: calc(-1 * var(--space-5));
		background: var(--bg);
		margin: 0 calc(-1 * var(--space-5)) calc(-1 * var(--space-5));
		padding-inline: var(--space-5);
		border-top: 1px solid var(--border);
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
