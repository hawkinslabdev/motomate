<script lang="ts">
	import { enhance } from '$app/forms';
	import { _ } from '$lib/i18n';
	import {
		DEFAULT_ODOMETER_UNIT,
		DISTANCE_UNITS,
		type DistanceUnit
	} from '$lib/utils/measurement.js';

	let { data, form } = $props<{
		data: Record<string, never>;
		form: { error?: string } | null;
	}>();

	// Wizard step (1 = Welcome, 2 = Type, 3 = Details, 4 = Odometer, 5 = Presets, 6 = Last service, 7 = Summary)
	type Step = 1 | 2 | 3 | 4 | 5 | 6 | 7;
	let step = $state<Step>(1);

	// Vehicle form state
	let vehicleType = $state<'motorcycle' | 'scooter' | 'bike' | 'other'>('motorcycle');
	let name = $state('');
	let make = $state('');
	let model = $state('');
	let year = $state(new Date().getFullYear());
	let vin = $state('');
	let licensePlate = $state('');
	let odometer = $state(0);
	let odometerUnit = $state<DistanceUnit>(DEFAULT_ODOMETER_UNIT);
	let selectedCategories = $state(['oil', 'tire', 'chain_lube', 'chain_tension', 'brake']);
	let lastServiceDate = $state('');
	let lastServiceOdo = $state('');

	const PRESET_ICONS: Record<string, string> = {
		oil: '🛢',
		tire: '⭕',
		chain_lube: '⛓️',
		chain_tension: '🔧',
		brake: '🔴',
		belt: '🔄',
		air_filter: '💨',
		cable_check: '🔧',
		battery: '🔋'
	};

	const PRESETS_BY_TYPE: Record<string, string[]> = {
		motorcycle: ['oil', 'tire', 'chain_lube', 'chain_tension', 'brake'],
		scooter: ['oil', 'tire', 'belt', 'brake', 'air_filter'],
		bike: ['tire', 'chain_lube', 'brake', 'cable_check'],
		other: ['oil', 'tire', 'brake', 'air_filter', 'battery']
	};

	const presetKeys = $derived(PRESETS_BY_TYPE[vehicleType] ?? PRESETS_BY_TYPE.motorcycle);
	const presets = $derived(presetKeys.map((id) => ({ id, icon: PRESET_ICONS[id] ?? '🔧' })));

	// Reset selection when vehicle type changes
	$effect(() => {
		selectedCategories = [...presetKeys];
	});

	const typeIcons: Record<string, string> = {
		motorcycle: '🏍',
		scooter: '🛵',
		bike: '🚲',
		other: '🚗'
	};

	function toggleCategory(id: string) {
		if (selectedCategories.includes(id)) {
			selectedCategories = selectedCategories.filter((c) => c !== id);
		} else {
			selectedCategories = [...selectedCategories, id];
		}
	}

	function canAdvance(): boolean {
		if (step === 3)
			return (
				name.trim().length > 0 && make.trim().length > 0 && model.trim().length > 0 && year >= 1900
			);
		if (step === 4) return odometer >= 0;
		return true;
	}

	const TOTAL_STEPS = 6;
</script>

<svelte:head><title>{$_('common.loading')} &middot; MotoMate</title></svelte:head>

<div class="onboarding">
	{#if step >= 1 && step <= 7}
		<div
			class="step-dots"
			aria-label={$_('onboarding.nav.stepOf', { values: { step: step, total: TOTAL_STEPS } })}
			role="status"
		>
			{#each Array.from({ length: TOTAL_STEPS }) as _, i}
				<div
					class="step-dot"
					class:step-dot--done={step > i + 1}
					class:step-dot--current={step === i + 1}
				></div>
			{/each}
		</div>
	{/if}

	<div class="onboarding-card">
		<!-- Step 1: Welcome -->
		{#if step === 1}
			<div class="step-content center">
				<div class="step-icon step-icon--welcome" aria-hidden="true">🏍</div>
				<h1 class="step-title">{$_('onboarding.welcome.title')}</h1>
				<p class="step-desc">{$_('onboarding.welcome.description')}</p>
				<button class="btn-primary" onclick={() => (step = 2)}
					>{$_('onboarding.welcome.submit')}</button
				>
			</div>

			<!-- Step 2: Vehicle type -->
		{:else if step === 2}
			<h2 class="step-title">{$_('onboarding.type.title')}</h2>
			<div class="type-grid">
				{#each [['motorcycle', '🏍', $_('onboarding.type.motorcycle')], ['scooter', '🛵', $_('onboarding.type.scooter')], ['bike', '🚲', $_('onboarding.type.bike')], ['other', '🚗', $_('onboarding.type.other')]] as [val, icon, label]}
					<button
						class="type-card"
						class:type-card--active={vehicleType === val}
						onclick={() => {
							vehicleType = val as typeof vehicleType;
							step = 3;
						}}
					>
						<span class="type-icon" aria-hidden="true">{icon}</span>
						<span>{label}</span>
					</button>
				{/each}
			</div>
		{:else if step === 3}
			<h2 class="step-title">{$_('onboarding.details.title', { values: { vehicleType } })}</h2>
			<div class="form-fields">
				<label class="field">
					<span class="field-label"
						>{$_('onboarding.details.name')} <span class="req">{$_('common.required')}</span></span
					>
					<input
						bind:value={name}
						type="text"
						placeholder={$_('onboarding.details.placeholders.name')}
						class="input"
						required
					/>
				</label>
				<div class="field-row">
					<label class="field">
						<span class="field-label"
							>{$_('onboarding.details.make')}
							<span class="req">{$_('common.required')}</span></span
						>
						<input
							bind:value={make}
							type="text"
							placeholder={$_('onboarding.details.placeholders.make')}
							class="input"
							required
						/>
					</label>
					<label class="field">
						<span class="field-label"
							>{$_('onboarding.details.model')}
							<span class="req">{$_('common.required')}</span></span
						>
						<input
							bind:value={model}
							type="text"
							placeholder={$_('onboarding.details.placeholders.model')}
							class="input"
							required
						/>
					</label>
				</div>
				<label class="field">
					<span class="field-label"
						>{$_('onboarding.details.year')} <span class="req">{$_('common.required')}</span></span
					>
					<input
						bind:value={year}
						type="number"
						min="1900"
						max={new Date().getFullYear() + 1}
						class="input mono"
					/>
				</label>
				<div class="field-row">
					<label class="field">
						<span class="field-label">{$_('onboarding.details.vin')}</span>
						<input
							bind:value={vin}
							type="text"
							maxlength="17"
							placeholder={$_('onboarding.details.placeholders.vin')}
							class="input mono"
						/>
					</label>
					<label class="field">
						<span class="field-label">{$_('onboarding.details.licensePlate')}</span>
						<input
							bind:value={licensePlate}
							type="text"
							maxlength="20"
							placeholder={$_('onboarding.details.placeholders.licensePlate')}
							class="input"
						/>
					</label>
				</div>
			</div>

			<!-- ── Step 4: Odometer ── -->
		{:else if step === 4}
			<h2 class="step-title">{$_('onboarding.odometer.title')}</h2>
			<p class="step-desc">{$_('onboarding.odometer.description')}</p>
			<div class="odo-input-row">
				<input
					bind:value={odometer}
					type="number"
					min="0"
					class="input input--large mono"
					placeholder={$_('onboarding.odometer.placeholder')}
				/>
				<div class="unit-toggle">
					{#each DISTANCE_UNITS as unit}
						<button
							class="unit-btn"
							class:unit-btn--active={odometerUnit === unit}
							onclick={() => (odometerUnit = unit)}
						>
							{unit === 'km' ? $_('units.km') : $_('units.mi')}
						</button>
					{/each}
				</div>
			</div>

			<!-- ── Step 5: Maintenance presets ── -->
		{:else if step === 5}
			<h2 class="step-title">{$_('onboarding.presets.title')}</h2>
			<p class="step-desc">{$_('onboarding.presets.description')}</p>
			<div class="preset-list">
				{#each presets as preset}
					<label
						class="preset-item"
						class:preset-item--checked={selectedCategories.includes(preset.id)}
					>
						<input
							type="checkbox"
							checked={selectedCategories.includes(preset.id)}
							onchange={() => toggleCategory(preset.id)}
							class="sr-only"
						/>
						<span class="preset-check" aria-hidden="true"
							>{selectedCategories.includes(preset.id) ? '✓' : '○'}</span
						>
						<span class="preset-icon" aria-hidden="true">{preset.icon}</span>
						<div class="preset-text">
							<span class="preset-label">{$_('onboarding.presets.tasks.' + preset.id)}</span>
							<span class="preset-interval">{$_('onboarding.presets.intervals.' + preset.id)}</span>
						</div>
					</label>
				{/each}
			</div>

			<!-- ── Step 6: Last oil change (optional) ── -->
		{:else if step === 6}
			<h2 class="step-title">{$_('onboarding.lastService.title')}</h2>
			<p class="step-desc">{$_('onboarding.lastService.description')}</p>
			<div class="form-fields">
				<label class="field">
					<span class="field-label">{$_('onboarding.lastService.date')}</span>
					<input
						bind:value={lastServiceDate}
						type="date"
						class="input"
						max={new Date().toISOString().slice(0, 10)}
					/>
				</label>
				<label class="field">
					<span class="field-label">Odometer at service</span>
					<input
						bind:value={lastServiceOdo}
						type="number"
						min="0"
						class="input mono"
						placeholder={String(odometer)}
					/>
				</label>
			</div>
			<button
				class="btn-skip"
				onclick={() => {
					lastServiceDate = '';
					lastServiceOdo = '';
					step = 7;
				}}>{$_('onboarding.lastService.skip')}</button
			>

			<!-- ── Step 7: Confirm & submit ── -->
		{:else if step === 7}
			<div class="step-content center">
				<div class="done-icon" aria-hidden="true">✓</div>
				<h1 class="step-title">{$_('onboarding.summary.title')}</h1>

				<div class="summary-card">
					<div class="summary-row">
						<span class="summary-icon" aria-hidden="true">{typeIcons[vehicleType]}</span>
						<div>
							<div class="summary-name">{name}</div>
							<div class="summary-meta">{make} {model} · {year}</div>
						</div>
					</div>
					<div class="summary-odo">
						<span class="summary-odo-val">{odometer.toLocaleString()}</span>
						<span class="summary-odo-unit">{odometerUnit}</span>
					</div>
					<div class="summary-presets">
						{#each presets.filter((p) => selectedCategories.includes(p.id)) as preset}
							<span class="preset-tag"
								>{preset.icon} {$_('onboarding.presets.tasks.' + preset.id)}</span
							>
						{/each}
					</div>
				</div>

				<form method="POST" action="?/complete" style="display:contents">
					<input type="hidden" name="vehicle_type" value={vehicleType} />
					<input type="hidden" name="name" value={name} />
					<input type="hidden" name="make" value={make} />
					<input type="hidden" name="model" value={model} />
					<input type="hidden" name="year" value={year} />
					<input type="hidden" name="vin" value={vin} />
					<input type="hidden" name="license_plate" value={licensePlate} />
					<input type="hidden" name="odometer" value={odometer} />
					<input type="hidden" name="odometer_unit" value={odometerUnit} />
					<input type="hidden" name="categories" value={selectedCategories.join(',')} />
					{#if lastServiceDate}
						<input type="hidden" name="last_service_date" value={lastServiceDate} />
						<input type="hidden" name="last_service_odometer" value={lastServiceOdo || odometer} />
					{/if}
					<button type="submit" class="btn-primary btn-primary--large"
						>{$_('onboarding.summary.submit')}</button
					>
				</form>
			</div>
		{/if}

		<!-- Navigation (wizard steps only) -->
		{#if step > 1 && step < 7}
			<div class="step-nav">
				<button class="btn-back" onclick={() => (step = (step - 1) as Step)}
					>{$_('onboarding.nav.back')}</button
				>
				<span class="step-counter"
					>{$_('onboarding.nav.stepOf', { values: { step: step - 1, total: TOTAL_STEPS } })}</span
				>
				<button
					class="btn-primary"
					disabled={!canAdvance()}
					onclick={() => (step = (step + 1) as Step)}
				>
					{$_('onboarding.nav.continueBtn')}
				</button>
			</div>
		{/if}
	</div>
</div>

<style>
	.onboarding {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: flex-start;
		background: var(--bg-subtle);
		padding: var(--space-6) var(--space-4);
		min-height: 100%;
	}

	/* Step dots — replaces progress bar */
	.step-dots {
		display: flex;
		gap: 0.5rem;
		margin-bottom: 1.5rem;
	}
	.step-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--border-strong);
		transition:
			background 0.2s,
			box-shadow 0.2s;
	}
	.step-dot--done {
		background: var(--accent);
	}
	.step-dot--current {
		background: var(--accent);
		box-shadow: 0 0 0 3px var(--accent-subtle);
	}

	.onboarding-card {
		width: min(520px, calc(100vw - 2rem));
		margin: 2rem auto;
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: 12px;
		padding: 2rem;
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}

	/* Shared field styles */
	.field {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
	}
	.field-label {
		font-size: 0.875rem;
		font-weight: 500;
		color: var(--text-muted);
	}
	.req {
		color: var(--status-overdue);
	}
	.input {
		padding: 0.5rem 0.75rem;
		border: 1px solid var(--border-strong);
		border-radius: 10px;
		background: var(--bg-subtle);
		color: var(--text);
		font-size: 0.9375rem;
		font-family: var(--font-sans);
	}
	.mono {
		font-family: var(--font-mono);
	}
	.input:focus {
		outline: 2px solid var(--accent);
		outline-offset: 1px;
		border-color: transparent;
	}

	/* Steps */
	.step-content.center {
		align-items: center;
		text-align: center;
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}
	.step-icon {
		font-size: 3rem;
		line-height: 1;
	}
	.step-icon--welcome {
		font-size: 4rem;
	}
	.done-icon {
		font-size: 1.5rem;
		background: color-mix(in srgb, var(--status-ok) 15%, transparent);
		color: var(--status-ok);
		width: 4rem;
		height: 4rem;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.step-title {
		font-size: var(--text-xl);
		font-weight: 600;
		color: var(--text);
		margin: 0;
	}
	.step-desc {
		font-size: var(--text-sm);
		color: var(--text-muted);
		margin: 0;
		line-height: var(--leading-base);
	}

	/* Type selector */
	.type-grid {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 0.75rem;
	}
	.type-card {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.5rem;
		padding: 1.25rem 0.5rem;
		border: 1px solid var(--border);
		border-radius: 8px;
		cursor: pointer;
		background: var(--bg-subtle);
		font-size: 0.875rem;
		font-weight: 500;
		color: var(--text-muted);
		transition: all 0.1s;
	}
	.type-card:hover {
		border-color: var(--border-strong);
		color: var(--text);
	}
	.type-card--active {
		border-color: var(--accent);
		color: var(--accent);
		background: var(--accent-subtle);
	}
	.type-icon {
		font-size: 2rem;
	}

	/* Form fields */
	.form-fields {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}
	.field-row {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.75rem;
	}

	/* Odometer */
	.odo-input-row {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}
	.input--large {
		font-size: 1.5rem;
		padding: 0.625rem 1rem;
		flex: 1;
	}
	.unit-toggle {
		display: flex;
		border: 1px solid var(--border);
		border-radius: 10px;
		overflow: hidden;
		flex-shrink: 0;
	}
	.unit-btn {
		padding: 0.5rem 0.875rem;
		background: var(--bg-subtle);
		border: none;
		cursor: pointer;
		font-size: 0.875rem;
		font-weight: 500;
		color: var(--text-muted);
	}
	.unit-btn--active {
		background: var(--accent);
		color: #fff;
	}

	/* Presets */
	.preset-list {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.preset-item {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.75rem 1rem;
		border: 1px solid var(--border);
		border-radius: 8px;
		cursor: pointer;
		transition: border-color 0.1s;
	}
	.preset-item--checked {
		border-color: var(--accent);
		background: var(--accent-subtle);
	}
	.preset-check {
		font-size: 0.875rem;
		color: var(--accent);
		width: 1rem;
		text-align: center;
		flex-shrink: 0;
	}
	.preset-icon {
		font-size: 1.125rem;
		flex-shrink: 0;
	}
	.preset-text {
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
	}
	.preset-label {
		font-size: 0.875rem;
		font-weight: 500;
		color: var(--text);
	}
	.preset-interval {
		font-size: 0.75rem;
		color: var(--text-subtle);
		font-family: var(--font-mono);
	}
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border-width: 0;
	}

	/* Summary */
	.summary-card {
		background: var(--bg-subtle);
		border: 1px solid var(--border);
		border-radius: 8px;
		padding: 1.25rem;
		display: flex;
		flex-direction: column;
		gap: 0.875rem;
		width: 100%;
	}
	.summary-row {
		display: flex;
		align-items: center;
		gap: 0.875rem;
	}
	.summary-icon {
		font-size: 2rem;
	}
	.summary-name {
		font-size: 1rem;
		font-weight: 600;
		color: var(--text);
	}
	.summary-meta {
		font-size: 0.8125rem;
		color: var(--text-muted);
	}
	.summary-odo {
		display: flex;
		align-items: baseline;
		gap: 0.25rem;
	}
	.summary-odo-val {
		font-family: var(--font-mono);
		font-size: 1.25rem;
		font-weight: 600;
		color: var(--text);
	}
	.summary-odo-unit {
		font-size: 0.75rem;
		color: var(--text-subtle);
	}
	.summary-presets {
		display: flex;
		flex-wrap: wrap;
		gap: 0.375rem;
	}
	.preset-tag {
		font-size: 0.75rem;
		padding: 0.25rem 0.5rem;
		background: var(--bg-muted);
		border: 1px solid var(--border);
		border-radius: 4px;
		color: var(--text-muted);
	}

	/* Navigation */
	.step-nav {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding-top: 0.5rem;
		border-top: 1px solid var(--border);
	}
	.step-counter {
		font-size: 0.8125rem;
		color: var(--text-subtle);
	}
	.btn-back {
		background: none;
		border: none;
		cursor: pointer;
		font-size: 0.875rem;
		color: var(--text-muted);
		padding: 0.5rem;
	}
	.btn-back:hover {
		color: var(--text);
	}
	.btn-skip {
		background: none;
		border: none;
		cursor: pointer;
		font-size: 0.875rem;
		color: var(--text-subtle);
		text-decoration: underline;
		padding: 0;
	}

	/* Buttons */
	.btn-primary {
		padding: 0.5rem 1.25rem;
		background: var(--accent);
		color: #fff;
		border: none;
		border-radius: 10px;
		font-size: 0.875rem;
		font-weight: 500;
		cursor: pointer;
	}
	.btn-primary:hover:not(:disabled) {
		background: var(--accent-hover);
	}
	.btn-primary:disabled {
		opacity: 0.45;
		cursor: not-allowed;
	}
	.btn-primary--large {
		padding: 0.75rem 2rem;
		font-size: 1rem;
		margin-top: 0.5rem;
	}

	@media (max-width: 480px) {
		.type-grid {
			grid-template-columns: repeat(2, 1fr);
		}
		.field-row {
			grid-template-columns: 1fr;
		}
	}
</style>
