<script lang="ts">
	import { enhance } from '$app/forms';
	import { untrack } from 'svelte';
	import type { PageData } from './$types';
	import ConfirmDialog from '$lib/components/ui/ConfirmDialog.svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import { toasts } from '$lib/stores/toasts.svelte.js';
	import { _, waitLocale } from '$lib/i18n';
	import { formatNumber } from '$lib/utils/format.js';
	import {
		convertDistanceValue,
		DISTANCE_UNITS,
		getDistanceUnitTranslationKey,
		getMeasurementUnitTranslationKey,
		type DistanceUnit
	} from '$lib/utils/measurement.js';

	let {
		data,
		form
	}: {
		data: PageData;
		form: { success?: boolean; error?: string; errors?: Record<string, string[]> } | null;
	} = $props();

	$effect(() => {
		waitLocale();
	});

	let showDeleteDialog = $state(false);
	let showArchiveDialog = $state(false);
	let showUnitConversionDialog = $state(false);
	let deleteLoading = $state(false);
	let archiveLoading = $state(false);
	let unitConverting = $state(false);
	let unitConversionForm = $state<HTMLFormElement | null>(null);

	let showReportModal = $state(false);
	let excludedTrackerIds = $state(
		untrack(() => new Set<string>(data.reportExcludedTrackerIds ?? []))
	);
	let includeFinance = $state(true);
	let includeAttachments = $state(untrack(() => data.includeAttachments ?? true));
	let includeNotes = $state(untrack(() => data.includeNotes ?? false));
	let reportDownloading = $state(false);

	async function handleReportDownload() {
		reportDownloading = true;
		const excluded = [...excludedTrackerIds];
		await fetch('/api/prefs', {
			method: 'PATCH',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				page_prefs: {
					maintenance_report_pdf: { [data.vehicle.id]: excluded },
					maintenance_report_opts: { [data.vehicle.id]: { includeAttachments, includeNotes } }
				}
			})
		});
		const params = new URLSearchParams();
		if (!includeFinance) params.set('noFinance', '1');
		if (!includeAttachments) params.set('noAttachments', '1');
		if (includeNotes) params.set('includeNotes', '1');
		const qs = params.toString();
		window.location.href = `/api/vehicles/${data.vehicle.id}/report${qs ? '?' + qs : ''}`;
		reportDownloading = false;
		showReportModal = false;
	}

	// Vehicle details state
	let name = $state(untrack(() => data.vehicle.name));
	let year = $state(untrack(() => data.vehicle.year));
	let make = $state(untrack(() => data.vehicle.make));
	let model = $state(untrack(() => data.vehicle.model));
	let vin = $state(untrack(() => data.vehicle.vin ?? ''));
	let licensePlate = $state(untrack(() => data.vehicle.license_plate ?? ''));

	// Odometer state
	let odometerInput = $state<number>(untrack(() => data.vehicle.current_odometer));
	const odometerChanged = $derived(odometerInput !== data.vehicle.current_odometer);
	const vehicleMeasurementUnitLabel = $derived(
		$_(getMeasurementUnitTranslationKey(data.vehicle.odometer_unit))
	);
	let selectedDistanceUnit = $state<DistanceUnit>(
		untrack(() => (data.vehicle.odometer_unit === 'mi' ? 'mi' : 'km'))
	);
	const canConvertDistanceUnit = $derived(data.vehicle.odometer_unit !== 'h');
	const distanceUnitChanged = $derived(selectedDistanceUnit !== data.vehicle.odometer_unit);
	const locale = $derived(data.user?.settings?.locale ?? 'en');
	const currency = $derived(data.user?.settings?.currency ?? 'EUR');
	const convertedCurrentReading = $derived(
		canConvertDistanceUnit
			? convertDistanceValue(
					data.vehicle.current_odometer,
					data.vehicle.odometer_unit as DistanceUnit,
					selectedDistanceUnit
				)
			: data.vehicle.current_odometer
	);
	const isHoursVehicle = $derived(data.vehicle.odometer_unit === 'h');
	const vehicleUnitTitle = $derived(
		isHoursVehicle
			? vehicleMeasurementUnitLabel.charAt(0).toUpperCase() + vehicleMeasurementUnitLabel.slice(1)
			: vehicleMeasurementUnitLabel
	);
	const updateReadingTitle = $derived(
		isHoursVehicle ? $_('vehicle.edit.odometer.usageTitle') : $_('vehicle.edit.odometer.title')
	);
	const currentReadingLabel = $derived(
		isHoursVehicle
			? $_('vehicle.edit.odometer.currentUsage', {
					values: { unit: vehicleMeasurementUnitLabel }
				})
			: $_('vehicle.edit.odometer.currentReading', {
					values: { unit: vehicleMeasurementUnitLabel }
				})
	);
	const readingUpdatedToast = $derived(
		isHoursVehicle ? $_('vehicle.edit.usageUpdated') : $_('vehicle.edit.odometerUpdated')
	);

	let purchasePrice = $state<string>(
		untrack(() =>
			data.vehicle.purchase_price_cents ? (data.vehicle.purchase_price_cents / 100).toFixed(2) : ''
		)
	);
	let soldPrice = $state<string>(
		untrack(() =>
			data.vehicle.sold_price_cents ? (data.vehicle.sold_price_cents / 100).toFixed(2) : ''
		)
	);

	const detailsChanged = $derived(
		name !== data.vehicle.name ||
			Number(year) !== data.vehicle.year ||
			make !== data.vehicle.make ||
			model !== data.vehicle.model ||
			vin !== (data.vehicle.vin ?? '') ||
			licensePlate !== (data.vehicle.license_plate ?? '') ||
			Math.round(parseFloat(String(purchasePrice || '0')) * 100) !==
				(data.vehicle.purchase_price_cents ?? 0) ||
			Math.round(parseFloat(String(soldPrice || '0')) * 100) !==
				(data.vehicle.sold_price_cents ?? 0)
	);

	let showUnarchiveDialog = $state(false);

	$effect(() => {
		const f = form;
		untrack(() => {
			if ((f as any)?.unarchived) {
				toasts.success($_('vehicle.edit.vehicleRestored'));
			}
		});
	});
</script>

<svelte:head
	><title>{$_('vehicle.edit.title')} {data.vehicle.name} - {$_('layout.brand')}</title></svelte:head
>

<div class="page-header">
	<div class="page-header-text">
		<h2 class="section-title">{$_('vehicle.edit.title')}</h2>
		<p class="section-sub">
			{$_('vehicle.edit.subtitle', { values: { name: data.vehicle.name } })}
		</p>
	</div>
</div>

<div class="edit-page">
	<!-- Odometer quick-update -->
	<section class="edit-section">
		<h2 class="section-label">{updateReadingTitle}</h2>
		<form
			method="POST"
			action="?/odometer"
			use:enhance={() => {
				return async ({ result, update }) => {
					await update({ reset: false });
					if (result.type === 'success') {
						toasts.success(readingUpdatedToast);
					} else if (result.type === 'failure' && (result.data as any)?.error) {
						toasts.error((result.data as any).error);
					}
				};
			}}
			class="inline-form"
		>
			<label class="field">
				<span class="field-label">{currentReadingLabel}</span>
				<div class="field-input-group">
					<input
						name="odometer"
						type="number"
						min="0"
						bind:value={odometerInput}
						class="input mono"
					/>
					<span
						class="input-suffix"
						title="{vehicleUnitTitle} · {$_('vehicle.edit.measurementUnit.locked')}"
						aria-hidden="true">{data.vehicle.odometer_unit}</span
					>
				</div>
			</label>
			<button type="submit" class="btn-primary" disabled={!odometerChanged}
				>{$_('vehicle.edit.odometer.update')}</button
			>
		</form>
	</section>

	<div class="divider"></div>

	<!-- Vehicle details & Purchase/Sale -->
	<section class="edit-section">
		<h2 class="section-label">{$_('vehicle.edit.vehicleDetails')}</h2>
		<form
			method="POST"
			action="?/update"
			use:enhance={({ formData }) => {
				formData.delete('purchase_price');
				formData.delete('sold_price');
				formData.append('purchase_price', String(purchasePrice || ''));
				formData.append('sold_price', String(soldPrice || ''));
				return async ({ result, update }) => {
					await update({ reset: false });
					if (result.type === 'success') {
						toasts.success($_('vehicle.edit.saved'));
						if (data.vehicle.sold_price_cents && !data.vehicle.archived_at) {
							showArchiveDialog = true;
						}
					} else if (result.type === 'failure' && (result.data as any)?.error) {
						toasts.error((result.data as any).error);
					}
				};
			}}
			class="details-form"
		>
			<div class="form-grid">
				<label class="field">
					<span class="field-label"
						>{$_('vehicle.edit.fields.name')} <span class="req">*</span></span
					>
					<input
						name="name"
						bind:value={name}
						required
						class="input"
						class:input--err={form?.errors?.name}
					/>
					{#if form?.errors?.name}<span class="field-err">{form.errors.name[0]}</span>{/if}
				</label>
				<label class="field">
					<span class="field-label"
						>{$_('vehicle.edit.fields.year')} <span class="req">*</span></span
					>
					<input
						name="year"
						type="number"
						bind:value={year}
						required
						class="input mono"
						class:input--err={form?.errors?.year}
					/>
					{#if form?.errors?.year}<span class="field-err">{form.errors.year[0]}</span>{/if}
				</label>
				<label class="field">
					<span class="field-label"
						>{$_('vehicle.edit.fields.make')} <span class="req">*</span></span
					>
					<input
						name="make"
						bind:value={make}
						required
						class="input"
						class:input--err={form?.errors?.make}
					/>
					{#if form?.errors?.make}<span class="field-err">{form.errors.make[0]}</span>{/if}
				</label>
				<label class="field">
					<span class="field-label"
						>{$_('vehicle.edit.fields.model')} <span class="req">*</span></span
					>
					<input
						name="model"
						bind:value={model}
						required
						class="input"
						class:input--err={form?.errors?.model}
					/>
					{#if form?.errors?.model}<span class="field-err">{form.errors.model[0]}</span>{/if}
				</label>
				<label class="field">
					<span class="field-label">{$_('vehicle.edit.fields.vin')}</span>
					<input
						name="vin"
						bind:value={vin}
						maxlength="17"
						placeholder={$_('vehicle.add.placeholders.vin')}
						class="input mono"
					/>
				</label>
				<label class="field">
					<span class="field-label">{$_('vehicle.edit.fields.licensePlate')}</span>
					<input
						name="license_plate"
						bind:value={licensePlate}
						maxlength="20"
						placeholder={$_('vehicle.add.placeholders.licensePlate')}
						class="input"
					/>
				</label>
			</div>

			<div class="prices-section">
				<h3 class="prices-title">{$_('vehicle.edit.purchaseSale')}</h3>
				<div class="form-grid">
					<label class="field">
						<span class="field-label">{$_('vehicle.edit.purchasePrice')}</span>
						<div class="field-input-group">
							<span class="input-prefix">{currency}</span>
							<input
								name="purchase_price"
								type="number"
								bind:value={purchasePrice}
								min="0"
								step="0.01"
								placeholder="0.00"
								class="input mono"
							/>
						</div>
					</label>
					<label class="field">
						<span class="field-label">{$_('vehicle.edit.soldPrice')}</span>
						<div class="field-input-group">
							<span class="input-prefix">{currency}</span>
							<input
								name="sold_price"
								type="number"
								bind:value={soldPrice}
								min="0"
								step="0.01"
								placeholder="0.00"
								class="input mono"
							/>
						</div>
					</label>
				</div>
			</div>

			<button type="submit" class="btn-primary" disabled={!detailsChanged}
				>{$_('vehicle.edit.save')}</button
			>
		</form>
	</section>

	<div class="divider"></div>

	{#if canConvertDistanceUnit}
		<details class="edit-section unit-section">
			<summary class="section-label unit-section__summary"
				>{$_('vehicle.edit.measurementUnit.title')}</summary
			>
			<form
				method="POST"
				action="?/convertUnit"
				bind:this={unitConversionForm}
				use:enhance={() => {
					unitConverting = true;
					return async ({ result, update }) => {
						await update({ reset: false });
						unitConverting = false;
						showUnitConversionDialog = false;
						if (result.type === 'success') {
							odometerInput = data.vehicle.current_odometer;
							selectedDistanceUnit = data.vehicle.odometer_unit as DistanceUnit;
							toasts.success($_('vehicle.edit.measurementUnit.converted'));
						} else if (result.type === 'failure' && (result.data as any)?.error) {
							toasts.error((result.data as any).error);
						}
					};
				}}
			>
				<div class="unit-converter">
					<div class="unit-converter__context">
						<div class="unit-converter__eyebrow">{$_('vehicle.edit.measurementUnit.eyebrow')}</div>
						<div class="unit-converter__reading">
							{formatNumber(data.vehicle.current_odometer, locale)}
							{data.vehicle.odometer_unit}
							<span aria-hidden="true">→</span>
							<strong>{formatNumber(convertedCurrentReading, locale)} {selectedDistanceUnit}</strong
							>
						</div>
						<p>{$_('vehicle.edit.measurementUnit.summary')}</p>
					</div>
					<div class="unit-converter__controls">
						<div class="unit-toggle" aria-label={$_('vehicle.edit.measurementUnit.title')}>
							{#each DISTANCE_UNITS as unit}
								<label
									class:unit-toggle__option--active={selectedDistanceUnit === unit}
									class="unit-toggle__option"
								>
									<input
										type="radio"
										name="odometer_unit"
										value={unit}
										bind:group={selectedDistanceUnit}
										class="sr-only"
									/>
									{$_(getDistanceUnitTranslationKey(unit))}
								</label>
							{/each}
						</div>
						<button
							type="button"
							class="btn-primary"
							disabled={!distanceUnitChanged || unitConverting}
							onclick={() => (showUnitConversionDialog = true)}
						>
							{$_('vehicle.edit.measurementUnit.review')}
						</button>
					</div>
				</div>
			</form>
		</details>
	{/if}

	<div class="divider"></div>

	<!-- Settings -->
	<section class="edit-section">
		<h2 class="section-label">{$_('vehicle.edit.settings.title')}</h2>

		<!-- Maintenance report -->
		<div class="settings-box">
			<div>
				<div class="settings-title">{$_('vehicle.edit.settings.report.title')}</div>
				<div class="settings-desc">{$_('vehicle.edit.settings.report.desc')}</div>
			</div>
			<button type="button" class="btn-ghost" onclick={() => (showReportModal = true)}>
				{$_('vehicle.edit.settings.report.btn')}
			</button>
		</div>

		<div class="settings-divider"></div>

		<!-- Archive / restore -->
		<div class="settings-box">
			<div>
				<div class="settings-title">
					{data.vehicle.archived_at
						? $_('vehicle.edit.settings.archive.titleRestore')
						: $_('vehicle.edit.settings.archive.title')}
				</div>
				<div class="settings-desc">
					{data.vehicle.archived_at
						? $_('vehicle.edit.settings.archive.descRestore')
						: $_('vehicle.edit.settings.archive.descArchive')}
				</div>
			</div>
			{#if data.vehicle.archived_at}
				<button type="button" class="btn-ghost" onclick={() => (showUnarchiveDialog = true)}>
					{$_('vehicle.edit.settings.archive.btnRestore')}
				</button>
			{:else}
				<button type="button" class="btn-ghost" onclick={() => (showArchiveDialog = true)}>
					{$_('vehicle.edit.settings.archive.btnArchive')}
				</button>
			{/if}
		</div>
	</section>

	<div class="divider"></div>

	<!-- Danger zone -->
	<section class="edit-section">
		<h2 class="section-label section-label--danger">{$_('vehicle.edit.settings.dangerZone')}</h2>
		<div class="danger-box">
			<div>
				<div class="danger-title">{$_('vehicle.edit.settings.delete.title')}</div>
				<div class="danger-desc">
					{$_('vehicle.edit.settings.delete.desc')}
				</div>
			</div>
			<button type="button" class="btn-danger" onclick={() => (showDeleteDialog = true)}>
				{$_('vehicle.edit.settings.delete.btn')}
			</button>
		</div>
	</section>
</div>

<ConfirmDialog
	open={showUnitConversionDialog}
	title={$_('vehicle.edit.measurementUnit.dialogTitle', {
		values: { from: data.vehicle.odometer_unit, to: selectedDistanceUnit }
	})}
	description={$_('vehicle.edit.measurementUnit.dialogDescription', {
		values: { value: formatNumber(convertedCurrentReading, locale), unit: selectedDistanceUnit }
	})}
	confirmLabel={$_('vehicle.edit.measurementUnit.confirm')}
	cancelLabel={$_('common.cancel')}
	danger={false}
	loading={unitConverting}
	onconfirm={() => unitConversionForm?.requestSubmit()}
	onclose={() => (showUnitConversionDialog = false)}
/>

<ConfirmDialog
	open={showDeleteDialog}
	title={$_('vehicle.edit.settings.delete.dialog.title', { values: { name: data.vehicle.name } })}
	description={$_('vehicle.edit.settings.delete.dialog.desc')}
	confirmLabel={$_('vehicle.edit.settings.delete.dialog.confirm')}
	cancelLabel={$_('vehicle.edit.settings.delete.dialog.cancel')}
	danger={true}
	loading={deleteLoading}
	onconfirm={() => {
		deleteLoading = true;
		const form = document.createElement('form');
		form.method = 'POST';
		form.action = '?/delete';
		document.body.appendChild(form);
		form.submit();
	}}
	onclose={() => (showDeleteDialog = false)}
/>

<ConfirmDialog
	open={showArchiveDialog}
	title={$_('vehicle.edit.settings.archiveDialog.title', { values: { name: data.vehicle.name } })}
	description={$_('vehicle.edit.settings.archiveDialog.desc')}
	confirmLabel={$_('vehicle.edit.settings.archiveDialog.confirm')}
	cancelLabel={$_('vehicle.edit.settings.archiveDialog.cancel')}
	danger={false}
	loading={archiveLoading}
	onconfirm={() => {
		archiveLoading = true;
		const form = document.createElement('form');
		form.method = 'POST';
		form.action = '?/archive';
		// Include the CURRENT sold price value
		const soldPriceInput = document.createElement('input');
		soldPriceInput.type = 'hidden';
		soldPriceInput.name = 'sold_price';
		soldPriceInput.value = soldPrice || '';
		form.appendChild(soldPriceInput);
		document.body.appendChild(form);
		form.submit();
	}}
	onclose={() => (showArchiveDialog = false)}
/>

<ConfirmDialog
	open={showUnarchiveDialog}
	title={$_('vehicle.edit.settings.unarchiveDialog.title', { values: { name: data.vehicle.name } })}
	description={$_('vehicle.edit.settings.unarchiveDialog.desc')}
	confirmLabel={$_('vehicle.edit.settings.unarchiveDialog.confirm')}
	cancelLabel={$_('vehicle.edit.settings.unarchiveDialog.cancel')}
	danger={false}
	loading={false}
	onconfirm={() => {
		const form = document.createElement('form');
		form.method = 'POST';
		form.action = '?/unarchive';
		document.body.appendChild(form);
		form.submit();
	}}
	onclose={() => (showUnarchiveDialog = false)}
/>

<Modal
	open={showReportModal}
	title={$_('vehicle.edit.settings.report.modal.title')}
	onclose={() => (showReportModal = false)}
>
	<p class="report-modal-desc">{$_('vehicle.edit.settings.report.modal.desc')}</p>
	<ul class="tracker-checklist">
		{#each data.reportTrackers as tracker}
			<li>
				<label class="tracker-check-label">
					<input
						type="checkbox"
						checked={!excludedTrackerIds.has(tracker.id)}
						onchange={(e) => {
							const next = new Set(excludedTrackerIds);
							if (e.currentTarget.checked) next.delete(tracker.id);
							else next.add(tracker.id);
							excludedTrackerIds = next;
						}}
					/>
					{tracker.name}
				</label>
			</li>
		{/each}
	</ul>
	<div class="report-section-divider"></div>
	<label class="tracker-check-label">
		<input type="checkbox" bind:checked={includeFinance} />
		{$_('vehicle.edit.settings.report.modal.includeFinance')}
	</label>
	<label class="tracker-check-label" class:tracker-check-label--disabled={!data.hasNotes}>
		<input type="checkbox" bind:checked={includeNotes} disabled={!data.hasNotes} />
		{$_('vehicle.edit.settings.report.modal.includeNotes')}
	</label>
	<label class="tracker-check-label">
		<input type="checkbox" bind:checked={includeAttachments} />
		{$_('vehicle.edit.settings.report.modal.includeAttachments')}
	</label>
	{#snippet footer()}
		<button type="button" class="btn-ghost" onclick={() => (showReportModal = false)}>
			{$_('vehicle.edit.settings.report.modal.cancel')}
		</button>
		<button
			type="button"
			class="btn-primary"
			disabled={reportDownloading}
			onclick={handleReportDownload}
		>
			{reportDownloading
				? $_('vehicle.edit.settings.report.modal.downloading')
				: $_('vehicle.edit.settings.report.modal.download')}
		</button>
	{/snippet}
</Modal>

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

	.edit-page {
		max-width: 860px;
		display: flex;
		flex-direction: column;
		gap: 0;
	}
	.edit-section {
		padding: var(--space-5) 0;
	}
	.edit-section:first-child {
		padding: var(--space-5) 0;
		padding-top: 0;
	}
	.divider {
		border: none;
		border-top: 1px solid var(--border);
	}

	.section-label {
		font-size: var(--text-xs);
		font-weight: 600;
		color: var(--text-muted);
		text-transform: uppercase;
		letter-spacing: 0.07em;
		margin: 0 0 var(--space-4);
	}
	.section-label--danger {
		color: var(--status-overdue);
	}

	.unit-section__summary {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		margin: 0;
		cursor: pointer;
		list-style: none;
	}
	.unit-section__summary::-webkit-details-marker {
		display: none;
	}
	.unit-section__summary::after {
		content: '';
		width: 6px;
		height: 6px;
		margin-left: auto;
		border-right: 1.5px solid var(--text-subtle);
		border-bottom: 1.5px solid var(--text-subtle);
		transform: rotate(-45deg);
		transition: transform 150ms ease;
	}
	.unit-section[open] .unit-section__summary {
		margin-bottom: var(--space-4);
	}
	.unit-section[open] .unit-section__summary::after {
		transform: rotate(45deg);
	}

	.settings-box {
		border: 1px solid var(--border);
		border-radius: 10px;
		padding: var(--space-4);
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-4);
	}
	.settings-title {
		font-size: var(--text-sm);
		font-weight: 500;
		color: var(--text);
	}
	.settings-desc {
		font-size: var(--text-sm);
		color: var(--text-muted);
		margin-top: var(--space-1);
	}
	.settings-divider {
		height: 1px;
		margin: var(--space-2) 0;
	}
	.unit-converter {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-6);
		padding: var(--space-4) 0;
	}
	.unit-converter__context {
		min-width: 0;
	}
	.unit-converter__eyebrow {
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		color: var(--text-muted);
	}
	.unit-converter__reading {
		display: flex;
		align-items: baseline;
		gap: var(--space-2);
		margin-top: var(--space-1);
		font-family: var(--font-mono);
		font-size: var(--text-lg);
		color: var(--text-muted);
	}
	.unit-converter__reading strong {
		color: var(--text);
		font-weight: 650;
	}
	.unit-converter__context p {
		margin: var(--space-1) 0 0;
		font-size: var(--text-sm);
		color: var(--text-muted);
	}
	.unit-converter__controls {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		flex-shrink: 0;
	}
	.unit-toggle {
		display: inline-flex;
		padding: 3px;
		border: 1px solid var(--border);
		border-radius: 10px;
		background: var(--bg-muted);
	}
	.unit-toggle__option {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 48px;
		min-height: 38px;
		padding: 0 var(--space-3);
		border-radius: 7px;
		font-family: var(--font-mono);
		font-size: var(--text-sm);
		font-weight: 600;
		color: var(--text-muted);
		cursor: pointer;
		transition:
			background 120ms ease,
			color 120ms ease,
			box-shadow 120ms ease;
	}
	.unit-toggle__option--active {
		background: var(--bg);
		color: var(--text);
		box-shadow: 0 1px 2px color-mix(in srgb, var(--text) 12%, transparent);
	}
	.inline-form {
		display: flex;
		gap: var(--space-3);
		align-items: flex-end;
	}
	.details-form {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}
	.prices-section {
		margin-top: var(--space-2);
		padding-top: var(--space-4);
		border-top: 1px solid var(--border);
	}
	.prices-title {
		font-size: var(--text-sm);
		font-weight: 600;
		color: var(--text-muted);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		margin: 0 0 var(--space-3);
	}
	.form-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: var(--space-4);
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
	.field-input-group {
		display: flex;
		align-items: stretch;
	}
	.input-prefix {
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0.75rem 0.875rem;
		background: var(--bg-muted);
		border: 1px solid var(--border);
		border-right: none;
		border-radius: 10px 0 0 10px;
		font-size: var(--text-md);
		font-weight: 500;
		color: var(--text-muted);
		font-family: var(--font-mono);
		min-width: 48px;
		height: 48px;
		box-sizing: border-box;
	}
	.input-prefix + .input {
		border-radius: 0 10px 10px 0;
		flex: 1;
		height: 48px;
	}
	.input-suffix {
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0.75rem 0.875rem;
		background: var(--bg-muted);
		border: 1px solid var(--border);
		border-left: none;
		border-radius: 0 10px 10px 0;
		font-size: var(--text-sm);
		font-weight: 500;
		color: var(--text-muted);
		font-family: var(--font-mono);
		min-width: 44px;
		height: 48px;
		box-sizing: border-box;
		cursor: help;
		user-select: none;
	}
	.input:has(+ .input-suffix) {
		border-radius: 10px 0 0 10px;
		flex: 1;
		height: 48px;
	}
	.field-input-group:hover .input-suffix {
		border-color: var(--border-strong);
	}
	.field-input-group:focus-within .input-suffix {
		border-color: var(--accent);
	}
	.req {
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
	}
	.input:hover {
		border-color: var(--border-strong);
	}
	.input:focus {
		outline: 2px solid var(--accent);
		outline-offset: 1px;
		border-color: var(--accent);
	}
	.input--err {
		border-color: var(--status-overdue);
	}
	.input,
	.btn-primary {
		height: 48px;
		box-sizing: border-box;
	}
	.field-err {
		font-size: var(--text-xs);
		color: var(--status-overdue);
	}
	.mono {
		font-family: var(--font-mono);
		font-variant-numeric: tabular-nums;
	}

	.danger-box {
		border: 1px solid color-mix(in srgb, var(--status-overdue) 25%, transparent);
		border-radius: 10px;
		padding: var(--space-4);
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-4);
	}
	.danger-title {
		font-size: var(--text-sm);
		font-weight: 500;
		color: var(--text);
	}
	.danger-desc {
		font-size: var(--text-sm);
		color: var(--text-muted);
		margin-top: var(--space-1);
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
		white-space: nowrap;
		min-height: 48px;
	}

	.btn-ghost {
		padding: 0.75rem 1rem;
		background: none;
		border: 1px solid var(--border);
		color: var(--text-muted);
		border-radius: 10px;
		font-size: var(--text-sm);
		font-weight: 500;
		cursor: pointer;
		white-space: nowrap;
		min-height: 48px;
	}
	.btn-ghost:hover {
		background: var(--bg-muted);
		color: var(--text);
	}
	.btn-primary:hover {
		background: var(--accent-hover);
	}
	.btn-danger {
		padding: 0.75rem 1rem;
		background: none;
		border: 1px solid var(--status-overdue);
		color: var(--status-overdue);
		border-radius: 10px;
		font-size: var(--text-sm);
		font-weight: 500;
		cursor: pointer;
		white-space: nowrap;
		min-height: 48px;
	}
	.btn-danger:hover {
		background: color-mix(in srgb, var(--status-overdue) 8%, transparent);
	}

	@media (max-width: 480px) {
		.form-grid {
			grid-template-columns: 1fr;
		}
		.inline-form {
			flex-direction: column;
			align-items: stretch;
		}
		.settings-box,
		.unit-converter,
		.danger-box {
			flex-direction: column;
			align-items: flex-start;
		}
		.unit-converter__controls {
			width: 100%;
			justify-content: space-between;
		}
	}

	.report-modal-desc {
		font-size: var(--text-sm);
		color: var(--text-muted);
		margin: 0 0 var(--space-4);
	}

	.tracker-checklist {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	.tracker-check-label {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		font-size: var(--text-base);
		color: var(--text);
		cursor: pointer;
	}

	.tracker-check-label input[type='checkbox'] {
		width: 16px;
		height: 16px;
		accent-color: var(--accent);
		cursor: pointer;
		flex-shrink: 0;
	}

	.tracker-check-label--disabled {
		color: var(--text-subtle);
		cursor: default;
	}

	.report-section-divider {
		border-top: 1px solid var(--border);
		margin: var(--space-3) 0;
	}
</style>
