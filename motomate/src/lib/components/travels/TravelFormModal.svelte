<script lang="ts">
	import { enhance } from '$app/forms';
	import Modal from '$lib/components/ui/Modal.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { _ } from '$lib/i18n';
	import type { Travel } from '$lib/db/schema.js';

	interface GpxDoc {
		id: string;
		name: string; // original filename
		title?: string | null; // user-facing description
		url?: string | null;
		index: number; // which day slot this GPX belongs to
	}

	interface Props {
		open: boolean;
		mode: 'create' | 'edit';
		travel?: Travel | null;
		existingGpxDocs?: GpxDoc[];
		excludedGpxDays?: number[]; // day indices to exclude from map
		availableRouteDocs?: GpxDoc[]; // all vehicle route docs for "pick from library"
		vehicleId: string;
		currency: string;
		locale?: string;
		onclose: () => void;
	}

	let {
		open,
		mode,
		travel = null,
		existingGpxDocs = [],
		excludedGpxDays = [],
		availableRouteDocs = [],
		vehicleId,
		currency,
		locale = 'en',
		onclose
	}: Props = $props();

	const today = new Date().toISOString().slice(0, 10);

	let submitting = $state(false);
	let durationDays = $state(1);
	let startDate = $state(today);
	let removedSlots = $state<Record<number, string>>({}); // slot index → docId
	// Per-slot selected files (keyed by slot index)
	let selectedFiles = $state<Record<number, File | null>>({});
	// Days to exclude from map
	let excludedDays = $state<number[]>([]);
	// Per-slot: true = show library picker, false = show upload zone
	let slotPickMode = $state<Record<number, boolean>>({});
	// Per-slot: selected existing doc ID from library
	let selectedExistingIds = $state<Record<number, string>>({});

	$effect(() => {
		if (open) {
			const t = travel;
			durationDays = t?.duration_days ?? 1;
			startDate = t?.start_date ?? today;
			removedSlots = {};
			selectedFiles = {};
			excludedDays = [...(excludedGpxDays ?? [])];
			slotPickMode = {};
			selectedExistingIds = {};
		}
	});

	function toggleExcludedDay(dayIndex: number) {
		if (excludedDays.includes(dayIndex)) {
			excludedDays = excludedDays.filter((d) => d !== dayIndex);
		} else {
			excludedDays = [...excludedDays, dayIndex];
		}
	}

	function slotDate(i: number): string {
		try {
			const d = new Date(startDate + 'T00:00:00');
			d.setDate(d.getDate() + i);
			return d.toLocaleDateString(locale, { day: 'numeric', month: 'short' });
		} catch {
			return '';
		}
	}

	const MAX_SLOTS = 14;
	// Determine max slot index from existing docs to preserve position when duration is reduced
	const maxExistingIndex = $derived(
		existingGpxDocs.reduce((max, doc) => Math.max(max, doc.index), 0)
	);
	// Ensure enough slots to show all existing docs even if duration was reduced
	const slots = $derived(Math.min(Math.max(durationDays, maxExistingIndex + 1, 1), MAX_SLOTS));

	function removeExistingGpx(slotIndex: number, docId: string) {
		removedSlots = { ...removedSlots, [slotIndex]: docId };
	}

	function handleSlotFileChange(i: number, e: Event) {
		const file = (e.target as HTMLInputElement).files?.[0] ?? null;
		selectedFiles = { ...selectedFiles, [i]: file };
	}

	function clearSlotFile(i: number) {
		selectedFiles = { ...selectedFiles, [i]: null };
		// Also clear the actual input
		const input = document.getElementById(`gpx-slot-${i}`) as HTMLInputElement | null;
		if (input) input.value = '';
	}

	function clearSelectedExisting(i: number) {
		const next = { ...selectedExistingIds };
		delete next[i];
		selectedExistingIds = next;
	}

	const defaultExpenses = $derived(
		travel?.total_expenses_cents != null ? (travel.total_expenses_cents / 100).toFixed(2) : ''
	);
</script>

<Modal
	{open}
	title={mode === 'create' ? $_('travels.form.createTitle') : $_('travels.form.editTitle')}
	{onclose}
>
	<div class="form-scroll">
		<form
			id="travel-form"
			method="POST"
			action={mode === 'create' ? '?/create' : '?/edit'}
			enctype="multipart/form-data"
			use:enhance={({ formData }) => {
				// Inject selected files into formData
				for (const [i, file] of Object.entries(selectedFiles)) {
					if (file) formData.set(`gpx_file_${i}`, file);
				}
				submitting = true;
				return async ({ update }) => {
					await update();
					submitting = false;
				};
			}}
		>
			<input type="hidden" name="vehicle_id" value={vehicleId} />
			{#if mode === 'edit' && travel}
				<input type="hidden" name="id" value={travel.id} />
			{/if}
			{#each Object.entries(removedSlots) as [slotIdx, docId]}
				<input type="hidden" name="remove_gpx_slot_{slotIdx}" value={docId} />
			{/each}
			{#each Object.entries(selectedExistingIds) as [i, docId]}
				<input type="hidden" name="gpx_existing_doc_{i}" value={docId} />
			{/each}
			{#if excludedDays.length > 0}
				<input type="hidden" name="excluded_gpx_days" value={JSON.stringify(excludedDays)} />
			{/if}

			<!-- Title -->
			<div class="form-group">
				<label for="tf-title" class="field-label">{$_('travels.form.title')}</label>
				<input
					id="tf-title"
					type="text"
					name="title"
					value={travel?.title ?? ''}
					placeholder={$_('travels.form.titlePlaceholder')}
					maxlength="200"
					class="input"
					required
				/>
			</div>

			<!-- Start date + Duration -->
			<div class="form-row">
				<div class="form-group" style="margin-bottom:0">
					<label for="tf-date" class="field-label">{$_('travels.form.startDate')}</label>
					<input
						id="tf-date"
						type="date"
						name="start_date"
						value={startDate}
						class="input"
						required
						oninput={(e) => {
							startDate = (e.target as HTMLInputElement).value;
						}}
					/>
				</div>
				<div class="form-group" style="margin-bottom:0">
					<label for="tf-days" class="field-label">{$_('travels.form.duration')}</label>
					<input
						id="tf-days"
						type="number"
						name="duration_days"
						min="1"
						max="365"
						value={durationDays}
						class="input"
						oninput={(e) => {
							durationDays = parseInt((e.target as HTMLInputElement).value) || 1;
						}}
					/>
				</div>
			</div>

			<!-- Expenses -->
			<div class="form-group">
				<label for="tf-expenses" class="field-label">
					{$_('travels.form.expenses')}
					<span class="label-hint">{$_('common.optional')}</span>
				</label>
				<div class="input-group">
					<span class="input-group-prefix">{currency}</span>
					<input
						id="tf-expenses"
						type="number"
						name="total_expenses"
						min="0"
						step="0.01"
						value={defaultExpenses}
						placeholder="0.00"
						class="input input--mono input-group-field"
					/>
				</div>
			</div>

			<!-- Remark -->
			<div class="form-group">
				<label for="tf-remark" class="field-label">
					{$_('travels.form.remark')}
					<span class="label-hint">{$_('common.optional')}</span>
				</label>
				<textarea
					id="tf-remark"
					name="remark"
					rows="2"
					maxlength="2000"
					placeholder={$_('travels.form.remarkPlaceholder')}
					class="input input--textarea">{travel?.remark ?? ''}</textarea
				>
			</div>

			<!-- GPX routes -->
			<div class="form-group" style="margin-bottom:0">
				<span class="field-label">{$_('travels.form.gpxFiles')}</span>

				<!-- Per-day slots: show saved file or upload zone -->
				<div class="gpx-slots">
					{#each Array.from({ length: slots }, (_, i) => i) as i}
						{@const existingDoc = existingGpxDocs.find((d) => d.index === i)}
						{@const isRemoved = removedSlots[i] !== undefined}
						{@const newFile = selectedFiles[i]}
						<div class="gpx-slot">
							<span class="gpx-slot-day">
								{$_('travels.form.gpxSlot', { values: { n: i + 1 } })}
								{#if slotDate(i)}<span class="gpx-slot-date">{slotDate(i)}</span>{/if}
							</span>
							{#if existingDoc && !isRemoved}
								<!-- Saved file: chip with download + remove + exclude toggle -->
								<div class="gpx-slot-row">
									<div class="file-chip">
										<span class="file-chip-icon" aria-hidden="true">
											<svg
												width="14"
												height="14"
												viewBox="0 0 24 24"
												fill="none"
												stroke="currentColor"
												stroke-width="2"
											>
												<polyline points="3 17 8 12 13 15 21 7" />
											</svg>
										</span>
										<span class="file-chip-name">{existingDoc.title || existingDoc.name}</span>
										{#if existingDoc.url}
											<a
												href={existingDoc.url}
												download
												class="file-chip-action"
												aria-label="Download {existingDoc.name}"
												title="Download"
											>
												<svg
													width="14"
													height="14"
													viewBox="0 0 24 24"
													fill="none"
													stroke="currentColor"
													stroke-width="2"
												>
													<path d="M12 5v14M5 19h14M19 12l-7 7-7-7" />
												</svg>
											</a>
										{/if}
										<button
											type="button"
											class="file-chip-remove"
											onclick={() => removeExistingGpx(i, existingDoc.id)}
											aria-label="Remove {existingDoc.name}"
										>
											<svg
												width="14"
												height="14"
												viewBox="0 0 24 24"
												fill="none"
												stroke="currentColor"
												stroke-width="2"
											>
												<path d="M18 6L6 18M6 6l12 12" />
											</svg>
										</button>
									</div>
									<button
										type="button"
										class="exclude-toggle"
										class:exclude-toggle--excluded={excludedDays.includes(i)}
										title={excludedDays.includes(i)
											? $_('travels.map.showDay')
											: $_('travels.map.hideDay')}
										onclick={() => toggleExcludedDay(i)}
									>
										<svg
											width="14"
											height="14"
											viewBox="0 0 24 24"
											fill="none"
											stroke="currentColor"
											stroke-width="2"
										>
											{#if excludedDays.includes(i)}
												<path
													d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"
												/>
												<line x1="1" y1="1" x2="23" y2="23" />
											{:else}
												<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
												<circle cx="12" cy="12" r="3" />
											{/if}
										</svg>
									</button>
								</div>
							{:else if newFile}
								<!-- Newly selected file -->
								<div class="gpx-slot-row">
									<div class="file-chip">
										<span class="file-chip-icon" aria-hidden="true">
											<svg
												width="14"
												height="14"
												viewBox="0 0 24 24"
												fill="none"
												stroke="currentColor"
												stroke-width="2"
											>
												<polyline points="3 17 8 12 13 15 21 7" />
											</svg>
										</span>
										<span class="file-chip-name">{newFile.name}</span>
										<button
											type="button"
											class="file-chip-remove"
											onclick={() => clearSlotFile(i)}
											aria-label="Remove file"
										>
											<svg
												width="14"
												height="14"
												viewBox="0 0 24 24"
												fill="none"
												stroke="currentColor"
												stroke-width="2"
											>
												<path d="M18 6L6 18M6 6l12 12" />
											</svg>
										</button>
									</div>
									<button
										type="button"
										class="exclude-toggle"
										class:exclude-toggle--excluded={excludedDays.includes(i)}
										title={excludedDays.includes(i)
											? $_('travels.map.showDay')
											: $_('travels.map.hideDay')}
										onclick={() => toggleExcludedDay(i)}
									>
										<svg
											width="14"
											height="14"
											viewBox="0 0 24 24"
											fill="none"
											stroke="currentColor"
											stroke-width="2"
										>
											{#if excludedDays.includes(i)}
												<path
													d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"
												/>
												<line x1="1" y1="1" x2="23" y2="23" />
											{:else}
												<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
												<circle cx="12" cy="12" r="3" />
											{/if}
										</svg>
									</button>
								</div>
							{:else if selectedExistingIds[i]}
								<!-- Borrowed existing doc from library -->
								{@const borrowedDoc = availableRouteDocs.find(
									(d) => d.id === selectedExistingIds[i]
								)}
								<div class="gpx-slot-row">
									<div class="file-chip">
										<span class="file-chip-icon" aria-hidden="true">
											<svg
												width="14"
												height="14"
												viewBox="0 0 24 24"
												fill="none"
												stroke="currentColor"
												stroke-width="2"
											>
												<polyline points="3 17 8 12 13 15 21 7" />
											</svg>
										</span>
										<span class="file-chip-name">{borrowedDoc?.title || borrowedDoc?.name}</span>
										<button
											type="button"
											class="file-chip-remove"
											onclick={() => clearSelectedExisting(i)}
											aria-label="Remove selection"
										>
											<svg
												width="14"
												height="14"
												viewBox="0 0 24 24"
												fill="none"
												stroke="currentColor"
												stroke-width="2"
											>
												<path d="M18 6L6 18M6 6l12 12" />
											</svg>
										</button>
									</div>
									<button
										type="button"
										class="exclude-toggle"
										class:exclude-toggle--excluded={excludedDays.includes(i)}
										title={excludedDays.includes(i)
											? $_('travels.map.showDay')
											: $_('travels.map.hideDay')}
										onclick={() => toggleExcludedDay(i)}
									>
										<svg
											width="14"
											height="14"
											viewBox="0 0 24 24"
											fill="none"
											stroke="currentColor"
											stroke-width="2"
										>
											{#if excludedDays.includes(i)}
												<path
													d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"
												/>
												<line x1="1" y1="1" x2="23" y2="23" />
											{:else}
												<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
												<circle cx="12" cy="12" r="3" />
											{/if}
										</svg>
									</button>
								</div>
							{:else if slotPickMode[i]}
								<!-- Library picker: select dropdown -->
								<div class="gpx-pick-row">
									<select
										class="gpx-pick-select"
										onchange={(e) => {
											const val = (e.target as HTMLSelectElement).value;
											if (val) {
												selectedExistingIds = { ...selectedExistingIds, [i]: val };
											}
											slotPickMode = { ...slotPickMode, [i]: false };
										}}
									>
										<option value="">{$_('travels.form.gpxPickPlaceholder')}</option>
										{#each availableRouteDocs as doc}
											<option value={doc.id}>{doc.title || doc.name}</option>
										{/each}
									</select>
									<button
										type="button"
										class="gpx-pick-cancel"
										onclick={() => (slotPickMode = { ...slotPickMode, [i]: false })}
									>
										{$_('common.cancel')}
									</button>
								</div>
							{:else}
								<!-- Empty slot: upload zone + optional pick-from-library -->
								<div class="gpx-slot-options">
									<label class="upload-slot" for="gpx-slot-{i}">
										<svg
											class="upload-slot-icon"
											width="14"
											height="14"
											viewBox="0 0 24 24"
											fill="none"
											stroke="currentColor"
											stroke-width="2"
										>
											<path d="M12 5v14M5 12l7-7 7 7" />
										</svg>
										<span>{$_('travels.form.gpxChoose')}</span>
										<input
											id="gpx-slot-{i}"
											type="file"
											name="gpx_file_{i}"
											accept=".gpx,application/gpx+xml"
											class="upload-slot-input"
											onchange={(e) => handleSlotFileChange(i, e)}
										/>
									</label>
									{#if availableRouteDocs.length > 0}
										<button
											type="button"
											class="gpx-pick-trigger"
											onclick={() => (slotPickMode = { ...slotPickMode, [i]: true })}
										>
											{$_('travels.form.gpxPickExisting')}
										</button>
									{/if}
								</div>
							{/if}
						</div>
					{/each}
				</div>

				<p class="field-hint">{$_('travels.form.gpxHint')}</p>
			</div>

			<!-- Actions -->
			<div class="form-actions">
				<button type="submit" class="btn-primary" disabled={submitting}>
					{submitting
						? $_('common.saving')
						: mode === 'create'
							? $_('travels.form.submit.create')
							: $_('travels.form.submit.edit')}
				</button>
				<button type="button" class="btn-cancel" onclick={onclose}>
					{$_('common.cancel')}
				</button>
			</div>
		</form>
	</div>
</Modal>

<style>
	/* Scrollable modal body */
	.form-scroll {
		max-height: calc(85vh - 160px);
		overflow-y: auto;
		overflow-x: hidden;
		padding-right: var(--space-1);
	}

	/* Field groups — matches documents page pattern */
	.form-group {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		margin-bottom: var(--space-4);
	}
	.form-row {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: var(--space-3);
		margin-bottom: var(--space-4);
	}
	@media (max-width: 480px) {
		.form-row {
			grid-template-columns: 1fr;
		}
	}

	/* Labels — matches .field-label across documents + Input.svelte */
	.field-label {
		font-size: var(--text-sm);
		font-weight: 500;
		color: var(--text-muted);
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}
	.label-hint {
		font-size: var(--text-xs);
		font-weight: 400;
		color: var(--text-subtle);
	}
	.field-hint {
		font-size: var(--text-xs);
		color: var(--text-subtle);
		margin: var(--space-2) 0 0;
	}

	/* Inputs — matches .input across documents + Input.svelte */
	.input {
		padding: 0.75rem;
		border: 1px solid var(--border);
		border-radius: 10px;
		background: var(--bg);
		color: var(--text);
		font-size: var(--text-md);
		font-family: var(--font-sans);
		width: 100%;
		min-height: 48px;
		box-sizing: border-box;
		transition: border-color 0.1s;
	}
	.input:hover {
		border-color: var(--border-strong);
	}
	.input:focus {
		outline: 2px solid var(--accent);
		outline-offset: 1px;
		border-color: var(--accent);
	}
	.input--mono {
		font-family: var(--font-mono);
		font-variant-numeric: tabular-nums;
	}
	.input--textarea {
		min-height: auto;
		resize: vertical;
		line-height: var(--leading-base);
	}

	/* Currency prefix group */
	.input-group {
		display: flex;
		align-items: stretch;
		border: 1px solid var(--border);
		border-radius: 10px;
		overflow: hidden;
		transition: border-color 0.1s;
	}
	.input-group:focus-within {
		outline: 2px solid var(--accent);
		outline-offset: 1px;
		border-color: var(--accent);
	}
	.input-group-prefix {
		padding: 0 0.75rem;
		display: flex;
		align-items: center;
		font-size: var(--text-sm);
		color: var(--text-muted);
		background: var(--bg-subtle);
		border-right: 1px solid var(--border);
		white-space: nowrap;
		flex-shrink: 0;
	}
	.input-group-field {
		border: none;
		border-radius: 0;
		outline: none;
		flex: 1;
		min-width: 0;
	}
	.input-group-field:focus {
		outline: none;
		border-color: transparent;
	}

	/* File chip — matches documents page pattern exactly */
	.file-chip {
		display: flex;
		align-items: center;
		gap: var(--space-1);
		background: var(--bg-muted);
		padding: 0.375rem 0.5rem;
		border-radius: 8px;
		min-width: 0;
		overflow: hidden;
		border: 1px solid var(--border);
		flex: 1;
		max-width: calc(100% - 36px);
	}
	.file-chip-icon {
		color: var(--accent);
		display: flex;
		align-items: center;
		flex-shrink: 0;
	}
	.file-chip-name {
		flex: 1;
		font-size: var(--text-sm);
		color: var(--text);
		font-weight: 500;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		min-width: 0;
	}
	.file-chip-action {
		background: none;
		border: none;
		cursor: pointer;
		color: var(--text-subtle);
		padding: 0.2rem;
		border-radius: 4px;
		display: flex;
		align-items: center;
		flex-shrink: 0;
		text-decoration: none;
	}
	.file-chip-action:hover {
		background: var(--border);
		color: var(--accent);
	}
	.file-chip-remove {
		background: none;
		border: none;
		cursor: pointer;
		color: var(--text-subtle);
		padding: 0.2rem;
		border-radius: 4px;
		display: flex;
		align-items: center;
		flex-shrink: 0;
	}
	.file-chip-remove:hover {
		background: var(--border);
		color: var(--text);
	}

	/* GPX slots */
	.gpx-slots {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		margin-top: var(--space-2);
		max-height: 280px;
		overflow-y: auto;
		overflow-x: hidden;
		padding-right: var(--space-1);
	}
	.gpx-slot {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		min-width: 0;
		flex-shrink: 0;
	}
	.gpx-slot-day {
		font-size: var(--text-xs);
		font-weight: 500;
		color: var(--text-subtle);
		white-space: nowrap;
		min-width: 64px;
		display: flex;
		flex-direction: column;
		gap: 1px;
	}
	.gpx-slot-date {
		font-weight: 400;
		color: var(--text-subtle);
	}

	/* Upload slot — compact upload zone matching documents page aesthetic */
	.upload-slot {
		flex: 1;
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: 0.5rem 0.75rem;
		border: 1.5px dashed var(--border);
		border-radius: 8px;
		background: var(--bg-subtle);
		cursor: pointer;
		font-size: var(--text-sm);
		color: var(--text-subtle);
		transition:
			border-color 0.15s,
			background 0.15s;
	}
	.upload-slot:hover {
		border-color: var(--accent);
		background: color-mix(in srgb, var(--accent) 5%, var(--bg-subtle));
		color: var(--accent);
	}
	.upload-slot-icon {
		flex-shrink: 0;
	}
	.upload-slot-input {
		display: none;
	}

	/* Form actions — matches documents page */
	.form-actions {
		display: flex;
		gap: var(--space-3);
		margin-top: var(--space-5);
		padding-top: var(--space-4);
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
		font-family: var(--font-sans);
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
		font-family: var(--font-sans);
	}
	.btn-cancel:hover {
		background: var(--bg-muted);
		color: var(--text);
	}

	/* GPX slot row with file chip + exclude toggle */
	.gpx-slot-row {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		min-width: 0;
		flex: 1;
	}
	.exclude-toggle {
		flex-shrink: 0;
		width: 28px;
		height: 28px;
		border-radius: 6px;
		border: 1px solid var(--border);
		background: var(--bg);
		color: var(--text-muted);
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: all 0.15s ease;
	}
	.exclude-toggle:hover {
		border-color: var(--accent);
		color: var(--accent);
	}
	.exclude-toggle--excluded {
		background: var(--bg-muted);
		border-style: dashed;
		color: var(--text-subtle);
	}
	.exclude-toggle--excluded:hover {
		background: var(--accent-subtle);
		border-style: solid;
		color: var(--accent);
	}
	.exclude-toggle:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 1px;
	}
	.gpx-slot-options {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		flex: 1;
	}
	.gpx-pick-trigger {
		font-size: var(--text-xs);
		color: var(--accent);
		background: none;
		border: none;
		cursor: pointer;
		padding: var(--space-1) 0;
		text-align: left;
		line-height: var(--leading-tight);
	}
	.gpx-pick-trigger:hover {
		color: var(--accent-hover);
	}
	.gpx-pick-row {
		display: flex;
		gap: var(--space-2);
		flex: 1;
		min-width: 0;
		align-items: center;
	}
	.gpx-pick-select {
		flex: 1;
		font-size: max(1rem, 16px);
		padding: var(--space-1) var(--space-2);
		border: 1px solid var(--border);
		border-radius: 8px;
		background: var(--bg);
		color: var(--text);
		min-width: 0;
	}
	.gpx-pick-cancel {
		font-size: var(--text-xs);
		color: var(--text-muted);
		background: none;
		border: none;
		cursor: pointer;
		padding: var(--space-1) 0;
		white-space: nowrap;
		flex-shrink: 0;
		line-height: var(--leading-tight);
	}
	.gpx-pick-cancel:hover {
		color: var(--text);
	}
</style>
