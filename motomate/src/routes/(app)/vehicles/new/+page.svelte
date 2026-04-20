<script lang="ts">
	import { enhance } from '$app/forms';
	import { _ } from '$lib/i18n';
	import { DEFAULT_ODOMETER_UNIT, DISTANCE_UNITS } from '$lib/utils/measurement.js';

	let { form } = $props<{
		form: { errors?: Record<string, string[]>; values?: Record<string, string> } | null;
	}>();

	const selectedOdometerUnit = $derived(
		form?.values?.odometer_unit ?? DEFAULT_ODOMETER_UNIT
	);
</script>

<svelte:head><title>{$_('vehicle.add.title')} &middot; MotoMate</title></svelte:head>

<div class="page">
	<div class="page-header">
		<a href="/vehicles" class="back-link">{$_('vehicle.add.back')}</a>
		<h1 class="page-title">{$_('vehicle.add.title')}</h1>
	</div>

	<form method="POST" use:enhance class="vehicle-form">
		<div class="form-section">
			<h2 class="section-title">{$_('vehicle.add.sections.type')}</h2>
			<div class="type-cards">
				{#each [['motorcycle', '🏍', $_('vehicle.add.types.motorcycle')], ['scooter', '🛵', $_('vehicle.add.types.scooter')], ['bike', '🚲', $_('vehicle.add.types.bike')], ['other', '🚗', $_('vehicle.add.types.other')]] as [val, icon, label]}
					<label class="type-card">
						<input type="radio" name="type" value={val} checked={val === 'motorcycle'} />
						<span aria-hidden="true">{icon}</span>
						<span>{label}</span>
					</label>
				{/each}
			</div>
		</div>

		<div class="form-section">
			<h2 class="section-title">{$_('vehicle.add.sections.details')}</h2>
			<div class="form-grid">
				<label class="field">
					<span class="field-label"
						>{$_('vehicle.add.fields.name')} <span class="req">{$_('common.required')}</span></span
					>
					<input
						name="name"
						type="text"
						required
						placeholder={$_('vehicle.add.placeholders.name')}
						value={form?.values?.name ?? ''}
						class="input"
					/>
					{#if form?.errors?.name}<span class="field-err">{form.errors.name[0]}</span>{/if}
				</label>
				<label class="field">
					<span class="field-label"
						>{$_('vehicle.add.fields.make')} <span class="req">{$_('common.required')}</span></span
					>
					<input
						name="make"
						type="text"
						required
						placeholder={$_('vehicle.add.placeholders.make')}
						value={form?.values?.make ?? ''}
						class="input"
					/>
				</label>
				<label class="field">
					<span class="field-label"
						>{$_('vehicle.add.fields.model')} <span class="req">{$_('common.required')}</span></span
					>
					<input
						name="model"
						type="text"
						required
						placeholder={$_('vehicle.add.placeholders.model')}
						value={form?.values?.model ?? ''}
						class="input"
					/>
				</label>
				<label class="field">
					<span class="field-label"
						>{$_('vehicle.add.fields.year')} <span class="req">{$_('common.required')}</span></span
					>
					<input
						name="year"
						type="number"
						required
						min="1900"
						max={new Date().getFullYear() + 1}
						placeholder="2022"
						value={form?.values?.year ?? ''}
						class="input mono"
					/>
				</label>
				<label class="field">
					<span class="field-label">{$_('vehicle.add.fields.vin')}</span>
					<input
						name="vin"
						type="text"
						maxlength="17"
						placeholder={$_('vehicle.add.placeholders.vin')}
						value={form?.values?.vin ?? ''}
						class="input mono"
					/>
				</label>
				<label class="field">
					<span class="field-label">{$_('vehicle.add.fields.licensePlate')}</span>
					<input
						name="license_plate"
						type="text"
						maxlength="20"
						placeholder={$_('vehicle.add.placeholders.licensePlate')}
						value={form?.values?.license_plate ?? ''}
						class="input"
					/>
				</label>
			</div>
		</div>

		<div class="form-section">
			<h2 class="section-title">{$_('vehicle.add.sections.odometer')}</h2>
			<div class="odo-row">
				<label class="field" style="flex:1">
					<span class="field-label"
						>{$_('vehicle.add.fields.currentReading')}
						<span class="req">{$_('common.required')}</span></span
					>
					<input
						name="current_odometer"
						type="number"
						min="0"
						required
						placeholder="0"
						value={form?.values?.current_odometer ?? '0'}
						class="input mono"
					/>
				</label>
				<label class="field">
					<span class="field-label">{$_('vehicle.add.fields.unit')}</span>
					<select name="odometer_unit" class="input">
						{#each DISTANCE_UNITS as unit}
							<option value={unit} selected={selectedOdometerUnit === unit}>
								{unit === 'km' ? $_('units.km') : $_('units.mi')}
							</option>
						{/each}
					</select>
				</label>
			</div>
		</div>

		<div class="form-actions">
			<a href="/vehicles" class="btn-ghost">{$_('vehicle.add.actions.cancel')}</a>
			<button type="submit" class="btn-primary">{$_('vehicle.add.actions.submit')}</button>
		</div>
	</form>
</div>

<style>
	.page {
		max-width: 640px;
		padding: var(--space-6) var(--space-6);
		margin: 0 auto;
	}
	.back-link {
		font-size: var(--text-sm);
		color: var(--text-muted);
		text-decoration: none;
		display: inline-block;
		margin-bottom: var(--space-3);
	}
	.back-link:hover {
		color: var(--text);
	}
	.page-title {
		font-size: var(--text-2xl);
		font-weight: 600;
		color: var(--text);
		letter-spacing: -0.02em;
		margin: 0 0 var(--space-7);
	}
	.form-section {
		margin-bottom: var(--space-6);
	}
	.section-title {
		font-size: var(--text-xs);
		font-weight: 600;
		color: var(--text-muted);
		text-transform: uppercase;
		letter-spacing: 0.07em;
		margin: 0 0 0.875rem;
	}

	.type-cards {
		display: flex;
		gap: 0.75rem;
	}
	.type-card {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.375rem;
		padding: 1rem;
		border: 1px solid var(--border);
		border-radius: 8px;
		cursor: pointer;
		font-size: var(--text-sm);
		font-weight: 500;
		color: var(--text-muted);
		transition: border-color 0.1s;
	}
	.type-card input {
		position: absolute;
		opacity: 0;
		pointer-events: none;
	}
	.type-card:has(input:checked) {
		border-color: var(--accent);
		color: var(--accent);
		background: var(--accent-subtle);
	}
	.type-card span:first-of-type {
		font-size: 1.5rem;
	}

	.form-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1rem;
	}
	.odo-row {
		display: flex;
		gap: 1rem;
		align-items: flex-start;
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		min-width: 0;
	}
	.field-label {
		font-size: var(--text-sm);
		font-weight: 500;
		color: var(--text-muted);
	}
	.req {
		color: var(--status-overdue);
	}
	.field-err {
		font-size: var(--text-xs);
		color: var(--status-overdue);
	}
	.input {
		padding: 0.75rem;
		border: 1px solid var(--border);
		border-radius: 10px;
		background: var(--bg);
		color: var(--text);
		font-size: var(--text-md);
		font-family: var(--font-sans);
		min-height: 48px;
		width: 100%;
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
	}
	.input:focus {
		outline: 2px solid var(--accent);
		outline-offset: 1px;
		border-color: transparent;
	}

	.form-actions {
		display: flex;
		justify-content: flex-end;
		gap: 0.75rem;
		padding-top: 1.5rem;
		border-top: 1px solid var(--border);
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
		text-decoration: none;
	}
	.btn-primary:hover {
		background: var(--accent-hover);
	}
	.btn-ghost {
		padding: 0.5rem 0.875rem;
		background: transparent;
		color: var(--text-muted);
		border: 1px solid var(--border);
		border-radius: 10px;
		font-size: var(--text-sm);
		cursor: pointer;
		text-decoration: none;
	}
	.btn-ghost:hover {
		background: var(--bg-muted);
		color: var(--text);
	}

	@media (max-width: 640px) {
		.page {
			padding: var(--space-4);
			padding-bottom: calc(56px + env(safe-area-inset-bottom) + var(--space-4));
		}
		.form-grid {
			grid-template-columns: 1fr;
		}
		.type-cards {
			flex-direction: column;
		}
		.odo-row {
			flex-direction: column;
		}
	}
</style>
