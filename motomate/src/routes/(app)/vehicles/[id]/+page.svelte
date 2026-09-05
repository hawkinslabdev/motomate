<script lang="ts">
	import { page } from '$app/state';
	import { replaceState, beforeNavigate } from '$app/navigation';
	import { untrack, tick } from 'svelte';
	import type { PageData } from './$types';
	import ConfirmDialog from '$lib/components/ui/ConfirmDialog.svelte';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import { _, waitLocale } from '$lib/i18n';
	import { quickAdd } from '$lib/stores/quickAdd.svelte.js';
	import { sheet } from '$lib/stores/sheet.svelte.js';
	import { createPrefsSync } from '$lib/utils/prefs-sync.js';
	import TransactionForm from '$lib/components/finance/TransactionForm.svelte';
	import NoteForm from '$lib/components/vehicle/NoteForm.svelte';
	import OdometerForm from '$lib/components/vehicle/OdometerForm.svelte';
	import ServiceLogForm from '$lib/components/vehicle/ServiceLogForm.svelte';
	import ServiceLogEditForm from '$lib/components/vehicle/ServiceLogEditForm.svelte';
	import {
		formatDateShort,
		formatYearMonth,
		formatNumber,
		formatMeasurement,
		formatCurrency
	} from '$lib/utils/format.js';

	let { data, form }: { data: PageData; form: Record<string, unknown> | null } = $props();

	$effect(() => {
		waitLocale();
	});

	const locale = $derived(data.user?.settings?.locale ?? 'en');
	const unit = $derived(data.vehicle.odometer_unit);
	const isHoursVehicle = $derived(unit === 'h');
	const updateReadingTitle = $derived(
		isHoursVehicle ? $_('vehicle.forms.updateUsage') : $_('vehicle.forms.updateOdo')
	);
	const readingFilterLabel = $derived(
		isHoursVehicle
			? $_('vehicle.detail.timeline.filter.usage')
			: $_('vehicle.detail.timeline.filter.odometer')
	);
	const readingMenuLabel = $derived(
		isHoursVehicle ? $_('layout.addEntry.usage') : $_('layout.addEntry.mileage')
	);
	const readingMenuDesc = $derived(
		isHoursVehicle ? $_('layout.addEntry.usageDesc') : $_('layout.addEntry.mileageDesc')
	);
	const hideReadingsLabel = $derived(
		isHoursVehicle ? $_('vehicle.detail.hideUsageReadings') : $_('vehicle.detail.hideOdoReadings')
	);
	const emptyTimelineDescription = $derived(
		isHoursVehicle
			? $_('vehicle.detail.timeline.empty.usageDescription')
			: $_('vehicle.detail.timeline.empty.description')
	);
	const today = new Date().toISOString().slice(0, 10);

	// Log dropdown
	type MenuKey = 'service' | 'odometer' | 'note' | 'finance';
	const DEFAULT_MENU_ORDER: MenuKey[] = ['service', 'odometer', 'note', 'finance'];

	function normalizeMenuOrder(stored: string[] | null | undefined): MenuKey[] {
		if (!stored?.length) return [...DEFAULT_MENU_ORDER];
		const seen = new Set<string>();
		const result: MenuKey[] = [];
		for (const k of stored) {
			if ((DEFAULT_MENU_ORDER as string[]).includes(k) && !seen.has(k)) {
				result.push(k as MenuKey);
				seen.add(k);
			}
		}
		for (const k of DEFAULT_MENU_ORDER) {
			if (!seen.has(k)) result.push(k);
		}
		return result;
	}

	let menuOpen = $state(false);
	let addMenuOrder = $state<MenuKey[]>(untrack(() => normalizeMenuOrder(data.addMenuOrder)));
	let draggedMenuIdx = $state<number | null>(null);
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

	function openSheet(kind: 'service' | 'odometer' | 'note') {
		menuOpen = false;
		if (kind === 'service') {
			sheet.openSheet(ServiceLogForm, $_('vehicle.forms.logService'), {
				vehicleId: data.vehicle.id,
				odometerUnit: data.vehicle.odometer_unit,
				currentOdometer: data.vehicle.current_odometer,
				today,
				trackers: data.trackers,
				allDocs: data.allDocs ?? []
			});
		} else if (kind === 'odometer') {
			sheet.openSheet(OdometerForm, updateReadingTitle, {
				vehicleId: data.vehicle.id,
				odometerUnit: data.vehicle.odometer_unit,
				currentOdometer: data.vehicle.current_odometer,
				today
			});
		} else if (kind === 'note') {
			sheet.openSheet(NoteForm, $_('vehicle.forms.writeNote'), {
				vehicleId: data.vehicle.id,
				today
			});
		}
	}

	const addMenuConfig = $derived<Record<MenuKey, { label: string; desc: string; href?: string }>>({
		service: {
			label: $_('layout.addEntry.maintenance'),
			desc: $_('layout.addEntry.maintenanceDesc')
		},
		odometer: { label: readingMenuLabel, desc: readingMenuDesc },
		note: { label: $_('vehicle.forms.writeNote'), desc: $_('vehicle.forms.noteDesc') },
		finance: {
			label: $_('layout.addEntry.finance'),
			desc: $_('layout.addEntry.financeDesc')
		}
	});

	function handleMenuItemClick(key: MenuKey) {
		if (key === 'service' || key === 'odometer' || key === 'note') {
			openSheet(key);
		} else if (key === 'finance') {
			menuOpen = false;
			sheet.openSheet(TransactionForm, $_('finance.form.addTitle'), {
				vehicleId: data.vehicle.id,
				locale: data.user?.settings?.locale ?? 'en',
				currency: data.currency,
				odometerUnit: data.vehicle.odometer_unit,
				allDocs: data.allDocs ?? []
			});
		}
	}

	function onMenuDragStart(e: DragEvent, idx: number) {
		draggedMenuIdx = idx;
		if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
	}

	function onMenuDragOver(e: DragEvent, idx: number) {
		e.preventDefault();
		if (draggedMenuIdx === null || draggedMenuIdx === idx) return;
		const order = [...addMenuOrder];
		const [moved] = order.splice(draggedMenuIdx, 1);
		order.splice(idx, 0, moved);
		addMenuOrder = order;
		draggedMenuIdx = idx;
	}

	function onMenuDragEnd() {
		draggedMenuIdx = null;
		fetch('/api/prefs', {
			method: 'PATCH',
			keepalive: true,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ page_prefs: { global: { addMenuOrder } } })
		});
	}

	// Handle ?quick= param from the mobile FAB quick-add flow
	$effect(() => {
		const quick = page.url.searchParams.get('quick');
		if (quick === 'service' || quick === 'odometer' || quick === 'note') {
			openSheet(quick);
			const url = new URL(page.url);
			url.searchParams.delete('quick');
			tick().then(() => replaceState(url, page.state));
		}
	});

	// Entry ⋮ menu
	let entryMenu = $state<string | null>(null);
	let deletingEntry = $state<{
		id: string;
		kind: 'service' | 'odometer' | 'note' | 'finance';
	} | null>(null);

	function toggleEntryMenu(id: string) {
		entryMenu = entryMenu === id ? null : id;
	}

	$effect(() => {
		if ((form as any)?.deletedLog) {
			entryMenu = null;
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

	let filters = $state({
		service: untrack(() => data.timelinePrefs?.showService ?? true),
		odometer: untrack(() => data.timelinePrefs?.showOdometer ?? true),
		note: untrack(() => data.timelinePrefs?.showNotes ?? true),
		travel: untrack(() => data.timelinePrefs?.showTravel ?? true),
		finance: untrack(() => data.timelinePrefs?.showFinance ?? false),
		reminder: untrack(() => data.timelinePrefs?.showReminder ?? false)
	});

	let filterOpen = $state(false);

	const filtersNonDefault = $derived(
		!filters.service ||
			!filters.odometer ||
			!filters.note ||
			!filters.travel ||
			filters.finance ||
			filters.reminder
	);

	const prefsSync = createPrefsSync('timeline');
	let _prefFirstRun = true;

	beforeNavigate(() => prefsSync.flush());

	$effect(() => {
		window.addEventListener('beforeunload', prefsSync.flush);
		return () => window.removeEventListener('beforeunload', prefsSync.flush);
	});

	$effect(() => {
		const service = filters.service;
		const odometer = filters.odometer;
		const note = filters.note;
		const travel = filters.travel;
		const finance = filters.finance;
		const reminder = filters.reminder;
		if (_prefFirstRun) {
			_prefFirstRun = false;
			return;
		}
		prefsSync.schedule({
			showService: service,
			showOdometer: odometer,
			showNotes: note,
			showTravel: travel,
			showFinance: finance,
			showReminder: reminder
		});
	});

	// Combined timeline (newest first)
	type Entry =
		| { kind: 'service'; date: string; odometer: number; log: (typeof data.logs)[0] }
		| { kind: 'odometer'; date: string; odometer: number; log: (typeof data.odoLogs)[0] }
		| { kind: 'note'; date: string; odometer: number; log: (typeof data.odoLogs)[0] }
		| { kind: 'reminder'; date: string; odometer: number; log: (typeof data.logs)[0] }
		| { kind: 'travel'; date: string; travel: (typeof data.travelEntries)[0] }
		| { kind: 'finance'; date: string; tx: (typeof data.financeEntries)[0] };

	const allEntries = $derived.by((): Entry[] => {
		const entries: Entry[] = [];
		if (filters.service) {
			entries.push(
				...data.logs
					.filter((log: (typeof data.logs)[number]) => !log.is_reminder)
					.map((log: (typeof data.logs)[number]) => ({
						kind: 'service' as const,
						date: log.performed_at,
						odometer: log.odometer_at_service,
						log
					}))
			);
		}
		if (filters.reminder) {
			entries.push(
				...data.logs
					.filter((log: (typeof data.logs)[number]) => log.is_reminder)
					.map((log: (typeof data.logs)[number]) => ({
						kind: 'reminder' as const,
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

	const grouped = $derived.by((): [string, Entry[]][] => {
		const map = new Map<string, Entry[]>();
		for (const e of allEntries) {
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

	// Document helpers (used for attachment display in timeline)
	const docMap = $derived(
		new Map((data.allDocs ?? []).map((d: (typeof data.allDocs)[number]) => [d.id, d]))
	);
	function resolvedAttachments(log: (typeof data.logs)[number]) {
		const ids: string[] = (log.attachments as string[]) ?? [];
		return ids.map((id) => docMap.get(id)).filter(Boolean) as (typeof data.allDocs)[number][];
	}
</script>

<svelte:head><title>{data.vehicle.name} · {$_('layout.brand')}</title></svelte:head>

<div class="page-header">
	<div class="page-header-text">
		<h2 class="section-title">{$_('vehicle.detail.timeline.title')}</h2>
		<p class="section-sub">
			{#if data.logs.length === 0 && data.odoLogs.length === 0}
				{emptyTimelineDescription}
			{:else}
				{$_('vehicle.detail.timeline.subtitle', { values: { name: data.vehicle.name } })}
			{/if}
		</p>
	</div>
	<div class="page-actions">
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
						<span class="filter-label">{readingFilterLabel}</span>
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
					<button
						class="filter-row"
						role="checkbox"
						aria-checked={filters.reminder}
						onclick={() => (filters.reminder = !filters.reminder)}
					>
						<span class="filter-check" class:filter-check--on={filters.reminder}>
							{#if filters.reminder}<svg
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
						<span class="filter-label">{$_('vehicle.detail.timeline.filter.reminders')}</span>
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
				{#each addMenuOrder as key, i (key)}
					{@const cfg = addMenuConfig[key]}
					{#if cfg.href}
						<a
							class="add-menu-item"
							class:add-menu-item--dragging={draggedMenuIdx === i}
							href={cfg.href}
							onclick={() => (menuOpen = false)}
							draggable="true"
							ondragstart={(e) => onMenuDragStart(e, i)}
							ondragover={(e) => onMenuDragOver(e, i)}
							ondragend={onMenuDragEnd}
						>
							<span class="drag-handle" aria-hidden="true">⠿</span>
							<span class="add-menu-content">
								<span>{cfg.label}</span>
								<span class="add-menu-desc">{cfg.desc}</span>
							</span>
						</a>
					{:else}
						<button
							class="add-menu-item"
							class:add-menu-item--dragging={draggedMenuIdx === i}
							onclick={() => handleMenuItemClick(key)}
							draggable="true"
							ondragstart={(e) => onMenuDragStart(e, i)}
							ondragover={(e) => onMenuDragOver(e, i)}
							ondragend={onMenuDragEnd}
						>
							<span class="drag-handle" aria-hidden="true">⠿</span>
							<span class="add-menu-content">
								<span>{cfg.label}</span>
								<span class="add-menu-desc">{cfg.desc}</span>
							</span>
						</button>
					{/if}
				{/each}
			</div>
		{/if}
	</div>
</div>

<div class="page-content">
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
			description={emptyTimelineDescription}
		/>
	{:else}
		<!-- Single backdrop for all entry menus -->
		{#if entryMenu !== null}
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div class="entry-backdrop" onclick={() => (entryMenu = null)} onkeydown={() => {}}></div>
		{/if}

		<div class="timeline">
			{#each grouped as [ym, entries]}
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
										<span class="mono"
											>{formatMeasurement(log.odometer_at_service, unit, locale)}</span
										>
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
												onclick={() => {
													const editLog = serviceLogById(log.id);
													sheet.openSheet(
														ServiceLogEditForm,
														$_('common.edit'),
														{
															editLog,
															trackers: data.trackers,
															allDocs: data.allDocs ?? [],
															odometerUnit: data.vehicle.odometer_unit
														},
														false,
														editLog ? formatDateShort(editLog.performed_at, locale) : ''
													);
													entryMenu = null;
												}}>{$_('common.edit')}</button
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
												onclick={() => {
													const odoLog = odoLogById(log.id);
													sheet.openSheet(
														NoteForm,
														$_('common.edit'),
														{
															today,
															editData: odoLog
																? {
																		id: log.id,
																		recorded_at: odoLog.recorded_at,
																		remark: odoLog.remark ?? ''
																	}
																: undefined
														},
														false,
														odoLog ? formatDateShort(odoLog.recorded_at, locale) : ''
													);
													entryMenu = null;
												}}>{$_('common.edit')}</button
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
								<div
									class="entry-icon"
									title={$_('vehicle.layout.tabs.finance')}
									aria-hidden="true"
								></div>
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
											<button
												role="menuitem"
												class="entry-menu-item"
												onclick={() => {
													entryMenu = null;
													sheet.openSheet(TransactionForm, $_('finance.form.editTitle'), {
														vehicleId: data.vehicle.id,
														locale: data.user?.settings?.locale ?? 'en',
														currency: data.currency,
														odometerUnit: data.vehicle.odometer_unit,
														allDocs: data.allDocs ?? [],
														editData: {
															id: tx.id,
															category: tx.category,
															amount_cents: tx.amount_cents,
															performed_at: tx.performed_at,
															odometer_at_transaction:
																tx.measurement_at_transaction ?? tx.odometer_at_transaction,
															notes: tx.notes,
															attachments: tx.attachments ?? []
														}
													});
												}}>{$_('common.edit')}</button
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
						{:else if entry.kind === 'reminder'}
							{@const log = entry.log}
							{@const trackerName = data.trackers.find((t) => t.id === log.tracker_id)?.template
								.name}
							<div class="timeline-entry reminder-entry">
								<div class="entry-icon" title="Reminder" aria-hidden="true"></div>
								<div class="entry-body">
									<div class="entry-title">
										{trackerName ?? $_('vehicle.detail.timeline.reminder.label')}
									</div>
									<div class="entry-meta">
										<span class="entry-meta-item"
											>{$_('vehicle.detail.timeline.reminder.label')}</span
										>
										{#if log.odometer_at_service}
											<span class="entry-meta-sep">·</span>
											<span class="entry-meta-item mono"
												>{formatMeasurement(log.odometer_at_service, unit, locale)}</span
											>
										{/if}
									</div>
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
						{:else}
							{@const log = entry.log}
							<div class="timeline-entry odo-entry">
								<div class="entry-icon" title={readingMenuLabel} aria-hidden="true"></div>
								<div class="entry-body">
									<div class="entry-title odo-title">
										<span class="mono">{formatMeasurement(log.odometer, unit, locale)}</span>
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
												onclick={() => {
													const odoLog = odoLogById(log.id);
													sheet.openSheet(
														OdometerForm,
														$_('common.edit'),
														{
															odometerUnit: data.vehicle.odometer_unit,
															currentOdometer: data.vehicle.current_odometer,
															today,
															editData: odoLog
																? {
																		id: log.id,
																		odometer: odoLog.odometer,
																		recorded_at: odoLog.recorded_at,
																		remark: odoLog.remark ?? undefined
																	}
																: undefined
														},
														false,
														odoLog ? formatDateShort(odoLog.recorded_at, locale) : ''
													);
													entryMenu = null;
												}}>{$_('common.edit')}</button
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
						{/if}
					{/each}

					{#if hiddenCount > 0}
						<button class="collapse-toggle" onclick={() => toggleMonth(ym)}>
							{expandedMonths.has(ym)
								? hideReadingsLabel
								: isHoursVehicle
									? $_('vehicle.detail.showMoreUsageReadings', { values: { n: hiddenCount } })
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

	.mono {
		font-family: var(--font-mono);
		font-variant-numeric: tabular-nums;
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
		min-width: 240px;
		padding: 0.375rem;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.add-menu-item {
		display: flex;
		flex-direction: row;
		align-items: center;
		gap: var(--space-2);
		padding: 0.625rem 0.75rem;
		border-radius: 10px;
		background: none;
		border: none;
		cursor: pointer;
		text-align: left;
		width: 100%;
		text-decoration: none;
		transition: background 0.1s;
	}
	.add-menu-item:hover {
		background: var(--bg-muted);
	}
	.add-menu-item--dragging {
		opacity: 0.4;
	}
	.drag-handle {
		font-size: 0.875rem;
		color: var(--text-subtle);
		cursor: grab;
		flex-shrink: 0;
		opacity: 0;
		transition: opacity 0.1s;
		user-select: none;
		line-height: 1;
	}
	.add-menu-item:hover .drag-handle {
		opacity: 1;
	}
	.add-menu-content {
		display: flex;
		flex-direction: column;
	}
	.add-menu-content span:first-child {
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
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.upcoming-detail {
		font-size: var(--text-sm);
		margin-top: 0.125rem;
		color: var(--text-muted);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.upcoming-card--overdue .upcoming-detail {
		color: var(--status-overdue);
	}
	.upcoming-card--due .upcoming-detail {
		color: var(--status-due);
	}
	.upcoming-target {
		margin-top: 0.15rem;
		font-size: var(--text-sm);
		color: var(--text-subtle);
		font-weight: 400;
		font-family: var(--font-display);
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
	.reminder-entry .entry-icon {
		background: none;
		border: 1.5px solid var(--text-subtle);
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
		.entry-menu-btn {
			opacity: 1;
			width: 44px;
			height: 44px;
		}
	}
	@media (max-width: 768px) {
		.page-actions {
			flex-direction: row-reverse;
		}
	}
	@media (pointer: coarse) {
		.entry-menu-btn {
			opacity: 1;
		}
	}

	/* Entry attachments (timeline read-only) */
	.entry-attachments {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.375rem;
		margin-top: 0.375rem;
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
</style>
