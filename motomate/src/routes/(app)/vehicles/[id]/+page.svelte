<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/stores';
	import { replaceState, beforeNavigate } from '$app/navigation';
	import { untrack } from 'svelte';
	import type { PageData } from './$types';
	import ConfirmDialog from '$lib/components/ui/ConfirmDialog.svelte';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import { _, waitLocale } from '$lib/i18n';
	import { quickAdd } from '$lib/stores/quickAdd.js';
	import {
		formatDateShort,
		formatYearMonth,
		formatNumber,
		formatCurrency
	} from '$lib/utils/format.js';

	let { data, form }: { data: PageData; form: Record<string, unknown> | null } = $props();

	$effect(() => {
		waitLocale();
	});

	const locale = $derived(data.user?.settings?.locale ?? 'en');
	const unit = $derived(data.vehicle.odometer_unit);
	const today = new Date().toISOString().slice(0, 10);

	// Log dropdown
	let menuOpen = $state(false);
	let activeForm = $state<'service' | 'odometer' | 'note' | null>(null);
	let submitting = $state(false);
	let isMobile = $state(false);

	$effect(() => {
		if (typeof window !== 'undefined') {
			isMobile = window.innerWidth <= 768;
			const handleResize = () => {
				isMobile = window.innerWidth <= 768;
			};
			window.addEventListener('resize', handleResize, { passive: true });
			return () => window.removeEventListener('resize', handleResize);
		}
	});

	// Track odometer form input for reactive warning
	let odoValue = $state('');
	let odoDirty = $state(false);

	function openForm(kind: 'service' | 'odometer' | 'note') {
		menuOpen = false;
		activeForm = kind;
		if (kind === 'odometer') {
			odoValue = String(data.vehicle.current_odometer);
			odoDirty = false;
		}
	}

	function getOdoWarning(inputVal: string, currentVal: number): string | undefined {
		const num = Number(inputVal);
		if (!Number.isInteger(num) || num < 0) return undefined;
		if (num === currentVal)
			return `Je hebt al een stand van ${num} km opslagen in jouw administratie.`;
		if (num < currentVal)
			return `Lager dan de hoogste opgenomen stand (${currentVal} km). Opgeslagen als historisch record.`;
		return undefined;
	}

	// Handle ?quick= param from the mobile FAB quick-add flow
	$effect(() => {
		const quick = $page.url.searchParams.get('quick');
		if (quick === 'service' || quick === 'odometer' || quick === 'note') {
			activeForm = quick;
			const url = new URL($page.url);
			url.searchParams.delete('quick');
			replaceState(url, $page.state);
		}
	});

	// Entry ⋮ menu
	let entryMenu = $state<string | null>(null);
	let editingEntry = $state<{ id: string; kind: 'service' | 'odometer' | 'note' } | null>(null);
	let editSubmitting = $state(false);
	let deletingEntry = $state<{
		id: string;
		kind: 'service' | 'odometer' | 'note' | 'finance';
	} | null>(null);

	function toggleEntryMenu(id: string) {
		entryMenu = entryMenu === id ? null : id;
	}
	function startEdit(id: string, kind: 'service' | 'odometer' | 'note') {
		editingEntry = { id, kind };
		entryMenu = null;
		editAttachFile = null;
		editAttachType = 'service';
		editShowLink = false;
	}

	$effect(() => {
		if (form?.logged || form?.odoUpdated || form?.noteLogged) {
			activeForm = null;
			menuOpen = false;
			attachFile = null;
			showLinkNew = false;
			newLinkedDocIds = new Set();
		}
		if ((form as any)?.editedLog || (form as any)?.deletedLog) {
			editingEntry = null;
			entryMenu = null;
		}
		if ((form as any)?.attachUploaded) {
			editAttachFile = null;
			editUploading = false;
		}
		if ((form as any)?.linked) {
			editShowLink = false;
		}
	});

	// Upcoming trackers
	type Tracker = (typeof data.trackers)[number];
	const upcoming = $derived(
		data.trackers
			.filter((t: Tracker) => t.status === 'due' || t.status === 'overdue')
			.sort((a: Tracker, b: Tracker) => {
				if (a.status === 'overdue' && b.status !== 'overdue') return -1;
				if (b.status === 'overdue' && a.status !== 'overdue') return 1;
				return 0;
			})
	);

	function kmOverdue(t: (typeof data.trackers)[0]): number | null {
		if (t.next_due_odometer === null) return null;
		const diff = data.vehicle.current_odometer - t.next_due_odometer;
		return diff > 0 ? diff : null;
	}
	function kmRemaining(t: (typeof data.trackers)[0]): number | null {
		if (t.next_due_odometer === null) return null;
		const diff = t.next_due_odometer - data.vehicle.current_odometer;
		return diff > 0 ? diff : null;
	}

	// Timeline filter state — persisted to page_prefs.timeline
	let filters = $state({
		service: untrack(() => data.timelinePrefs?.showService ?? true),
		odometer: untrack(() => data.timelinePrefs?.showOdometer ?? true),
		note: untrack(() => data.timelinePrefs?.showNotes ?? true),
		travel: untrack(() => data.timelinePrefs?.showTravel ?? true),
		finance: untrack(() => data.timelinePrefs?.showFinance ?? false)
	});

	let filterOpen = $state(false);

	const filtersNonDefault = $derived(
		!filters.service || !filters.odometer || !filters.note || !filters.travel || filters.finance
	);

	let _prefTimer: ReturnType<typeof setTimeout>;
	let _pendingTimelinePrefs: object | null = null;
	let _prefFirstRun = true;

	function flushTimelinePrefs() {
		if (!_pendingTimelinePrefs) return;
		const body = JSON.stringify({ page_prefs: { timeline: _pendingTimelinePrefs } });
		_pendingTimelinePrefs = null;
		clearTimeout(_prefTimer);
		fetch('/api/prefs', {
			method: 'PATCH',
			keepalive: true,
			headers: { 'content-type': 'application/json' },
			body
		});
	}

	beforeNavigate(() => flushTimelinePrefs());

	$effect(() => {
		window.addEventListener('beforeunload', flushTimelinePrefs);
		return () => window.removeEventListener('beforeunload', flushTimelinePrefs);
	});

	$effect(() => {
		const service = filters.service;
		const odometer = filters.odometer;
		const note = filters.note;
		const travel = filters.travel;
		const finance = filters.finance;
		if (_prefFirstRun) {
			_prefFirstRun = false;
			return;
		}
		_pendingTimelinePrefs = {
			showService: service,
			showOdometer: odometer,
			showNotes: note,
			showTravel: travel,
			showFinance: finance
		};
		clearTimeout(_prefTimer);
		_prefTimer = setTimeout(flushTimelinePrefs, 600);
	});

	// Combined timeline (newest first)
	type Entry =
		| { kind: 'service'; date: string; odometer: number; log: (typeof data.logs)[0] }
		| { kind: 'odometer'; date: string; odometer: number; log: (typeof data.odoLogs)[0] }
		| { kind: 'note'; date: string; odometer: number; log: (typeof data.odoLogs)[0] }
		| { kind: 'travel'; date: string; travel: (typeof data.travelEntries)[0] }
		| { kind: 'finance'; date: string; tx: (typeof data.financeEntries)[0] };

	const allEntries = $derived((): Entry[] => {
		const entries: Entry[] = [];
		if (filters.service) {
			entries.push(
				...data.logs.map((log: (typeof data.logs)[number]) => ({
					kind: 'service' as const,
					date: log.performed_at,
					odometer: log.odometer_at_service,
					log
				}))
			);
		}
		entries.push(
			...(data.odoLogs
				.map((log: (typeof data.odoLogs)[number]) => {
					if (log.kind === 'note') {
						return filters.note
							? { kind: 'note' as const, date: log.recorded_at, odometer: log.odometer, log }
							: null;
					}
					return filters.odometer
						? { kind: 'odometer' as const, date: log.recorded_at, odometer: log.odometer, log }
						: null;
				})
				.filter(Boolean) as Entry[])
		);
		if (filters.travel) {
			entries.push(
				...data.travelEntries.map((t: (typeof data.travelEntries)[number]) => ({
					kind: 'travel' as const,
					date: t.start_date,
					travel: t
				}))
			);
		}
		if (filters.finance) {
			entries.push(
				...data.financeEntries.map((tx: (typeof data.financeEntries)[number]) => ({
					kind: 'finance' as const,
					date: tx.performed_at,
					tx
				}))
			);
		}
		return entries.sort((a, b) => {
			const dateCmp = b.date.localeCompare(a.date);
			if (dateCmp !== 0) return dateCmp;
			const aCreated =
				'log' in a
					? a.log.created_at
					: 'travel' in a
						? a.travel.created_at
						: 'tx' in a
							? a.tx.created_at
							: '';
			const bCreated =
				'log' in b
					? b.log.created_at
					: 'travel' in b
						? b.travel.created_at
						: 'tx' in b
							? b.tx.created_at
							: '';
			return bCreated.localeCompare(aCreated);
		});
	});

	const grouped = $derived((): [string, Entry[]][] => {
		const map = new Map<string, Entry[]>();
		// allEntries is already sorted by date desc, created_at desc
		// Just group by month, preserving that order
		for (const e of allEntries()) {
			const key = e.date.slice(0, 7);
			if (!map.has(key)) map.set(key, []);
			map.get(key)!.push(e);
		}
		// Convert to array - Map preserves insertion order (which is already sorted)
		return [...map.entries()];
	});

	const hasHistory = $derived(
		data.logs.length > 0 || data.odoLogs.length > 0 || data.travelEntries.length > 0
	);

	// Odometer collapse state - per month
	const COLLAPSE_THRESHOLD = 3;
	let expandedMonths = $state<Set<string>>(new Set());

	function toggleMonth(ym: string) {
		const newSet = new Set(expandedMonths);
		if (newSet.has(ym)) {
			newSet.delete(ym);
		} else {
			newSet.add(ym);
		}
		expandedMonths = newSet;
	}

	// Get entries to display for a month (handles collapse)
	function getDisplayEntries(entries: Entry[], ym: string): Entry[] {
		const odoEntries = entries.filter((e) => e.kind === 'odometer');

		if (odoEntries.length <= COLLAPSE_THRESHOLD) {
			// Return entries in chronological order (already sorted)
			return entries;
		}

		const isExpanded = expandedMonths.has(ym);
		if (isExpanded) {
			return entries;
		}

		// Find which odometer IDs to show (first 3 by date, preserving order)
		const visibleOdoIds = new Set(odoEntries.slice(0, COLLAPSE_THRESHOLD).map((e) => e.log.id));

		// Return all entries but filtered to only show first 3 odometer
		return entries.filter((e) => e.kind !== 'odometer' || visibleOdoIds.has(e.log.id));
	}

	// Count hidden odometer entries per month
	function getHiddenOdoCount(entries: Entry[], ym: string): number {
		const odoEntries = entries.filter((e) => e.kind === 'odometer');
		if (odoEntries.length <= COLLAPSE_THRESHOLD) return 0;

		const isExpanded = expandedMonths.has(ym);
		return isExpanded ? 0 : odoEntries.length - COLLAPSE_THRESHOLD;
	}

	// Helpers for edit form initial values
	function serviceLogById(id: string) {
		return data.logs.find((l: (typeof data.logs)[number]) => l.id === id);
	}
	function odoLogById(id: string) {
		return data.odoLogs.find((l: (typeof data.odoLogs)[number]) => l.id === id);
	}

	// Attachment state
	let attachFile = $state<File | null>(null);
	let attachType = $state('service');
	let showLinkNew = $state(false);
	let newLinkedDocIds = $state(new Set<string>());

	const docTypeEntries = Object.entries({
		service: 'documents.types.service',
		quotation: 'documents.types.quotation',
		papers: 'documents.types.papers',
		photo: 'documents.types.photo',
		notes: 'documents.types.notes',
		other: 'documents.types.other'
	});

	function handleAttachPick(e: Event) {
		const input = e.target as HTMLInputElement;
		attachFile = input.files?.[0] ?? null;
	}
	function clearAttach() {
		attachFile = null;
	}
	function toggleNewLink(id: string) {
		const next = new Set(newLinkedDocIds);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		newLinkedDocIds = next;
	}

	// Attachment state — edit service log form
	let editAttachFile = $state<File | null>(null);
	let editAttachType = $state('service');
	let editShowLink = $state(false);
	let editUploading = $state(false);

	function handleEditAttachPick(e: Event) {
		const input = e.target as HTMLInputElement;
		editAttachFile = input.files?.[0] ?? null;
	}
	function clearEditAttach() {
		editAttachFile = null;
	}

	// Document helpers
	const docMap = $derived(
		new Map((data.allDocs ?? []).map((d: (typeof data.allDocs)[number]) => [d.id, d]))
	);
	function resolvedAttachments(log: (typeof data.logs)[number]) {
		const ids: string[] = (log.attachments as string[]) ?? [];
		return ids.map((id) => docMap.get(id)).filter(Boolean) as (typeof data.allDocs)[number][];
	}
	function unlinkedDocs(log: (typeof data.logs)[number]) {
		const ids = new Set<string>((log.attachments as string[]) ?? []);
		return (data.allDocs ?? []).filter((d: (typeof data.allDocs)[number]) => !ids.has(d.id));
	}
</script>

<svelte:head><title>{data.vehicle.name} · {$_('layout.brand')}</title></svelte:head>

<div class="page-header">
	<div class="page-header-text">
		<h2 class="section-title">{$_('vehicle.detail.timeline.title')}</h2>
		<p class="section-sub">
			{#if data.logs.length === 0 && data.odoLogs.length === 0}
				{$_('vehicle.detail.timeline.empty.description')}
			{:else}
				{$_('vehicle.detail.timeline.subtitle', { values: { name: data.vehicle.name } })}
			{/if}
		</p>
	</div>
	<div class="page-actions">
		{#if activeForm && !isMobile}
			<button class="btn-ghost" onclick={() => (activeForm = null)}>
				{$_('common.cancel')}
			</button>
		{:else}
			<!-- Filter button -->
			<div class="filter-wrap">
				<button
					class="btn-ghost btn-icon"
					class:btn-icon--active={filtersNonDefault}
					onclick={() => (filterOpen = !filterOpen)}
					aria-label="Filter entries"
					aria-expanded={filterOpen}
				>
					<svg
						width="15"
						height="15"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
						aria-hidden="true"
					>
						<line x1="4" y1="21" x2="4" y2="14" />
						<line x1="4" y1="10" x2="4" y2="3" />
						<line x1="12" y1="21" x2="12" y2="12" />
						<line x1="12" y1="8" x2="12" y2="3" />
						<line x1="20" y1="21" x2="20" y2="16" />
						<line x1="20" y1="12" x2="20" y2="3" />
						<line x1="1" y1="14" x2="7" y2="14" />
						<line x1="9" y1="8" x2="15" y2="8" />
						<line x1="17" y1="16" x2="23" y2="16" />
					</svg>
					{#if filtersNonDefault}
						<span class="filter-active-dot" aria-hidden="true"></span>
					{/if}
				</button>
				{#if filterOpen}
					<div
						class="add-menu-backdrop"
						role="presentation"
						onclick={() => (filterOpen = false)}
					></div>
					<div class="filter-dropdown">
						<button
							class="filter-row"
							role="checkbox"
							aria-checked={filters.service}
							onclick={() => (filters.service = !filters.service)}
						>
							<span class="filter-check" class:filter-check--on={filters.service}>
								{#if filters.service}<svg
										width="9"
										height="9"
										viewBox="0 0 12 12"
										fill="none"
										stroke="currentColor"
										stroke-width="2.5"
										stroke-linecap="round"
										stroke-linejoin="round"
										aria-hidden="true"><polyline points="1.5 6.5 4.5 9.5 10.5 2.5" /></svg
									>{/if}
							</span>
							<span class="filter-label">{$_('vehicle.detail.timeline.filter.service')}</span>
						</button>
						<button
							class="filter-row"
							role="checkbox"
							aria-checked={filters.odometer}
							onclick={() => (filters.odometer = !filters.odometer)}
						>
							<span class="filter-check" class:filter-check--on={filters.odometer}>
								{#if filters.odometer}<svg
										width="9"
										height="9"
										viewBox="0 0 12 12"
										fill="none"
										stroke="currentColor"
										stroke-width="2.5"
										stroke-linecap="round"
										stroke-linejoin="round"
										aria-hidden="true"><polyline points="1.5 6.5 4.5 9.5 10.5 2.5" /></svg
									>{/if}
							</span>
							<span class="filter-label">{$_('vehicle.detail.timeline.filter.odometer')}</span>
						</button>
						<button
							class="filter-row"
							role="checkbox"
							aria-checked={filters.note}
							onclick={() => (filters.note = !filters.note)}
						>
							<span class="filter-check" class:filter-check--on={filters.note}>
								{#if filters.note}<svg
										width="9"
										height="9"
										viewBox="0 0 12 12"
										fill="none"
										stroke="currentColor"
										stroke-width="2.5"
										stroke-linecap="round"
										stroke-linejoin="round"
										aria-hidden="true"><polyline points="1.5 6.5 4.5 9.5 10.5 2.5" /></svg
									>{/if}
							</span>
							<span class="filter-label">{$_('vehicle.detail.timeline.filter.notes')}</span>
						</button>
						<button
							class="filter-row"
							role="checkbox"
							aria-checked={filters.travel}
							onclick={() => (filters.travel = !filters.travel)}
						>
							<span class="filter-check" class:filter-check--on={filters.travel}>
								{#if filters.travel}<svg
										width="9"
										height="9"
										viewBox="0 0 12 12"
										fill="none"
										stroke="currentColor"
										stroke-width="2.5"
										stroke-linecap="round"
										stroke-linejoin="round"
										aria-hidden="true"><polyline points="1.5 6.5 4.5 9.5 10.5 2.5" /></svg
									>{/if}
							</span>
							<span class="filter-label">{$_('vehicle.detail.timeline.filter.travels')}</span>
						</button>
						<div class="filter-divider"></div>
						<button
							class="filter-row"
							role="checkbox"
							aria-checked={filters.finance}
							onclick={() => (filters.finance = !filters.finance)}
						>
							<span class="filter-check" class:filter-check--on={filters.finance}>
								{#if filters.finance}<svg
										width="9"
										height="9"
										viewBox="0 0 12 12"
										fill="none"
										stroke="currentColor"
										stroke-width="2.5"
										stroke-linecap="round"
										stroke-linejoin="round"
										aria-hidden="true"><polyline points="1.5 6.5 4.5 9.5 10.5 2.5" /></svg
									>{/if}
							</span>
							<span class="filter-label">{$_('vehicle.detail.timeline.filter.finance')}</span>
						</button>
					</div>
				{/if}
			</div>

			<button
				class="btn-primary"
				onclick={() => (isMobile ? quickAdd.open(data.vehicle.id) : (menuOpen = !menuOpen))}
			>
				+ {$_('common.add')}
			</button>
			{#if !isMobile && menuOpen}
				<div class="add-menu-backdrop" role="presentation" onclick={() => (menuOpen = false)}></div>
				<div class="add-menu-dropdown">
					<button class="add-menu-item" onclick={() => openForm('service')}>
						<span>{$_('layout.addEntry.maintenance')}</span>
						<span class="add-menu-desc">{$_('layout.addEntry.maintenanceDesc')}</span>
					</button>
					<button class="add-menu-item" onclick={() => openForm('odometer')}>
						<span>{$_('layout.addEntry.mileage')}</span>
						<span class="add-menu-desc">{$_('layout.addEntry.mileageDesc')}</span>
					</button>
					<button class="add-menu-item" onclick={() => openForm('note')}>
						<span>{$_('vehicle.forms.writeNote')}</span>
						<span class="add-menu-desc">{$_('vehicle.forms.noteDesc')}</span>
					</button>
					{#if filters.finance}
						<div class="add-menu-divider"></div>
						<a
							class="add-menu-item"
							href="/vehicles/{data.vehicle.id}/finance?quick=finance"
							onclick={() => (menuOpen = false)}
						>
							<span>{$_('layout.addEntry.finance')}</span>
							<span class="add-menu-desc">{$_('layout.addEntry.financeDesc')}</span>
						</a>
					{/if}
				</div>
			{/if}
		{/if}
	</div>
</div>

<div class="page-content">
	{#if activeForm === 'service'}
		<form
			method="POST"
			action="?/logService"
			enctype="multipart/form-data"
			class="inline-form"
			use:enhance={({ formData }) => {
				if (attachFile) formData.set('attachment_file', attachFile);
				for (const id of newLinkedDocIds) formData.append('linked_doc_id', id);
				submitting = true;
				return async ({ update }) => {
					await update();
					submitting = false;
					attachType = 'service';
				};
			}}
		>
			<div class="inline-form-title">{$_('vehicle.forms.logService')}</div>
			{#if (form as any)?.error}
				<div class="form-err">{(form as any).error}</div>
			{/if}
			<div class="form-row">
				<label class="field">
					<span class="field-label">{$_('vehicle.forms.fields.date')}</span>
					<input type="date" name="performed_at" value={today} class="input" required />
				</label>
				<label class="field">
					<span class="field-label"
						>{$_('vehicle.forms.fields.odometer', { values: { unit } })}</span
					>
					<input
						type="number"
						name="odometer_at_service"
						value={data.vehicle.current_odometer}
						min="0"
						class="input mono"
						required
					/>
				</label>
			</div>
			{#if data.trackers.length > 0}
				<fieldset class="tracker-select">
					<legend class="field-label"
						>{$_('vehicle.forms.fields.resetCycle', {
							values: { optional: $_('vehicle.forms.fields.checkToReset') }
						})}</legend
					>
					<div class="tracker-checkboxes">
						{#each data.trackers as t}
							<label class="tracker-checkbox">
								<input type="checkbox" name="reset_trackers" value={t.id} />
								<span class="tracker-check-label">
									<span class="tracker-check-name">{t.template.name}</span>
									{#if t.status === 'due'}
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
					placeholder={$_('vehicle.forms.placeholders.description')}
					maxlength="200"
					class="input"
				/>
			</label>
			<label class="field">
				<span class="field-label"
					>{$_('vehicle.forms.fields.remark', {
						values: { optional: $_('common.optional') }
					})}</span
				>
				<input
					type="text"
					name="remark"
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
								aria-label="Remove">×</button
							>
						</span>
						<select name="attachment_type" class="input attach-type" bind:value={attachType}>
							{#each docTypeEntries as [val, key]}
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
					<button
						type="button"
						class="attach-action-btn"
						onclick={() => (showLinkNew = !showLinkNew)}
					>
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
						{#if (data.allDocs ?? []).length === 0}
							<p class="link-picker-empty">{$_('vehicle.forms.attachments.noDocuments')}</p>
						{:else}
							<ul class="link-picker-list">
								{#each data.allDocs as doc}
									<li>
										<label class="link-picker-item link-picker-item--check">
											<input
												type="checkbox"
												checked={newLinkedDocIds.has(doc.id)}
												onchange={() => toggleNewLink(doc.id)}
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
						{#each [...newLinkedDocIds] as id}
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
										onclick={() => toggleNewLink(id)}
										aria-label="Remove">×</button
									>
								</span>
							{/if}
						{/each}
					</div>
				{/if}
			</div>

			<div class="form-actions">
				<button type="submit" class="btn-primary" disabled={submitting}
					>{submitting ? $_('common.saving') : $_('vehicle.forms.submit.service')}</button
				>
				<button type="button" class="btn-ghost" onclick={() => (activeForm = null)}
					>{$_('common.cancel')}</button
				>
			</div>
		</form>
	{/if}

	{#if activeForm === 'odometer'}
		<form
			method="POST"
			action="?/updateOdometer"
			class="inline-form"
			use:enhance={() => {
				submitting = true;
				return async ({ update }) => {
					await update();
					submitting = false;
				};
			}}
		>
			<div class="inline-form-title">{$_('vehicle.forms.updateOdo')}</div>
			{#if (form as any)?.odoError}
				<div class="form-err">{(form as any).odoError}</div>
			{/if}
			{#if activeForm === 'odometer' && odoDirty && getOdoWarning(odoValue, data.vehicle.current_odometer)}
				<div class="form-warning">{getOdoWarning(odoValue, data.vehicle.current_odometer)}</div>
			{/if}
			<div class="form-row">
				<label class="field">
					<span class="field-label"
						>{$_('vehicle.forms.fields.currentReading', { values: { unit } })}</span
					>
					<input
						type="number"
						name="odometer"
						bind:value={odoValue}
						oninput={() => (odoDirty = true)}
						min="0"
						class="input mono"
						required
					/>
				</label>
				<label class="field">
					<span class="field-label">{$_('vehicle.forms.fields.date')}</span>
					<input type="date" name="recorded_at" value={today} class="input" />
				</label>
			</div>
			<label class="field">
				<span class="field-label"
					>{$_('vehicle.forms.fields.remark', {
						values: { optional: $_('common.optional') }
					})}</span
				>
				<input
					type="text"
					name="remark"
					placeholder={$_('vehicle.forms.placeholders.beforeTrip')}
					maxlength="200"
					class="input"
				/>
			</label>
			<div class="form-actions">
				<button type="submit" class="btn-primary" disabled={submitting}
					>{submitting ? $_('common.saving') : $_('vehicle.forms.submit.odometer')}</button
				>
				<button type="button" class="btn-ghost" onclick={() => (activeForm = null)}
					>{$_('common.cancel')}</button
				>
			</div>
		</form>
	{/if}

	{#if activeForm === 'note'}
		<form
			method="POST"
			action="?/logNote"
			class="inline-form"
			use:enhance={() => {
				submitting = true;
				return async ({ update }) => {
					await update();
					submitting = false;
				};
			}}
		>
			<div class="inline-form-title">{$_('vehicle.forms.writeNote')}</div>
			{#if (form as any)?.warning}
				<div class="form-warning">{(form as any).warning}</div>
			{/if}
			<div class="form-row">
				<label class="field">
					<span class="field-label">{$_('vehicle.forms.fields.date')}</span>
					<input type="date" name="recorded_at" value={today} class="input" />
				</label>
			</div>
			<label class="field">
				<span class="field-label">{$_('vehicle.forms.fields.notes')}</span>
				<input
					type="text"
					name="remark"
					placeholder={$_('vehicle.forms.placeholders.note')}
					maxlength="400"
					class="input"
				/>
			</label>
			<div class="form-actions">
				<button type="submit" class="btn-primary" disabled={submitting}
					>{submitting ? $_('common.saving') : $_('vehicle.forms.submit.note')}</button
				>
				<button type="button" class="btn-ghost" onclick={() => (activeForm = null)}
					>{$_('common.cancel')}</button
				>
			</div>
		</form>
	{/if}

	<!-- Upcoming section -->
	{#if upcoming.length > 0}
		<section class="upcoming-section">
			<div class="section-label-row">
				<span class="section-label">{$_('vehicle.detail.upcoming')}</span>
			</div>
			<div class="upcoming-list">
				{#each upcoming as t}
					{@const over = kmOverdue(t)}
					{@const rem = kmRemaining(t)}
					<div
						class="upcoming-card"
						class:upcoming-card--overdue={t.status === 'overdue'}
						class:upcoming-card--due={t.status === 'due'}
					>
						<div class="upcoming-body">
							<div class="upcoming-name">{t.template.name}</div>
							<div class="upcoming-detail">
								{#if t.status === 'overdue'}
									{#if over !== null}
										{$_('vehicle.detail.overdueByKm', {
											values: { km: formatNumber(over, locale), unit }
										})}
									{:else if t.next_due_at && t.next_due_at < today}
										{$_('vehicle.detail.overdueSince', {
											values: { date: formatDateShort(t.next_due_at, locale) }
										})}
									{:else}
										{$_('vehicle.detail.overdue')}
									{/if}
									{#if !t.last_done_at && !t.last_done_odometer}
										· {$_('vehicle.detail.neverServiced')}
									{/if}
								{:else if rem !== null}
									{$_('vehicle.detail.dueInKm', {
										values: { km: formatNumber(rem, locale), unit }
									})}
								{:else if t.next_due_at}
									{$_('vehicle.detail.dueDate', {
										values: { date: formatDateShort(t.next_due_at, locale) }
									})}
								{:else}
									{$_('vehicle.detail.dueSoon')}
								{/if}
							</div>
							{#if t.next_due_odometer !== null}
								<div class="upcoming-target">
									{$_('vehicle.detail.nextDueOdo', {
										values: { reading: formatNumber(t.next_due_odometer, locale), unit }
									})}
									{#if t.next_due_at}
										· {formatDateShort(t.next_due_at, locale)}{/if}
								</div>
							{:else if t.next_due_at}
								<div class="upcoming-target">
									{$_('vehicle.detail.nextDue', {
										values: { date: formatDateShort(t.next_due_at, locale) }
									})}
								</div>
							{/if}
						</div>
						<a href="/vehicles/{data.vehicle.id}/maintenance?log={t.id}" class="upcoming-log-link"
							>{$_('vehicle.detail.logLink')}</a
						>
					</div>
				{/each}
			</div>
		</section>
	{/if}

	<!-- Timeline -->
	{#if !hasHistory}
		<EmptyState
			icon="📋"
			title={$_('vehicle.detail.timeline.empty.title')}
			description={$_('vehicle.detail.timeline.empty.description')}
		/>
	{:else}
		<!-- Single backdrop for all entry menus -->
		{#if entryMenu !== null}
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div class="entry-backdrop" onclick={() => (entryMenu = null)} onkeydown={() => {}}></div>
		{/if}

		<div class="timeline">
			{#each grouped() as [ym, entries]}
				{@const displayEntries = getDisplayEntries(entries, ym)}
				{@const hiddenCount = getHiddenOdoCount(entries, ym)}
				<div class="month-group">
					<div class="month-divider">
						<span class="month-label">{formatYearMonth(ym, locale)}</span>
						<span class="month-rule" aria-hidden="true"></span>
					</div>

					{#each displayEntries as entry}
						{#if entry.kind === 'service'}
							{@const log = entry.log}
							{@const attached = resolvedAttachments(log)}
							<div class="timeline-entry">
								<div class="entry-icon" title="Service" aria-hidden="true"></div>
								<div class="entry-body">
									<div class="entry-title">
										{log.notes?.split('\n')[0] ?? $_('vehicle.detail.serviceEntry')}
										{#if log.notes && log.notes.includes('\n')}<span class="entry-note">
												· {log.notes.split('\n').slice(1).join(' ')}</span
											>{/if}
									</div>
									<div class="entry-meta">
										<span class="mono">{formatNumber(log.odometer_at_service, locale)} {unit}</span>
										{#if log.cost_cents}
											<span class="sep">·</span>
											<span class="mono cost"
												>{formatCurrency(log.cost_cents, log.currency, locale)}</span
											>
										{/if}
										{#if log.remark}
											<span class="sep">·</span>
											<span class="odo-note">{log.remark}</span>
										{/if}
									</div>
									{#if attached.length > 0}
										<div class="entry-attachments">
											{#each attached as doc}
												<a
													href="/vehicles/{data.vehicle.id}/documents?highlight={doc.id}"
													class="doc-chip doc-chip--link"
													title={$_('vehicle.forms.viewDocument')}
												>
													<span class="doc-chip-type">{$_('documents.types.' + doc.doc_type)}</span>
													<span class="doc-chip-name"
														>{doc.name.length > 24 ? doc.name.slice(0, 24) + '…' : doc.name}</span
													>
												</a>
											{/each}
										</div>
									{/if}
								</div>
								<span class="entry-date">{formatDateShort(log.performed_at, locale)}</span>
								<div class="entry-actions" class:entry-actions--open={entryMenu === log.id}>
									<button
										class="entry-menu-btn"
										class:active={entryMenu === log.id}
										onclick={() => toggleEntryMenu(log.id)}
										aria-label="Entry options"
										aria-haspopup="true">⋮</button
									>
									{#if entryMenu === log.id}
										<div class="entry-menu-dropdown" role="menu">
											<button
												role="menuitem"
												class="entry-menu-item"
												onclick={() => startEdit(log.id, 'service')}>{$_('common.edit')}</button
											>
											<button
												role="menuitem"
												class="entry-menu-item entry-menu-item--danger"
												onclick={() => {
													deletingEntry = { id: log.id, kind: 'service' };
													entryMenu = null;
												}}>{$_('common.delete')}</button
											>
										</div>
									{/if}
								</div>
							</div>

							{#if editingEntry?.id === log.id}
								{@const editLog = serviceLogById(log.id)}
								{@const currentAttached = resolvedAttachments(log)}
								<div class="entry-edit-card">
									<form
										method="POST"
										action="?/editServiceLog"
										class="entry-edit-form"
										use:enhance={() => {
											editSubmitting = true;
											return async ({ update }) => {
												await update();
												editSubmitting = false;
											};
										}}
									>
										{#if (form as any)?.editError}
											<div class="form-err">{(form as any).editError}</div>
										{/if}
										<input type="hidden" name="id" value={log.id} />
										<div class="form-row">
											<label class="field">
												<span class="field-label">{$_('vehicle.forms.fields.date')}</span>
												<input
													type="date"
													name="performed_at"
													value={editLog?.performed_at ?? today}
													class="input"
													required
												/>
											</label>
											<label class="field">
												<span class="field-label"
													>{$_('vehicle.forms.fields.odometer', { values: { unit } })}</span
												>
												<input
													type="number"
													name="odometer_at_service"
													value={editLog?.odometer_at_service}
													min="0"
													class="input mono"
													required
												/>
											</label>
										</div>
										{#if editLog?.tracker_id}
											<fieldset class="tracker-select">
												<legend class="field-label">{$_('vehicle.forms.fields.usedTracker')}</legend
												>
												<div class="tracker-checkboxes">
													{#each data.trackers.filter((t) => editLog?.tracker_id === t.id) as t}
														<label class="tracker-checkbox">
															<input
																type="checkbox"
																name="reset_trackers"
																value={t.id}
																checked={true}
																disabled
															/>
															<span class="tracker-check-label">
																<span class="tracker-check-name">{t.template.name}</span>
																{#if t.status === 'due'}
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
												value={editLog?.notes ?? ''}
												maxlength="200"
												class="input"
											/>
										</label>
										<label class="field">
											<span class="field-label"
												>{$_('vehicle.forms.fields.remark', {
													values: { optional: $_('common.optional') }
												})}</span
											>
											<input
												type="text"
												name="remark"
												value={editLog?.remark ?? ''}
												placeholder={$_('vehicle.forms.placeholders.additionalDetails')}
												maxlength="200"
												class="input"
											/>
										</label>
										<label class="field">
											<span class="field-label"
												>{$_('vehicle.forms.fields.cost', {
													values: { optional: $_('common.optional') }
												})}</span
											>
											<input
												type="number"
												name="cost"
												value={editLog?.cost_cents ? editLog.cost_cents / 100 : ''}
												min="0"
												step="0.01"
												placeholder={$_('vehicle.forms.placeholders.cost')}
												class="input mono"
											/>
										</label>
										<div class="form-actions">
											<button type="submit" class="btn-primary" disabled={editSubmitting}
												>{editSubmitting ? $_('common.saving') : $_('common.save')}</button
											>
											<button type="button" class="btn-ghost" onclick={() => (editingEntry = null)}
												>{$_('common.cancel')}</button
											>
										</div>
									</form>

									<!-- Attachment management inside same card, using separate form actions -->
									<div class="edit-attachments">
										<span class="field-label"
											>{$_('vehicle.forms.fields.attachments', {
												values: { optional: $_('common.optional') }
											})}</span
										>
										{#if currentAttached.length > 0}
											<div class="attach-chips">
												{#each currentAttached as doc}
													<span class="doc-chip">
														<span class="doc-chip-type"
															>{$_('documents.types.' + doc.doc_type)}</span
														>
														<span class="doc-chip-name"
															>{doc.name.length > 24 ? doc.name.slice(0, 24) + '…' : doc.name}</span
														>
														<form method="POST" action="?/unlinkDocument" use:enhance>
															<input type="hidden" name="service_log_id" value={log.id} />
															<input type="hidden" name="document_id" value={doc.id} />
															<button type="submit" class="doc-chip-remove" aria-label="Remove"
																>×</button
															>
														</form>
													</span>
												{/each}
											</div>
										{/if}
										<div class="attach-actions">
											<form
												method="POST"
												action="?/uploadToLog"
												enctype="multipart/form-data"
												use:enhance={({ formData }) => {
													if (editAttachFile) formData.set('file', editAttachFile);
													editUploading = true;
													return async ({ update }) => {
														await update();
														editUploading = false;
													};
												}}
											>
												<input type="hidden" name="service_log_id" value={log.id} />
												{#if editAttachFile}
													<span class="doc-chip">
														<span class="doc-chip-name">{editAttachFile.name}</span>
														<button
															type="button"
															class="doc-chip-remove"
															onclick={clearEditAttach}
															aria-label="Remove">×</button
														>
													</span>
													<select
														name="doc_type"
														class="input attach-type"
														bind:value={editAttachType}
													>
														{#each docTypeEntries as [val, key]}
															<option value={val}>{$_(key)}</option>
														{/each}
													</select>
													<button type="submit" class="attach-save" disabled={editUploading}>
														{editUploading
															? $_('vehicle.forms.attachments.uploading')
															: $_('common.save')}
													</button>
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
															onchange={handleEditAttachPick}
														/>
													</label>
												{/if}
											</form>
											<button
												type="button"
												class="attach-action-btn"
												onclick={() => (editShowLink = !editShowLink)}
											>
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
														d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"
													/><path
														d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"
													/></svg
												>
												{$_('vehicle.forms.linkDocument')}
											</button>
										</div>
										{#if editShowLink}
											{@const available = unlinkedDocs(log)}
											<div class="link-picker">
												<div class="link-picker-header">
													<span class="link-picker-title"
														>{$_('vehicle.forms.attachments.pickerTitle')}</span
													>
													<button
														type="button"
														class="link-picker-close"
														onclick={() => (editShowLink = false)}>×</button
													>
												</div>
												{#if available.length === 0}
													<p class="link-picker-empty">
														{$_('vehicle.forms.attachments.noDocuments')}
													</p>
												{:else}
													<ul class="link-picker-list">
														{#each available as doc}
															<li>
																<form method="POST" action="?/linkDocument" use:enhance>
																	<input type="hidden" name="service_log_id" value={log.id} />
																	<input type="hidden" name="document_id" value={doc.id} />
																	<button type="submit" class="link-picker-item">
																		<span class="doc-chip-type"
																			>{$_('documents.types.' + doc.doc_type)}</span
																		>
																		<span class="link-picker-item-name">{doc.name}</span>
																	</button>
																</form>
															</li>
														{/each}
													</ul>
												{/if}
											</div>
										{/if}
									</div>
								</div>
							{/if}
						{:else if entry.kind === 'note'}
							{@const log = entry.log}
							<div class="timeline-entry note-entry">
								<div class="entry-icon" title="Note" aria-hidden="true"></div>
								<div class="entry-body">
									<div class="entry-title note-entry">{log.remark}</div>
								</div>
								<span class="entry-date">{formatDateShort(log.recorded_at, locale)}</span>
								<div class="entry-actions" class:entry-actions--open={entryMenu === log.id}>
									<button
										class="entry-menu-btn"
										class:active={entryMenu === log.id}
										onclick={() => toggleEntryMenu(log.id)}
										aria-label="Entry options"
										aria-haspopup="true">⋮</button
									>
									{#if entryMenu === log.id}
										<div class="entry-menu-dropdown" role="menu">
											<button
												role="menuitem"
												class="entry-menu-item"
												onclick={() => startEdit(log.id, 'note')}>{$_('common.edit')}</button
											>
											<button
												role="menuitem"
												class="entry-menu-item entry-menu-item--danger"
												onclick={() => {
													deletingEntry = { id: log.id, kind: 'odometer' };
													entryMenu = null;
												}}>{$_('common.delete')}</button
											>
										</div>
									{/if}
								</div>
							</div>

							{#if editingEntry?.id === log.id}
								{@const editLog = odoLogById(log.id)}
								<form
									method="POST"
									action="?/editOdometerLog"
									class="entry-edit-form"
									use:enhance={() => {
										editSubmitting = true;
										return async ({ update }) => {
											await update();
											editSubmitting = false;
										};
									}}
								>
									{#if (form as any)?.editError}
										<div class="form-err">{(form as any).editError}</div>
									{/if}
									<input type="hidden" name="id" value={log.id} />
									<div class="form-row">
										<label class="field">
											<span class="field-label">{$_('vehicle.forms.fields.date')}</span>
											<input
												type="date"
												name="recorded_at"
												value={editLog?.recorded_at ?? today}
												class="input"
												required
											/>
										</label>
									</div>
									<label class="field">
										<span class="field-label">{$_('vehicle.forms.fields.notes')}</span>
										<input
											type="text"
											name="remark"
											value={editLog?.remark ?? ''}
											placeholder={$_('vehicle.forms.placeholders.writeNote')}
											maxlength="400"
											class="input"
										/>
									</label>
									<div class="form-actions">
										<button type="submit" class="btn-primary" disabled={editSubmitting}
											>{editSubmitting ? $_('common.saving') : $_('common.save')}</button
										>
										<button type="button" class="btn-ghost" onclick={() => (editingEntry = null)}
											>{$_('common.cancel')}</button
										>
									</div>
								</form>
							{/if}
						{:else if entry.kind === 'travel'}
							{@const t = entry.travel}
							<div class="timeline-entry travel-entry">
								<div class="entry-icon" title="Travel" aria-hidden="true"></div>
								<div class="entry-body">
									<div class="entry-title">{t.title}</div>
									<div class="entry-meta">
										<span class="entry-meta-item"
											>{$_('travels.entry.days', { values: { n: t.duration_days } })}</span
										>
										{#if t.total_expenses_cents != null}
											<span class="entry-meta-sep">·</span>
											<span class="entry-meta-item mono"
												>{formatCurrency(t.total_expenses_cents, t.currency, locale)}</span
											>
										{/if}
									</div>
								</div>
								<span class="entry-date">{formatDateShort(t.start_date, locale)}</span>
								<div class="entry-actions" class:entry-actions--open={entryMenu === t.id}>
									<button
										class="entry-menu-btn"
										class:active={entryMenu === t.id}
										onclick={() => toggleEntryMenu(t.id)}
										aria-label="Entry options"
										aria-haspopup="true">⋮</button
									>
									{#if entryMenu === t.id}
										<div class="entry-menu-dropdown" role="menu">
											<a
												role="menuitem"
												class="entry-menu-item"
												href="/vehicles/{data.vehicle.id}/travels?edit={t.id}"
												>{$_('common.edit')}</a
											>
											<a
												role="menuitem"
												class="entry-menu-item entry-menu-item--danger"
												href="/vehicles/{data.vehicle.id}/travels?delete={t.id}"
												>{$_('common.delete')}</a
											>
										</div>
									{/if}
								</div>
							</div>
						{:else if entry.kind === 'finance'}
							{@const tx = entry.tx}
							<div class="timeline-entry finance-entry">
								<div class="entry-icon" title="Finance" aria-hidden="true"></div>
								<div class="entry-body">
									<div class="entry-title">
										{tx.notes ?? $_(`finance.categories.${tx.category}`)}
									</div>
									<div class="entry-meta">
										<span>{$_(`finance.categories.${tx.category}`)}</span>
										<span class="sep">·</span>
										<span class="mono cost"
											>{formatCurrency(tx.amount_cents, tx.currency, locale)}</span
										>
									</div>
								</div>
								<span class="entry-date">{formatDateShort(tx.performed_at, locale)}</span>
								<div class="entry-actions" class:entry-actions--open={entryMenu === tx.id}>
									<button
										class="entry-menu-btn"
										class:active={entryMenu === tx.id}
										onclick={() => toggleEntryMenu(tx.id)}
										aria-label="Entry options"
										aria-haspopup="true">⋮</button
									>
									{#if entryMenu === tx.id}
										<div class="entry-menu-dropdown" role="menu">
											<a
												role="menuitem"
												class="entry-menu-item"
												href="/vehicles/{data.vehicle.id}/finance?edit={tx.id}"
												onclick={() => (entryMenu = null)}>{$_('common.edit')}</a
											>
											<button
												role="menuitem"
												class="entry-menu-item entry-menu-item--danger"
												onclick={() => {
													deletingEntry = { id: tx.id, kind: 'finance' };
													entryMenu = null;
												}}>{$_('common.delete')}</button
											>
										</div>
									{/if}
								</div>
							</div>
						{:else}
							{@const log = entry.log}
							<div class="timeline-entry odo-entry">
								<div class="entry-icon" title="Mileage" aria-hidden="true"></div>
								<div class="entry-body">
									<div class="entry-title odo-title">
										<span class="mono">{formatNumber(log.odometer, locale)} {unit}</span>
										{#if log.remark}<span class="odo-note"> · {log.remark}</span>{/if}
									</div>
								</div>
								<span class="entry-date">{formatDateShort(log.recorded_at, locale)}</span>
								<div class="entry-actions" class:entry-actions--open={entryMenu === log.id}>
									<button
										class="entry-menu-btn"
										class:active={entryMenu === log.id}
										onclick={() => toggleEntryMenu(log.id)}
										aria-label="Entry options"
										aria-haspopup="true">⋮</button
									>
									{#if entryMenu === log.id}
										<div class="entry-menu-dropdown" role="menu">
											<button
												role="menuitem"
												class="entry-menu-item"
												onclick={() => startEdit(log.id, 'odometer')}>{$_('common.edit')}</button
											>
											<button
												role="menuitem"
												class="entry-menu-item entry-menu-item--danger"
												onclick={() => {
													deletingEntry = { id: log.id, kind: 'odometer' };
													entryMenu = null;
												}}>{$_('common.delete')}</button
											>
										</div>
									{/if}
								</div>
							</div>

							{#if editingEntry?.id === log.id}
								{@const editLog = odoLogById(log.id)}
								<form
									method="POST"
									action="?/editOdometerLog"
									class="entry-edit-form"
									use:enhance={() => {
										editSubmitting = true;
										return async ({ update }) => {
											await update();
											editSubmitting = false;
										};
									}}
								>
									{#if (form as any)?.editError}
										<div class="form-err">{(form as any).editError}</div>
									{/if}
									<input type="hidden" name="id" value={log.id} />
									<div class="form-row">
										<label class="field">
											<span class="field-label"
												>{$_('vehicle.forms.fields.odometer', { values: { unit } })}</span
											>
											<input
												type="number"
												name="odometer"
												value={editLog?.odometer}
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
												value={editLog?.recorded_at ?? today}
												class="input"
												required
											/>
										</label>
									</div>
									<label class="field">
										<span class="field-label"
											>{$_('vehicle.forms.fields.remark', {
												values: { optional: $_('common.optional') }
											})}
										</span>
										<input
											type="text"
											name="remark"
											value={editLog?.remark ?? ''}
											maxlength="200"
											class="input"
										/>
									</label>
									<div class="form-actions">
										<button type="submit" class="btn-primary" disabled={editSubmitting}
											>{editSubmitting ? $_('common.saving') : $_('common.save')}</button
										>
										<button type="button" class="btn-ghost" onclick={() => (editingEntry = null)}
											>{$_('common.cancel')}</button
										>
									</div>
								</form>
							{/if}
						{/if}
					{/each}

					{#if hiddenCount > 0}
						<button class="collapse-toggle" onclick={() => toggleMonth(ym)}>
							{expandedMonths.has(ym)
								? $_('vehicle.detail.hideOdoReadings')
								: $_('vehicle.detail.showMoreOdoReadings', { values: { n: hiddenCount } })}
						</button>
					{/if}
				</div>
			{/each}
		</div>
	{/if}
</div>

{#if deletingEntry}
	<ConfirmDialog
		open={true}
		title={$_('vehicle.detail.deleteDialog.title')}
		description={$_('vehicle.detail.deleteDialog.description')}
		confirmLabel={$_('vehicle.detail.deleteDialog.confirm')}
		cancelLabel={$_('vehicle.detail.deleteDialog.cancel')}
		danger={true}
		loading={false}
		onconfirm={() => {
			const entry = deletingEntry!;
			const form = document.createElement('form');
			form.method = 'POST';
			form.action =
				entry.kind === 'service'
					? '?/deleteServiceLog'
					: entry.kind === 'finance'
						? '?/deleteFinanceEntry'
						: '?/deleteOdometerLog';
			const input = document.createElement('input');
			input.type = 'hidden';
			input.name = 'id';
			input.value = entry.id;
			form.appendChild(input);
			document.body.appendChild(form);
			form.submit();
		}}
		onclose={() => (deletingEntry = null)}
	/>
{/if}

<style>
	.page-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--space-4);
		flex-wrap: wrap;
		margin-bottom: var(--space-6);
	}
	@media (min-width: 768px) {
		.page-header {
			max-width: 860px;
			margin-left: auto;
			margin-right: auto;
		}
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
	.page-actions {
		display: flex;
		gap: var(--space-2);
		flex-shrink: 0;
		position: relative;
	}

	/* Inline forms */
	.inline-form {
		border: 1px solid var(--border);
		border-radius: 10px;
		background: var(--bg-subtle);
		padding: 1.25rem 1.5rem;
		margin-bottom: var(--space-6);
		display: flex;
		flex-direction: column;
		gap: 1rem;
		animation: slideDown 0.2s ease-out-quart;
	}
	@keyframes slideDown {
		from {
			opacity: 0;
			transform: translateY(-0.5rem);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}
	.inline-form-title {
		font-size: var(--text-base);
		font-weight: 600;
		color: var(--text);
	}
	.form-row {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.75rem;
		padding-top: 0.5rem;
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
		padding: 0.5rem 0.75rem;
		border: 1px solid var(--border-strong);
		border-radius: 10px;
		background: var(--bg);
		color: var(--text);
		font-size: var(--text-md);
		width: 100%;
		font-family: inherit;
	}
	.input:focus {
		outline: 2px solid var(--accent);
		outline-offset: 1px;
		border-color: transparent;
	}
	.mono {
		font-family: var(--font-mono);
		font-variant-numeric: tabular-nums;
	}
	.form-actions {
		display: flex;
		gap: 0.5rem;
		padding-top: 0.25rem;
	}
	.form-err {
		padding: 0.5rem 0.75rem;
		border-radius: 10px;
		font-size: var(--text-sm);
		background: color-mix(in srgb, var(--status-overdue) 8%, transparent);
		border: 1px solid color-mix(in srgb, var(--status-overdue) 25%, transparent);
		color: var(--status-overdue);
	}
	.form-warning {
		padding: 0.5rem 0.75rem;
		border-radius: 10px;
		font-size: var(--text-sm);
		background: color-mix(in srgb, var(--status-due) 8%, transparent);
		border: 1px solid color-mix(in srgb, var(--status-due) 25%, transparent);
		color: var(--status-due);
	}

	/* Tracker checkboxes */
	.tracker-select {
		border: none;
		padding: 0;
		margin: 0;
	}
	.tracker-select legend {
		font-size: var(--text-sm);
		font-weight: 500;
		color: var(--text-muted);
		padding: 0;
		margin-bottom: 0.5rem;
	}
	.tracker-checkboxes {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}
	.tracker-checkbox {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.375rem 0.625rem;
		background: var(--bg-subtle);
		border: 1px solid var(--border);
		border-radius: 6px;
		cursor: pointer;
		font-size: var(--text-sm);
		transition:
			background 0.1s,
			border-color 0.1s;
	}
	.tracker-checkbox:hover {
		background: var(--bg-muted);
		border-color: var(--border-strong);
	}
	.tracker-checkbox input[type='checkbox'] {
		width: 1rem;
		height: 1rem;
		accent-color: var(--accent);
	}
	.tracker-check-label {
		display: flex;
		align-items: center;
		gap: 0.375rem;
	}
	.tracker-check-name {
		color: var(--text);
	}
	.tracker-check-status {
		font-size: var(--text-xs);
		font-weight: 500;
		padding: 0.125rem 0.375rem;
		border-radius: 4px;
	}
	.tracker-check-status--due {
		background: color-mix(in srgb, var(--status-due) 15%, transparent);
		color: var(--status-due);
	}
	.tracker-check-status--overdue {
		background: color-mix(in srgb, var(--status-overdue) 15%, transparent);
		color: var(--status-overdue);
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
	}
	.btn-primary:hover:not(:disabled) {
		background: var(--accent-hover);
	}
	.btn-primary:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}
	.btn-ghost {
		padding: 0.5rem 0.75rem;
		background: transparent;
		color: var(--text-muted);
		border: 1px solid var(--border);
		border-radius: 10px;
		font-size: var(--text-sm);
		font-weight: 500;
		cursor: pointer;
	}
	.btn-ghost:hover {
		background: var(--bg-muted);
		color: var(--text);
	}

	/* Add menu + filter dropdown */
	.page-actions {
		position: relative;
		display: flex;
		gap: 0.5rem;
	}
	/* Icon-only btn-ghost variant */
	.btn-icon {
		padding: 0.5rem;
		min-width: 44px;
		min-height: 44px;
		display: flex;
		align-items: center;
		justify-content: center;
		line-height: 0;
		position: relative;
	}
	.btn-icon--active {
		border-color: var(--accent);
		color: var(--accent);
	}
	.filter-active-dot {
		position: absolute;
		top: 3px;
		right: 3px;
		width: 5px;
		height: 5px;
		border-radius: 50%;
		background: var(--accent);
		border: 1.5px solid var(--bg);
	}

	/* Filter dropdown */
	.filter-wrap {
		position: relative;
		display: flex;
	}
	.filter-dropdown {
		position: absolute;
		right: 0;
		top: calc(100% + 0.375rem);
		background: var(--bg);
		border: 1px solid var(--border-strong);
		border-radius: 8px;
		box-shadow: 0 4px 16px color-mix(in srgb, var(--text) 12%, transparent);
		z-index: 20;
		min-width: 176px;
		padding: 0.375rem;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.filter-row {
		display: flex;
		align-items: center;
		gap: 0.625rem;
		padding: 0.5rem 0.625rem;
		border-radius: 6px;
		cursor: pointer;
		border: none;
		background: none;
		width: 100%;
		text-align: left;
		transition: background 0.1s;
	}
	.filter-row:hover {
		background: var(--bg-muted);
	}
	.filter-check {
		width: 14px;
		height: 14px;
		border-radius: 3px;
		border: 1.5px solid var(--border-strong);
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--bg);
		transition:
			background 0.1s,
			border-color 0.1s;
	}
	.filter-check--on {
		background: var(--accent);
		border-color: var(--accent);
	}
	.filter-label {
		font-size: var(--text-sm);
		font-weight: 500;
		color: var(--text);
	}
	.filter-divider {
		height: 1px;
		background: var(--border);
		margin: 0.25rem 0;
	}

	.add-menu-backdrop {
		position: fixed;
		inset: 0;
		z-index: 10;
	}
	.add-menu-dropdown {
		position: absolute;
		right: 0;
		top: calc(100% + 0.375rem);
		background: var(--bg);
		border: 1px solid var(--border-strong);
		border-radius: 8px;
		box-shadow: 0 4px 16px color-mix(in srgb, var(--text) 12%, transparent);
		z-index: 20;
		min-width: 200px;
		padding: 0.375rem;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.add-menu-item {
		display: flex;
		flex-direction: column;
		padding: 0.625rem 0.75rem;
		border-radius: 10px;
		background: none;
		border: none;
		cursor: pointer;
		text-align: left;
		width: 100%;
		transition: background 0.1s;
	}
	.add-menu-item:hover {
		background: var(--bg-muted);
	}
	.add-menu-divider {
		height: 1px;
		background: var(--border);
		margin: 0.25rem 0;
	}
	.add-menu-item span:first-child {
		font-size: var(--text-sm);
		font-weight: 500;
		color: var(--text);
	}
	.add-menu-desc {
		font-size: var(--text-xs);
		color: var(--text-muted);
		margin-top: 1px;
	}

	/* Upcoming */
	.upcoming-section {
		margin-bottom: var(--space-7);
	}
	.section-label-row {
		margin-bottom: 0.625rem;
	}
	.section-label {
		font-size: var(--text-xs);
		font-weight: 600;
		color: var(--text-subtle);
		text-transform: uppercase;
		letter-spacing: 0.07em;
	}
	.upcoming-list {
		display: flex;
		flex-direction: column;
	}
	.upcoming-card {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.875rem 0.875rem 0.875rem var(--space-3);
		border-bottom: 1px solid var(--border);
		border-left: 3px solid transparent;
	}
	.upcoming-card:first-child {
		border-top: 1px solid var(--border);
	}
	.upcoming-card--overdue {
		border-left-color: var(--status-overdue);
	}
	.upcoming-card--due {
		border-left-color: var(--status-due);
	}

	.upcoming-body {
		flex: 1;
		min-width: 0;
	}
	.upcoming-name {
		font-size: var(--text-base);
		font-weight: 500;
		color: var(--text);
	}
	.upcoming-detail {
		font-size: var(--text-sm);
		margin-top: 0.125rem;
		color: var(--text-muted);
	}
	.upcoming-card--overdue .upcoming-detail {
		color: var(--status-overdue);
	}
	.upcoming-card--due .upcoming-detail {
		color: var(--status-due);
	}
	.upcoming-target {
		font-size: var(--text-xs);
		color: var(--text-subtle);
		margin-top: 0.25rem;
		font-family: var(--font-mono);
		font-variant-numeric: tabular-nums;
	}
	.upcoming-log-link {
		font-size: var(--text-xs);
		font-weight: 500;
		color: var(--text-subtle);
		text-decoration: none;
		white-space: nowrap;
		flex-shrink: 0;
		padding: 0.25rem 0.625rem;
		border-radius: 4px;
		border: 1px solid var(--border);
		transition:
			color 0.1s,
			border-color 0.1s;
	}
	.upcoming-card--overdue .upcoming-log-link {
		color: var(--status-overdue);
		border-color: color-mix(in srgb, var(--status-overdue) 40%, transparent);
	}
	.upcoming-card--due .upcoming-log-link {
		color: var(--status-due);
		border-color: color-mix(in srgb, var(--status-due) 40%, transparent);
	}
	.upcoming-log-link:hover {
		background: var(--bg-muted);
	}

	/* Timeline */
	.entry-backdrop {
		position: fixed;
		inset: 0;
		z-index: 10;
	}
	.timeline {
		display: flex;
		flex-direction: column;
	}
	.month-group {
		margin-bottom: var(--space-6);
	}

	.month-divider {
		display: flex;
		align-items: center;
		gap: 0.875rem;
		padding-bottom: var(--space-2);
		margin-bottom: 0.25rem;
	}
	.month-label {
		font-size: var(--text-xs);
		font-weight: 600;
		color: var(--text-subtle);
		text-transform: uppercase;
		letter-spacing: 0.07em;
		white-space: nowrap;
		flex-shrink: 0;
	}
	.month-rule {
		flex: 1;
		height: 1px;
		background: var(--border);
		display: block;
	}

	.timeline-entry {
		display: flex;
		align-items: flex-start;
		gap: 0.75rem;
		padding: 0.875rem 0;
		border-bottom: 1px solid var(--border);
		position: relative;
	}
	.timeline-entry:first-of-type {
		border-top: 1px solid var(--border);
	}

	.entry-icon {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		flex-shrink: 0;
		background: var(--text-subtle);
		margin-top: 0.45rem;
		transition: transform 0.15s ease-out-quart;
	}
	.travel-entry .entry-icon {
		background: var(--accent);
		opacity: 0.75;
	}
	.finance-entry .entry-icon {
		background: var(--status-ok);
		opacity: 0.75;
	}
	.timeline-entry:hover .entry-icon {
		transform: scale(1.35);
	}
	.timeline-entry:hover {
		background: var(--bg-subtle);
	}

	.entry-body {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
	}
	.entry-title {
		font-size: var(--text-base);
		font-weight: 500;
		color: var(--text);
		line-height: var(--leading-snug);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.entry-date {
		font-size: var(--text-xs);
		color: var(--text-subtle);
		white-space: nowrap;
		flex-shrink: 0;
	}
	.entry-meta {
		display: flex;
		gap: 0.375rem;
		align-items: center;
		flex-wrap: wrap;
	}
	.sep {
		color: var(--text-subtle);
		font-size: var(--text-sm);
	}
	.cost {
		color: var(--status-ok);
	}

	.odo-entry .entry-title {
		font-weight: 400;
		color: var(--text-muted);
	}
	.odo-title .mono {
		color: var(--text-muted);
		font-size: var(--text-sm);
	}
	.odo-note,
	.entry-note {
		font-size: var(--text-sm);
		color: var(--text-subtle);
		font-weight: 400;
	}
	.note-entry {
		font-size: var(--text-sm);
		color: var(--text-muted);
		font-weight: 400;
	}
	/* Entry ⋮ menu */
	.entry-actions {
		position: relative;
		flex-shrink: 0;
		align-self: center;
		z-index: 20;
	}
	.entry-menu-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 36px;
		height: 36px;
		background: none;
		border: 1px solid transparent;
		border-radius: 6px;
		color: var(--text-subtle);
		font-size: 1rem;
		cursor: pointer;
		line-height: 1;
		opacity: 0;
		transition:
			opacity 0.15s ease-out-quart,
			background 0.15s ease-out-quart,
			border-color 0.15s ease-out-quart;
	}
	.timeline-entry:hover .entry-menu-btn,
	.entry-menu-btn:focus,
	.entry-menu-btn.active {
		opacity: 1;
	}
	.entry-menu-btn:hover,
	.entry-menu-btn.active {
		background: var(--bg-muted);
		border-color: var(--border);
		color: var(--text);
	}

	.entry-menu-dropdown {
		position: absolute;
		right: 0;
		top: calc(100% + 2px);
		background: var(--bg);
		border: 1px solid var(--border-strong);
		border-radius: 8px;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
		z-index: 30;
		min-width: 120px;
		padding: 0.25rem;
		display: flex;
		flex-direction: column;
		gap: 1px;
		animation: fadeIn 0.1s ease;
	}
	@keyframes fadeIn {
		from {
			opacity: 0;
			transform: translateY(-2px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}
	.entry-menu-item {
		display: block;
		width: 100%;
		padding: 0.5rem 0.75rem;
		border-radius: 5px;
		background: none;
		border: none;
		cursor: pointer;
		text-align: left;
		font-size: var(--text-sm);
		font-weight: 500;
		color: var(--text);
		transition: background 0.1s;
	}
	.entry-menu-item:hover {
		background: var(--bg-muted);
	}
	.entry-menu-item--danger {
		color: var(--status-overdue);
	}
	.entry-menu-item--danger:hover {
		background: color-mix(in srgb, var(--status-overdue) 8%, transparent);
	}

	/* Inline edit form (appears below entry) */
	.entry-edit-card {
		border: 1px solid var(--border);
		border-radius: 8px;
		background: var(--bg-subtle);
		padding: 1rem 1.25rem;
		margin: 0 0 0 1.25rem;
		display: flex;
		flex-direction: column;
		gap: 0;
	}
	.entry-edit-form {
		display: flex;
		flex-direction: column;
		gap: 0.875rem;
	}

	/* Collapse toggle */
	.collapse-toggle {
		display: inline-block;
		padding: 0.375rem 0.75rem;
		margin-top: 0.25rem;
		font-size: var(--text-xs);
		font-weight: 500;
		color: var(--text-muted);
		background: none;
		border: none;
		cursor: pointer;
		text-align: left;
		border-radius: 4px;
		transition:
			background 0.1s,
			color 0.1s;
	}
	.collapse-toggle:hover {
		background: var(--bg-muted);
		color: var(--text);
	}

	@media (max-width: 480px) {
		.form-row {
			grid-template-columns: 1fr;
		}
		.entry-menu-btn {
			opacity: 1;
			width: 44px;
			height: 44px;
		}
	}
	@media (max-width: 380px) {
		.form-row {
			grid-template-columns: 1fr;
		}
	}

	/* ── Attachment UI (form + timeline) ── */
	.form-attachments {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.attach-actions {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
	}
	.attach-action-btn {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		background: none;
		border: 1px solid var(--border);
		border-radius: 6px;
		cursor: pointer;
		font-size: var(--text-sm);
		color: var(--text-muted);
		padding: 0.25rem 0.5rem;
		line-height: 1;
		transition:
			border-color 0.1s,
			color 0.1s;
	}
	.attach-action-btn:hover {
		border-color: var(--border-strong);
		color: var(--text);
	}
	.attach-file-input {
		display: none;
	}
	.attach-type {
		font-size: var(--text-xs) !important;
		padding: 0.25rem 0.375rem !important;
		width: auto !important;
	}
	.attach-chips {
		display: flex;
		flex-wrap: wrap;
		gap: 0.375rem;
	}
	.attach-save {
		padding: 0.25rem 0.75rem;
		background: var(--accent);
		color: #fff;
		border: none;
		border-radius: 6px;
		font-size: var(--text-xs);
		font-weight: 500;
		cursor: pointer;
	}
	.attach-save:hover:not(:disabled) {
		background: var(--accent-hover);
	}
	.attach-save:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	/* ── Entry attachments (timeline read-only) ── */
	.entry-attachments {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.375rem;
		margin-top: 0.375rem;
	}

	/* ── Edit form attachments (inside entry-edit-card) ── */
	.edit-attachments {
		border-top: 1px solid var(--border);
		margin-top: 0.625rem;
		padding-top: 0.625rem;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.link-picker-item--check {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		cursor: pointer;
	}
	.link-picker-item--check input[type='checkbox'] {
		flex-shrink: 0;
	}
	.doc-chip {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		font-size: var(--text-xs);
		color: var(--text);
		border: 1px solid var(--border);
		border-radius: 6px;
		padding: 2px 6px 2px 4px;
		background: var(--bg);
	}
	.doc-chip-type {
		font-size: 10px;
		font-weight: 500;
		color: var(--text-muted);
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}
	.doc-chip-name {
		color: var(--text);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		max-width: 150px;
	}
	.doc-chip-remove {
		background: none;
		border: none;
		cursor: pointer;
		color: var(--text-subtle);
		padding: 0;
		font-size: 0.85rem;
		line-height: 1;
		flex-shrink: 0;
		margin-left: 1px;
	}
	.doc-chip-remove:hover {
		color: var(--status-overdue);
	}
	.doc-chip--link {
		text-decoration: none;
		transition:
			border-color 0.1s,
			background 0.1s;
	}
	.doc-chip--link:hover {
		border-color: var(--accent);
		background: var(--accent-subtle);
	}
	.doc-chip--link .doc-chip-type,
	.doc-chip--link .doc-chip-name {
		color: inherit;
	}

	/* ── Link picker ── */
	.link-picker {
		margin-top: 0.5rem;
		border: 1px solid var(--border);
		border-radius: 10px;
		background: var(--bg);
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.07);
		overflow: hidden;
		max-width: min(320px, 90vw);
	}
	.link-picker-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.5rem 0.75rem;
		border-bottom: 1px solid var(--border);
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
		color: var(--text-muted);
		font-size: 1rem;
		padding: 0;
		line-height: 1;
	}
	.link-picker-close:hover {
		color: var(--text);
	}
	.link-picker-empty {
		font-size: var(--text-sm);
		color: var(--text-muted);
		padding: 0.75rem;
		margin: 0;
	}
	.link-picker-list {
		list-style: none;
		margin: 0;
		padding: 0.25rem;
		max-height: 200px;
		overflow-y: auto;
	}
	.link-picker-list li {
		margin: 0;
	}
	.link-picker-item {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		width: 100%;
		padding: 0.375rem 0.5rem;
		background: none;
		border: none;
		border-radius: 6px;
		cursor: pointer;
		text-align: left;
		transition: background 0.1s;
	}
	.link-picker-item:hover {
		background: var(--bg-subtle);
	}
	.link-picker-item-name {
		font-size: var(--text-sm);
		color: var(--text);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
</style>
