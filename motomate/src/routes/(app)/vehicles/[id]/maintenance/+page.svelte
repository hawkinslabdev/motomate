<script lang="ts">
	import { untrack, tick } from 'svelte';
	import { enhance } from '$app/forms';
	import { beforeNavigate, replaceState } from '$app/navigation';
	import { page } from '$app/state';
	import type { PageData } from './$types';
	import TrackerCard from '$lib/components/ui/TrackerCard.svelte';
	import ConfirmDialog from '$lib/components/ui/ConfirmDialog.svelte';
	import ViewToggle from '$lib/components/ui/ViewToggle.svelte';
	import ColumnPicker from '$lib/components/ui/ColumnPicker.svelte';
	import AddTrackerForm from '$lib/components/maintenance/AddTrackerForm.svelte';
	import EditTrackerForm from '$lib/components/maintenance/EditTrackerForm.svelte';
	import { toasts } from '$lib/stores/toasts.svelte.js';
	import { _, waitLocale } from '$lib/i18n';
	import { sheet } from '$lib/stores/sheet.svelte.js';
	import { createPrefsSync } from '$lib/utils/prefs-sync.js';
	import { compareTrackerStatus } from '$lib/utils/tracker-status.js';
	import ServiceLogEditForm from '$lib/components/vehicle/ServiceLogEditForm.svelte';
	import {
		formatMeasurement,
		formatDateShort,
		formatCurrency,
		formatYearMonth
	} from '$lib/utils/format.js';
	import { getMeasurementUnitTranslationKey } from '$lib/utils/measurement.js';

	let {
		data,
		form
	}: {
		data: PageData;
		form: Record<string, unknown> | null;
	} = $props();

	$effect(() => {
		waitLocale();
	});

	const locale = $derived(data.user?.settings?.locale ?? 'en');
	const isHoursVehicle = $derived(data.vehicle.odometer_unit === 'h');
	const unitLabel = $derived($_(getMeasurementUnitTranslationKey(data.vehicle.odometer_unit)));
	const measurementFieldLabel = $derived(
		isHoursVehicle
			? $_('vehicle.forms.fields.usage', { values: { unit: unitLabel } })
			: $_('vehicle.forms.fields.odometer', { values: { unit: unitLabel } })
	);

	let loggingTracker = $state<string | null>(null);
	let recentlyLoggedId = $state<string | null>(null);

	$effect(() => {
		const logId = page.url.searchParams.get('log');
		if (logId && data.trackers.some((t) => t.id === logId)) {
			loggingTracker = logId;
			const url = new URL(page.url);
			url.searchParams.delete('log');
			tick().then(() => replaceState(url, page.state));
			setTimeout(() => {
				document.querySelector(`[data-log-form="${logId}"]`)?.scrollIntoView({
					behavior: 'smooth',
					block: 'center'
				});
			}, 50);
		}
	});
	let trackerMenu = $state<string | null>(null);
	let deletingTracker = $state<{ id: string; name: string } | null>(null);
	let skippingTracker = $state<{ id: string; name: string } | null>(null);
	let historyTracker = $state<string | null>(null);
	let viewMode = $state<'current' | 'forecast' | 'history'>('current');
	let searchQuery = $state('');
	let sortBy = $state<'status' | 'name' | 'last'>(
		untrack(() => data.page_prefs?.sortBy ?? 'status')
	);
	let historySortBy = $state<'date' | 'name'>('date');
	let historyViewMode = $state<'timeline' | 'table'>(
		untrack(() => data.page_prefs?.historyViewMode ?? 'timeline')
	);
	let historyColumnVisible = $state<Record<string, boolean>>(
		untrack(
			() => data.page_prefs?.historyColumnVisibility ?? { odometer: true, cost: true, notes: false }
		)
	);
	let historySortField = $state<'date' | 'name' | 'odometer' | 'cost'>('date');
	let historySortDir = $state<'asc' | 'desc'>('desc');

	function toggleHistorySort(col: 'date' | 'name' | 'odometer' | 'cost') {
		if (historySortField === col) {
			historySortDir = historySortDir === 'asc' ? 'desc' : 'asc';
		} else {
			historySortField = col;
			historySortDir = 'desc';
		}
	}

	// Persist sort preference
	const prefsSync = createPrefsSync('maintenance');
	let _firstRun = true;

	beforeNavigate(() => prefsSync.flush());

	$effect(() => {
		const s = sortBy;
		const hvm = historyViewMode;
		const hcv = historyColumnVisible;
		if (_firstRun) {
			_firstRun = false;
			return;
		}
		prefsSync.schedule({ sortBy: s, historyViewMode: hvm, historyColumnVisibility: hcv });
	});
	let logMenu = $state<string | null>(null);

	const averageKmPerMonth = $derived.by(() => {
		if (isHoursVehicle) return null;
		const logs = data.odometerLogs ?? [];
		if (logs.length < 5) return null;
		const odoValues = logs.map((l) => l.odometer).filter((v): v is number => v !== null && v > 0);
		if (odoValues.length < 5) return null;
		const maxOdo = Math.max(...odoValues);
		const minOdo = Math.min(...odoValues);
		const kmDiff = maxOdo - minOdo;
		if (kmDiff <= 0) return null;
		const dates = logs.map((l) => l.recorded_at).sort();
		const firstDate = new Date(dates[0]);
		const lastDate = new Date(dates[dates.length - 1]);
		const monthsDiff = (lastDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24 * 30);
		if (monthsDiff < 1) return null;
		return Math.round(kmDiff / monthsDiff);
	});

	const monthsOfUsage = $derived.by(() => {
		const logs = data.odometerLogs ?? [];
		if (logs.length < 2) return 0;
		const dates = logs.map((l) => l.recorded_at).sort();
		const firstDate = new Date(dates[0]);
		const lastDate = new Date(dates[dates.length - 1]);
		return Math.max(
			1,
			Math.round((lastDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24 * 30))
		);
	});

	const trackerServiceLogs = $derived.by(() => {
		const map = new Map<string, typeof data.allServiceLogs>();
		for (const log of data.allServiceLogs ?? []) {
			const ids = new Set<string>();
			if (log.tracker_id) ids.add(log.tracker_id);
			for (const id of log.serviced_tracker_ids ?? []) ids.add(id);
			for (const id of ids) {
				if (!map.has(id)) map.set(id, []);
				map.get(id)!.push(log);
			}
		}
		return map;
	});

	const filteredTrackers = $derived.by(() => {
		let trackers = [...data.trackers];
		if (searchQuery) {
			const q = searchQuery.toLowerCase();
			trackers = trackers.filter((t) => t.template.name.toLowerCase().includes(q));
		}
		return trackers;
	});

	const sortedTrackers = $derived(
		[...filteredTrackers].sort((a, b) => {
			if (sortBy === 'status') {
				return compareTrackerStatus(a, b);
			}
			if (sortBy === 'name') {
				return a.template.name.localeCompare(b.template.name);
			}
			if (sortBy === 'last') {
				const aDate = a.last_done_at ?? '1970-01-01';
				const bDate = b.last_done_at ?? '1970-01-01';
				return bDate.localeCompare(aDate);
			}
			return 0;
		})
	);

	function toggleTrackerMenu(id: string) {
		trackerMenu = trackerMenu === id ? null : id;
	}
	function startEditTracker(tracker: (typeof data.trackers)[number]) {
		sheet.openSheet(
			EditTrackerForm,
			$_('common.edit'),
			{
				tracker,
				vehicleId: data.vehicle.id,
				odometerUnit: data.vehicle.odometer_unit
			},
			true,
			tracker.template.name
		);
		trackerMenu = null;
		loggingTracker = null;
		historyTracker = null;
	}

	function openLogEdit(log: (typeof data.allServiceLogs)[number]) {
		logMenu = null;
		sheet.openSheet(
			ServiceLogEditForm,
			$_('common.edit'),
			{
				editLog: log,
				trackers: data.trackers,
				allDocs: data.allDocs ?? [],
				odometerUnit: data.vehicle.odometer_unit
			},
			false,
			formatDateShort(log.performed_at, locale)
		);
	}

	function getForecastDate(tracker: (typeof data.trackers)[number]): string | null {
		if (!tracker.last_done_at) return null;
		const lastDate = new Date(tracker.last_done_at);
		const intervalMonths = tracker.template.interval_months;
		if (!intervalMonths) return null;
		const nextDate = new Date(lastDate);
		nextDate.setMonth(nextDate.getMonth() + intervalMonths);
		return nextDate.toISOString().slice(0, 10);
	}

	function getKmForecast(tracker: (typeof data.trackers)[number]): {
		odometer: number | null;
		monthsUntil: number | null;
	} {
		if (isHoursVehicle) return { odometer: null, monthsUntil: null };
		const avgKm = averageKmPerMonth;
		if (!avgKm || !tracker.last_done_odometer || !tracker.template.interval_km) {
			return { odometer: null, monthsUntil: null };
		}
		const nextOdo = tracker.last_done_odometer + tracker.template.interval_km;
		const kmRemaining = nextOdo - data.vehicle.current_odometer;
		if (kmRemaining <= 0) return { odometer: nextOdo, monthsUntil: 0 };
		const monthsUntil = Math.ceil(kmRemaining / avgKm);
		return { odometer: nextOdo, monthsUntil };
	}

	$effect(() => {
		const f = form;
		untrack(() => {
			if (f?.trackerUpdated) {
				toasts.success($_('maintenance.toasts.trackerUpdated'));
			}
			if (f?.trackerDeleted) {
				toasts.success($_('maintenance.toasts.trackerDeleted'));
				trackerMenu = null;
			}
			if (f?.skipped) {
				skippingTracker = null;
			}
			if (f?.added) {
				toasts.success($_('maintenance.toasts.taskAdded'));
			}
			if (f?.error) {
				toasts.error(String(f.error));
			}
			if (f?.trackerError) {
				toasts.error(String(f.trackerError));
			}
			if (f?.taskError) {
				toasts.error(String(f.taskError));
			}
			if (f?.editError) {
				toasts.error(String(f.editError));
			}
			if (f?.defaultsApplied) {
				toasts.success($_('maintenance.toasts.defaultsApplied'));
			}
			if (f?.defaultsError) {
				toasts.error(String(f.defaultsError));
			}
		});
	});

	$effect(() => {
		const id = loggingTracker;
		if (id && typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches) {
			setTimeout(() => {
				document.querySelector(`[data-log-form="${id}"]`)?.scrollIntoView({
					behavior: 'smooth',
					block: 'nearest'
				});
			}, 50);
		}
	});
</script>

<svelte:head><title>{$_('maintenance.title')} · {data.vehicle.name}</title></svelte:head>

<div class="page-header">
	<div class="page-header-text">
		<h2 class="section-title">{$_('maintenance.title')}</h2>
		<p class="section-sub">{$_('maintenance.subtitle')}</p>
	</div>
	<div class="page-actions">
		{#if data.trackers.length > 0}
			<div class="view-toggle">
				<button
					type="button"
					class="view-toggle-btn"
					class:view-toggle-btn--active={viewMode === 'current'}
					onclick={() => (viewMode = 'current')}>{$_('maintenance.view.current')}</button
				>
				<button
					type="button"
					class="view-toggle-btn"
					class:view-toggle-btn--active={viewMode === 'forecast'}
					onclick={() => (viewMode = 'forecast')}>{$_('maintenance.view.forecast')}</button
				>
				<button
					type="button"
					class="view-toggle-btn"
					class:view-toggle-btn--active={viewMode === 'history'}
					onclick={() => (viewMode = 'history')}>{$_('maintenance.view.history')}</button
				>
			</div>
		{/if}
		{#if data.trackers.length === 0}
			<form method="POST" action="?/applyDefaults" use:enhance>
				<button type="submit" class="btn-ghost">
					{$_('maintenance.applyDefaults')}
				</button>
			</form>
		{/if}
		<button
			class="btn-ghost"
			class:btn-ghost--disabled={viewMode === 'history'}
			disabled={viewMode === 'history'}
			title={viewMode === 'history' ? $_('maintenance.addTask.historyDisabled') : ''}
			onclick={() =>
				sheet.openSheet(AddTrackerForm, $_('maintenance.addTask.button'), {
					vehicleId: data.vehicle.id,
					odometerUnit: data.vehicle.odometer_unit
				})}
		>
			{$_('maintenance.addTask.button')}
		</button>
	</div>
</div>

{#if sortedTrackers.length > 0 || searchQuery || viewMode === 'history'}
	<div class="filters">
		<div class="search-box">
			<input
				type="text"
				placeholder={$_('maintenance.filter.search')}
				bind:value={searchQuery}
				class="search-input"
			/>
		</div>
		<div class="filter-controls">
			{#if viewMode === 'history'}
				<select bind:value={historySortBy} class="filter-select">
					<option value="date">{$_('maintenance.filter.sortDate')}</option>
					<option value="name">{$_('maintenance.filter.sortName')}</option>
				</select>
			{:else if viewMode === 'current'}
				<select bind:value={sortBy} class="filter-select">
					<option value="status">{$_('maintenance.filter.sortStatus')}</option>
					<option value="name">{$_('maintenance.filter.sortName')}</option>
					<option value="last">{$_('maintenance.filter.sortLast')}</option>
				</select>
			{/if}
		</div>
	</div>
{/if}

{#if viewMode === 'history'}
	{#if logMenu !== null}
		<div class="tracker-backdrop" role="presentation" onclick={() => (logMenu = null)}></div>
	{/if}
	<div class="history-timeline">
		{#if (data.allServiceLogs ?? []).length === 0}
			<div class="empty">
				<span class="empty-icon"
					>{@html `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="32" height="32"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>`}</span
				>
				<p class="empty-title">{$_('maintenance.history.noHistory')}</p>
				<p class="empty-desc">{$_('maintenance.history.noHistoryDesc')}</p>
			</div>
		{:else}
			{@const filteredHistory = (() => {
				let logs = [...(data.allServiceLogs ?? [])];
				if (searchQuery) {
					const q = searchQuery.toLowerCase();
					logs = logs.filter((log) => {
						if (log.notes?.toLowerCase().includes(q)) return true;
						const allIds = new Set([
							...(log.tracker_id ? [log.tracker_id] : []),
							...(log.serviced_tracker_ids ?? [])
						]);
						return [...allIds].some((id) => {
							const tracker = data.trackers.find((t) => t.id === id);
							return tracker?.template.name?.toLowerCase().includes(q);
						});
					});
				}
				return logs;
			})()}
			{@const historySorted = (() => {
				const logs = [...filteredHistory];
				if (historySortBy === 'name') {
					logs.sort((a, b) => {
						const getName = (log: (typeof logs)[number]) => {
							if (log.tracker_id) {
								return data.trackers.find((t) => t.id === log.tracker_id)?.template.name ?? '';
							}
							const first = (log.serviced_tracker_ids ?? [])[0];
							return first ? (data.trackers.find((t) => t.id === first)?.template.name ?? '') : '';
						};
						return getName(a).localeCompare(getName(b));
					});
				} else {
					logs.sort((a, b) => b.performed_at.localeCompare(a.performed_at));
				}
				return logs;
			})()}
			{@const historyGrouped = (() => {
				const map = new Map<string, typeof historySorted>();
				for (const log of historySorted) {
					const key = log.performed_at.slice(0, 7);
					if (!map.has(key)) map.set(key, []);
					map.get(key)!.push(log);
				}
				return [...map.entries()];
			})()}
			{#if historySorted.length === 0}
				<div class="empty">
					<span class="empty-icon"
						>{@html `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="32" height="32"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>`}</span
					>
					<p class="empty-title">{$_('maintenance.empty.noMatch')}</p>
					<p class="empty-desc">{$_('maintenance.empty.noMatchDesc')}</p>
				</div>
			{:else}
				<div class="history-view-controls">
					<ViewToggle
						options={[
							{ value: 'timeline', label: $_('common.timeline') },
							{ value: 'table', label: $_('common.table') }
						]}
						value={historyViewMode}
						onchange={(v) => (historyViewMode = v as 'timeline' | 'table')}
					/>
					{#if historyViewMode === 'table'}
						<ColumnPicker
							columns={[
								{ key: 'date', label: $_('finance.col.date'), hideable: false },
								{ key: 'task', label: $_('maintenance.history.task'), hideable: false },
								{ key: 'odometer', label: $_('maintenance.history.odometer'), hideable: true },
								{ key: 'cost', label: $_('maintenance.history.cost'), hideable: true },
								{ key: 'notes', label: $_('maintenance.history.notes'), hideable: true }
							]}
							visible={historyColumnVisible}
							onchange={(v) => (historyColumnVisible = v)}
						/>
					{/if}
				</div>
				{#if historyViewMode === 'timeline'}
					{#each historyGrouped as [yearMonth, logs]}
						<div class="timeline-month">
							<div class="timeline-month-label">
								<span class="timeline-month-name">{formatYearMonth(yearMonth, locale)}</span>
								<span class="timeline-month-line"></span>
							</div>
							{#each logs as log}
								{@const tracker = data.trackers.find((t) => t.id === log.tracker_id)}
								{@const isFullService =
									!log.tracker_id && (log.serviced_tracker_ids ?? []).length > 0}
								<div class="timeline-entry" data-log-id={log.id}>
									<span class="timeline-dot"></span>
									<span class="timeline-title">
										{log.notes?.split('\n')[0] ||
											(isFullService
												? $_('maintenance.fullService.title')
												: tracker?.template.name) ||
											$_('maintenance.history.serviceEntry')}
										{#if isFullService}
											<span class="tracker-check-status tracker-check-status--full"
												>{$_('maintenance.fullService.badge', {
													values: { n: (log.serviced_tracker_ids ?? []).length }
												})}</span
											>
										{/if}
									</span>
									<span class="timeline-meta">
										{formatDateShort(log.performed_at, locale)} · {formatMeasurement(
											log.odometer_at_service,
											data.vehicle.odometer_unit,
											locale
										)}
										{#if log.cost_cents}
											<span class="timeline-cost">
												· {formatCurrency(log.cost_cents, log.currency, locale)}</span
											>
										{/if}
									</span>
									<div class="entry-actions" class:entry-actions--open={logMenu === log.id}>
										<button
											class="entry-menu-btn"
											class:active={logMenu === log.id}
											onclick={() => (logMenu = logMenu === log.id ? null : log.id)}
											aria-label="Entry options"
											aria-haspopup="menu"
											aria-expanded={logMenu === log.id}>⋮</button
										>
										{#if logMenu === log.id}
											<div class="entry-menu-dropdown" role="menu">
												<button
													role="menuitem"
													class="entry-menu-item"
													onclick={() => openLogEdit(log)}>{$_('common.edit')}</button
												>
											</div>
										{/if}
									</div>
								</div>
							{/each}
						</div>
					{/each}
				{:else}
					<div class="history-table-wrap">
						<table class="history-table">
							<thead>
								<tr>
									<th class="htx-th htx-th--sortable" onclick={() => toggleHistorySort('date')}>
										{$_('finance.col.date')}{#if historySortField === 'date'}<span
												class="sort-arrow">{historySortDir === 'asc' ? '↑' : '↓'}</span
											>{/if}
									</th>
									<th class="htx-th htx-th--sortable" onclick={() => toggleHistorySort('name')}>
										{$_('maintenance.history.task')}{#if historySortField === 'name'}<span
												class="sort-arrow">{historySortDir === 'asc' ? '↑' : '↓'}</span
											>{/if}
									</th>
									{#if historyColumnVisible.odometer}
										<th
											class="htx-th htx-th--sortable"
											onclick={() => toggleHistorySort('odometer')}
										>
											{$_('maintenance.history.odometer')}{#if historySortField === 'odometer'}<span
													class="sort-arrow">{historySortDir === 'asc' ? '↑' : '↓'}</span
												>{/if}
										</th>
									{/if}
									{#if historyColumnVisible.cost}
										<th class="htx-th htx-th--sortable" onclick={() => toggleHistorySort('cost')}>
											{$_('maintenance.history.cost')}{#if historySortField === 'cost'}<span
													class="sort-arrow">{historySortDir === 'asc' ? '↑' : '↓'}</span
												>{/if}
										</th>
									{/if}
									{#if historyColumnVisible.notes}
										<th class="htx-th">{$_('maintenance.history.notes')}</th>
									{/if}
									<th class="htx-th"></th>
								</tr>
							</thead>
							<tbody>
								{#each (() => {
									const logs = [...filteredHistory];
									logs.sort((a, b) => {
										let cmp = 0;
										if (historySortField === 'date') cmp = a.performed_at.localeCompare(b.performed_at);
										else if (historySortField === 'name') {
											const getName = (l: typeof a) => {
												if (l.tracker_id) return data.trackers.find((t) => t.id === l.tracker_id)?.template.name ?? '';
												const first = (l.serviced_tracker_ids ?? [])[0];
												return first ? (data.trackers.find((t) => t.id === first)?.template.name ?? '') : '';
											};
											cmp = getName(a).localeCompare(getName(b));
										} else if (historySortField === 'odometer') cmp = (a.odometer_at_service ?? 0) - (b.odometer_at_service ?? 0);
										else if (historySortField === 'cost') cmp = (a.cost_cents ?? 0) - (b.cost_cents ?? 0);
										return historySortDir === 'asc' ? cmp : -cmp;
									});
									return logs;
								})() as log}
									{@const tracker = data.trackers.find((t) => t.id === log.tracker_id)}
									{@const isFullService =
										!log.tracker_id && (log.serviced_tracker_ids ?? []).length > 0}
									<tr class="htx-row">
										<td class="htx-td mono">{formatDateShort(log.performed_at, locale)}</td>
										<td class="htx-td">
											{log.notes?.split('\n')[0] ||
												(isFullService
													? $_('maintenance.fullService.title')
													: tracker?.template.name) ||
												$_('maintenance.history.serviceEntry')}
										</td>
										{#if historyColumnVisible.odometer}
											<td class="htx-td mono"
												>{formatMeasurement(
													log.odometer_at_service,
													data.vehicle.odometer_unit,
													locale
												)}</td
											>
										{/if}
										{#if historyColumnVisible.cost}
											<td class="htx-td mono"
												>{log.cost_cents
													? formatCurrency(log.cost_cents, log.currency, locale)
													: ''}</td
											>
										{/if}
										{#if historyColumnVisible.notes}
											<td class="htx-td htx-td--notes"
												>{log.notes?.split('\n').slice(1).join(' ') ?? ''}</td
											>
										{/if}
										<td class="htx-td htx-td--center">
											<div class="entry-actions" class:entry-actions--open={logMenu === log.id}>
												<button
													class="entry-menu-btn"
													class:active={logMenu === log.id}
													onclick={() => (logMenu = logMenu === log.id ? null : log.id)}
													aria-label="Options"
													aria-haspopup="true">⋮</button
												>
												{#if logMenu === log.id}
													<div class="entry-menu-dropdown" role="menu">
														<button
															role="menuitem"
															class="entry-menu-item"
															onclick={() => openLogEdit(log)}>{$_('common.edit')}</button
														>
													</div>
												{/if}
											</div>
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				{/if}
			{/if}
		{/if}
	</div>
{/if}

{#if data.trackers.length === 0}
	<div class="empty">
		<span class="empty-icon"
			>{@html `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="32" height="32"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>`}</span
		>
		<p class="empty-title">{$_('maintenance.empty.title')}</p>
		<p class="empty-desc">{$_('maintenance.empty.description')}</p>
	</div>
{:else if viewMode === 'history'}
	<!-- History view is shown above, no need to render anything here -->
{:else if sortedTrackers.length === 0}
	<div class="empty">
		<span class="empty-icon"
			>{@html `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="32" height="32"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>`}</span
		>
		<p class="empty-title">{$_('maintenance.empty.noMatch')}</p>
		<p class="empty-desc">{$_('maintenance.empty.noMatchDesc')}</p>
	</div>
{:else}
	<!-- Single backdrop for tracker menus -->
	{#if trackerMenu !== null}
		<div class="tracker-backdrop" role="presentation" onclick={() => (trackerMenu = null)}></div>
	{/if}

	<div class="tracker-list">
		{#each sortedTrackers as tracker}
			{@const t = tracker}
			{@const otherTrackers = data.trackers
				.filter((ot) => ot.id !== t.id)
				.sort(compareTrackerStatus)}
			<div class="tracker-item">
				<div class="tracker-card-row">
					<TrackerCard
						{tracker}
						vehicleUnit={data.vehicle.odometer_unit}
						{locale}
						serviceLogs={trackerServiceLogs.get(t.id) ?? []}
						showHistory={historyTracker === t.id}
						forecastMode={viewMode === 'forecast'}
						forecastData={viewMode === 'forecast' ? getKmForecast(t) : null}
						forecastDateEstimate={viewMode === 'forecast'
							? (() => {
									const d = getForecastDate(t);
									return d ? formatDateShort(d, locale) : null;
								})()
							: null}
						{monthsOfUsage}
						isLogging={loggingTracker === t.id}
						isRecentlyLogged={recentlyLoggedId === t.id}
						isMenuOpen={trackerMenu === t.id}
						onlogclick={(id) => {
							loggingTracker = loggingTracker === id ? null : id;
							historyTracker = null;
						}}
						onhistoryclick={(id) => {
							historyTracker = historyTracker === id ? null : id;
							loggingTracker = null;
						}}
						onoptionsclick={(id) => {
							loggingTracker = null;
							historyTracker = null;
							toggleTrackerMenu(id);
						}}
					/>

					{#if trackerMenu === t.id}
						<div class="tracker-menu-dropdown" role="menu">
							<button role="menuitem" class="tracker-menu-item" onclick={() => startEditTracker(t)}
								>{$_('common.edit')}</button
							>
							<button
								role="menuitem"
								class="tracker-menu-item tracker-menu-item--danger"
								onclick={() => {
									deletingTracker = { id: t.id, name: t.template.name };
									trackerMenu = null;
								}}>{$_('common.delete')}</button
							>
						</div>
					{/if}
				</div>

				<!-- Log service entry form -->
				<div class="expand-wrap" class:open={loggingTracker === t.id}>
					<div class="expand-inner">
						<form
							method="POST"
							action="?/log"
							use:enhance={() => {
								const justLogged = loggingTracker;
								return async ({ result, update }) => {
									await update({ reset: false });
									if (
										result.type === 'success' &&
										(result.data as Record<string, unknown>)?.logged
									) {
										recentlyLoggedId = justLogged;
										toasts.success($_('maintenance.toasts.logged'));
										setTimeout(() => {
											recentlyLoggedId = null;
										}, 1800);
									}
									loggingTracker = null;
								};
							}}
							class="log-form"
							data-log-form={t.id}
						>
							<input type="hidden" name="tracker_id" value={t.id} />
							<div class="log-fields">
								<label class="field">
									<span class="field-label">{$_('vehicle.forms.fields.date')}</span>
									<input
										name="performed_at"
										type="date"
										value={new Date().toISOString().slice(0, 10)}
										required
										class="input"
									/>
								</label>
								<label class="field">
									<span class="field-label">{measurementFieldLabel}</span>
									<input
										name="odometer_at_service"
										type="number"
										min="0"
										value={data.vehicle.current_odometer}
										required
										class="input mono"
									/>
								</label>
								<label class="field">
									<span class="field-label"
										>{$_('vehicle.forms.fields.cost', {
											values: { optional: $_('common.optional') }
										})}</span
									>
									<input
										name="cost"
										type="number"
										min="0"
										step="0.01"
										placeholder="0.00"
										class="input mono"
									/>
								</label>
							</div>
							{#if otherTrackers.length > 0}
								<fieldset class="tracker-select">
									<legend class="field-label"
										>{$_('vehicle.forms.fields.resetCycle', {
											values: { optional: $_('vehicle.forms.fields.checkToReset') }
										})}</legend
									>
									<div class="tracker-checkboxes">
										{#each otherTrackers as ot}
											<label class="tracker-checkbox">
												<input type="checkbox" name="additional_tracker_ids" value={ot.id} />
												<span class="tracker-check-label">
													<span class="tracker-check-name">{ot.template.name}</span>
													{#if ot.status === 'due'}
														<span class="tracker-check-status tracker-check-status--due"
															>{$_('maintenance.tracker.status.due')}</span
														>
													{:else if ot.status === 'overdue'}
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
								<span class="field-label">{$_('vehicle.forms.fields.notes')}</span>
								<textarea
									name="notes"
									rows="2"
									placeholder={$_('vehicle.forms.placeholders.partsUsed')}
									class="input"
								></textarea>
							</label>
							<div class="log-actions">
								{#if (data as any).demoMode}
									<p class="demo-form-note">Demo mode: entries are not saved.</p>
								{/if}
								<button type="submit" class="btn-primary"
									>{$_('vehicle.forms.submit.service')}</button
								>
								<button
									type="button"
									class="btn-ghost"
									onclick={() => {
										loggingTracker = null;
										skippingTracker = { id: t.id, name: t.template.name };
									}}>{$_('maintenance.skip.button')}</button
								>
								<button type="button" class="btn-ghost" onclick={() => (loggingTracker = null)}
									>{$_('common.cancel')}</button
								>
							</div>
						</form>
					</div>
				</div>
			</div>
		{/each}
	</div>
{/if}

{#if deletingTracker}
	<ConfirmDialog
		open={true}
		title={$_('maintenance.delete.title', { values: { name: deletingTracker.name } })}
		description={$_('maintenance.delete.description')}
		confirmLabel={$_('maintenance.delete.confirm')}
		cancelLabel={$_('maintenance.delete.cancel')}
		danger={true}
		loading={false}
		onconfirm={() => {
			const form = document.createElement('form');
			form.method = 'POST';
			form.action = '?/deleteTracker';
			const input = document.createElement('input');
			input.type = 'hidden';
			input.name = 'id';
			input.value = deletingTracker!.id;
			form.appendChild(input);
			document.body.appendChild(form);
			form.submit();
		}}
		onclose={() => (deletingTracker = null)}
	/>
{/if}

{#if skippingTracker}
	<ConfirmDialog
		open={true}
		title={$_('maintenance.skip.title', { values: { name: skippingTracker.name } })}
		description={$_('maintenance.skip.description')}
		confirmLabel={$_('maintenance.skip.confirm')}
		cancelLabel={$_('maintenance.skip.cancel')}
		danger={false}
		loading={false}
		onconfirm={() => {
			const form = document.createElement('form');
			form.method = 'POST';
			form.action = '?/skipTracker';
			const input = document.createElement('input');
			input.type = 'hidden';
			input.name = 'tracker_id';
			input.value = skippingTracker!.id;
			form.appendChild(input);
			document.body.appendChild(form);
			form.submit();
		}}
		onclose={() => (skippingTracker = null)}
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
	.page-header-text {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}
	.page-actions {
		display: flex;
		gap: var(--space-2);
		align-items: center;
		flex-shrink: 0;
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

	/* View toggle */
	.view-toggle {
		display: flex;
		background: var(--bg-muted);
		border-radius: 8px;
		padding: 2px;
		gap: 2px;
	}
	.view-toggle-btn {
		padding: 0.375rem 0.75rem;
		font-size: var(--text-sm);
		font-weight: 500;
		background: transparent;
		border: none;
		border-radius: 6px;
		cursor: pointer;
		color: var(--text-muted);
		transition:
			background 0.15s,
			color 0.15s;
	}
	.view-toggle-btn:hover {
		color: var(--text);
	}
	.view-toggle-btn--active {
		background: var(--bg);
		color: var(--text);
		box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
	}

	/* Filters */
	.filters {
		display: flex;
		gap: var(--space-3);
		margin-bottom: var(--space-5);
		flex-wrap: wrap;
		align-items: center;
	}
	.search-box {
		flex: 1;
		min-width: 200px;
	}
	.search-input {
		width: 100%;
		padding: 0.5rem 0.75rem;
		border: 1px solid var(--border);
		border-radius: 8px;
		background: var(--bg-subtle);
		color: var(--text);
		font-size: var(--text-sm);
		min-height: 40px;
	}
	.search-input:focus {
		outline: 2px solid var(--accent);
		outline-offset: 1px;
		border-color: transparent;
	}
	.filter-controls {
		display: flex;
		gap: var(--space-2);
		flex-wrap: wrap;
		align-items: center;
	}
	.filter-select {
		padding: 0.375rem 0.625rem;
		border: 1px solid var(--border);
		border-radius: 8px;
		background: var(--bg-subtle);
		color: var(--text);
		font-size: var(--text-sm);
		cursor: pointer;
		min-height: 40px;
		box-sizing: border-box;
	}
	.filter-select:focus {
		outline: 2px solid var(--accent);
		outline-offset: -1px;
		border-color: transparent;
	}
	.tracker-list {
		display: flex;
		flex-direction: column;
	}
	.tracker-item {
		border-bottom: 1px solid var(--border);
		position: relative;
	}
	.tracker-item:first-child {
		border-top: 1px solid var(--border);
	}
	.tracker-item:last-child {
		border-bottom: none;
	}

	/* ⋮ menu */
	.tracker-backdrop {
		position: fixed;
		inset: 0;
		z-index: 10;
	}
	.tracker-card-row {
		position: relative;
	}

	.tracker-menu-dropdown {
		position: absolute;
		right: 0.5rem;
		top: 2.5rem;
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
	}
	@media (max-width: 380px) {
		.tracker-menu-dropdown {
			right: auto;
			left: 0.5rem;
		}
	}
	.tracker-menu-item {
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
	.tracker-menu-item:hover {
		background: var(--bg-muted);
	}
	.tracker-menu-item--danger {
		color: var(--status-overdue);
	}
	.tracker-menu-item--danger:hover {
		background: color-mix(in srgb, var(--status-overdue) 8%, transparent);
	}

	/* Expand animation (used for both edit and log forms) */
	.expand-wrap {
		display: grid;
		grid-template-rows: 0fr;
		transition: grid-template-rows 0.2s ease;
	}
	.expand-wrap.open {
		grid-template-rows: 1fr;
	}
	.expand-inner {
		overflow: hidden;
	}

	/* Inline edit form (appears below entry) - matches vehicle detail page */
	/* Log form */
	.log-form {
		padding: 1.25rem;
		background: var(--bg-subtle);
		border-top: 1px solid var(--border);
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		scroll-margin-top: 1rem;
	}
	.log-fields {
		display: grid;
		grid-template-columns: 1fr 1fr 1fr;
		gap: 0.75rem;
	}
	@media (max-width: 540px) {
		.log-fields {
			grid-template-columns: 1fr;
		}
	}
	.log-actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem;
	}
	.demo-form-note {
		width: 100%;
		font-size: var(--text-xs);
		color: var(--text-subtle);
		margin: 0;
	}

	/* Shared form elements */
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
		font-family: var(--font-sans);
		width: 100%;
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
	textarea.input {
		resize: vertical;
	}

	.btn-primary {
		padding: 0.5rem 1rem;
		min-height: 44px;
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
		min-height: 44px;
		background: transparent;
		border: 1px solid var(--border);
		border-radius: 10px;
		font-size: var(--text-sm);
		font-weight: 500;
		cursor: pointer;
		color: var(--text-muted);
	}
	.btn-ghost:hover {
		background: var(--bg-subtle);
		color: var(--text);
	}
	.btn-ghost--disabled,
	.btn-ghost:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}
	.btn-ghost--disabled:hover {
		background: transparent;
		color: var(--text-muted);
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
		background: var(--bg);
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
	.tracker-check-status--full {
		background: var(--bg-muted);
		color: var(--text-muted);
	}

	.history-view-controls {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		margin-bottom: var(--space-4);
	}

	.history-table-wrap {
		overflow-x: auto;
		border: 1px solid var(--border);
		border-radius: 10px;
	}

	.history-table {
		width: 100%;
		border-collapse: collapse;
		font-size: var(--text-sm);
	}

	.htx-th {
		padding: 0.625rem 0.875rem;
		text-align: left;
		font-size: var(--text-xs);
		font-weight: 500;
		color: var(--text-muted);
		border-bottom: 1px solid var(--border);
		white-space: nowrap;
		background: var(--bg-subtle);
	}

	.htx-th--sortable {
		cursor: pointer;
		user-select: none;
	}

	.htx-th--sortable:hover {
		color: var(--text);
	}

	.htx-row {
		border-bottom: 1px solid var(--border);
		transition: background 0.1s;
	}

	.htx-row:last-child {
		border-bottom: none;
	}
	.htx-row:hover {
		background: var(--bg-subtle);
	}

	.htx-td {
		padding: 0.625rem 0.875rem;
		color: var(--text);
		vertical-align: middle;
	}

	.htx-td--notes {
		max-width: 200px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		color: var(--text-muted);
	}

	.htx-td--center {
		text-align: center;
	}

	.sort-arrow {
		margin-left: 0.25rem;
		font-size: var(--text-xs);
	}

	/* History timeline */
	.history-timeline {
		padding: var(--space-4) 0;
	}
	.timeline-month {
		margin-bottom: var(--space-5);
	}
	.timeline-month-label {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		margin-bottom: var(--space-4);
	}
	.timeline-month-name {
		font-size: var(--text-xs);
		font-weight: 600;
		color: var(--text-subtle);
		text-transform: uppercase;
		letter-spacing: 0.07em;
		flex-shrink: 0;
	}
	.timeline-month-line {
		flex: 1;
		height: 1px;
		background: var(--border);
	}
	.timeline-entry {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.875rem 0;
		border-bottom: 1px solid var(--border);
		cursor: default;
		transition: background 0.15s;
		position: relative;
	}
	.timeline-entry:first-child {
		border-top: 1px solid var(--border);
	}
	.timeline-entry:hover {
		background: var(--bg-subtle);
	}
	.timeline-dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: var(--text-subtle);
		flex-shrink: 0;
		transition:
			transform 0.15s,
			background 0.15s;
	}
	.timeline-entry:hover .timeline-dot {
		transform: scale(1.35);
	}
	.timeline-title {
		font-size: var(--text-base);
		font-weight: 500;
		color: var(--text);
	}
	.timeline-meta {
		font-size: var(--text-sm);
		color: var(--text-muted);
		font-family: var(--font-mono);
		font-variant-numeric: tabular-nums;
	}
	.timeline-cost {
		color: var(--text-subtle);
	}
	.entry-actions {
		position: relative;
		flex-shrink: 0;
		margin-left: auto;
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
		line-height: 1;
		cursor: pointer;
		opacity: 0;
		transition:
			opacity 0.15s,
			background 0.15s,
			border-color 0.15s;
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

	@media (max-width: 540px) {
		.entry-menu-btn {
			opacity: 1;
			width: 44px;
			height: 44px;
		}
		.page-actions {
			flex-wrap: wrap;
		}
		.view-toggle {
			width: 100%;
		}
		.view-toggle-btn {
			flex: 1;
			text-align: center;
		}
	}

	.empty {
		display: flex;
		flex-direction: column;
		align-items: center;
		text-align: center;
		padding: 3rem 1.5rem;
	}
	.empty-icon {
		font-size: 2rem;
		margin-bottom: 1rem;
		opacity: 0.5;
	}
	.empty-title {
		font-size: var(--text-lg);
		font-weight: 600;
		color: var(--text);
		margin: 0 0 0.5rem;
	}
	.empty-desc {
		font-size: var(--text-sm);
		color: var(--text-muted);
		margin: 0;
		line-height: var(--leading-base);
	}
</style>
