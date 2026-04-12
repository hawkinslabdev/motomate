<script lang="ts">
	import { untrack } from 'svelte';
	import { enhance } from '$app/forms';
	import { invalidateAll, beforeNavigate } from '$app/navigation';
	import type { PageData } from './$types';
	import TrackerCard from '$lib/components/ui/TrackerCard.svelte';
	import ConfirmDialog from '$lib/components/ui/ConfirmDialog.svelte';
	import { toasts } from '$lib/stores/toasts.js';
	import { _, waitLocale } from '$lib/i18n';
	import {
		formatNumber,
		formatDateShort,
		formatCurrency,
		formatYearMonth
	} from '$lib/utils/format.js';

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

	let loggingTracker = $state<string | null>(null);
	let recentlyLoggedId = $state<string | null>(null);
	let showAddTask = $state(false);
	let trackerMenu = $state<string | null>(null);
	let editingTracker = $state<string | null>(null);
	let editSubmitting = $state(false);
	let deletingTracker = $state<{ id: string; name: string } | null>(null);
	let historyTracker = $state<string | null>(null);
	let viewMode = $state<'current' | 'forecast' | 'history'>('current');
	let searchQuery = $state('');
	let sortBy = $state<'status' | 'name' | 'last'>(
		untrack(() => data.page_prefs?.sortBy ?? 'status')
	);
	let historySortBy = $state<'date' | 'name'>('date');

	// Persist sort preference
	let _prefTimer: ReturnType<typeof setTimeout>;
	let _pendingPrefs: object | null = null;
	let _firstRun = true;

	function flushPrefs() {
		if (!_pendingPrefs) return;
		const body = JSON.stringify({ page_prefs: { maintenance: _pendingPrefs } });
		_pendingPrefs = null;
		clearTimeout(_prefTimer);
		fetch('/api/prefs', {
			method: 'PATCH',
			keepalive: true,
			headers: { 'content-type': 'application/json' },
			body
		});
	}

	beforeNavigate(() => flushPrefs());

	$effect(() => {
		const s = sortBy;
		if (_firstRun) {
			_firstRun = false;
			return;
		}
		_pendingPrefs = { sortBy: s };
		clearTimeout(_prefTimer);
		_prefTimer = setTimeout(flushPrefs, 600);
	});
	let editingLog = $state<string | null>(null);
	let logMenu = $state<string | null>(null);

	const averageKmPerMonth = $derived(() => {
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

	const monthsOfUsage = $derived(() => {
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

	const trackerServiceLogs = $derived(() => {
		const map = new Map<string, typeof data.allServiceLogs>();
		for (const log of data.allServiceLogs ?? []) {
			if (log.tracker_id) {
				if (!map.has(log.tracker_id)) map.set(log.tracker_id, []);
				map.get(log.tracker_id)!.push(log);
			}
		}
		return map;
	});

	const filteredTrackers = $derived(() => {
		let trackers = [...data.trackers];
		if (searchQuery) {
			const q = searchQuery.toLowerCase();
			trackers = trackers.filter((t) => t.template.name.toLowerCase().includes(q));
		}
		return trackers;
	});

	const sortedTrackers = $derived(
		filteredTrackers().sort((a, b) => {
			if (sortBy === 'status') {
				const order: Record<string, number> = { overdue: 0, due: 1, ok: 2 };
				return (order[a.status] ?? 3) - (order[b.status] ?? 3);
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
	function startEditTracker(id: string) {
		editingTracker = id;
		trackerMenu = null;
		loggingTracker = null;
		historyTracker = null;
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
		const avgKm = averageKmPerMonth();
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
		if (form?.logged) {
			const justLogged = loggingTracker; // capture before clearing
			loggingTracker = null;
			recentlyLoggedId = justLogged;
			toasts.success($_('maintenance.toasts.logged'));
			setTimeout(() => {
				recentlyLoggedId = null;
			}, 1800);
		}
		if (form?.trackerUpdated) {
			toasts.success($_('maintenance.toasts.trackerUpdated'));
			editingTracker = null;
		}
		if (form?.trackerDeleted) {
			toasts.success($_('maintenance.toasts.trackerDeleted'));
			editingTracker = null;
			trackerMenu = null;
		}
		if (form?.added) {
			toasts.success($_('maintenance.toasts.taskAdded'));
			showAddTask = false;
			invalidateAll();
		}
		if (form?.error) {
			toasts.error(String(form.error));
		}
		if (form?.trackerError) {
			toasts.error(String(form.trackerError));
		}
		if (form?.taskError) {
			toasts.error(String(form.taskError));
		}
		if (form?.defaultsApplied) {
			toasts.success($_('maintenance.toasts.defaultsApplied'));
			invalidateAll();
		}
		if (form?.defaultsError) {
			toasts.error(String(form.defaultsError));
		}
	});

	function trackerById(id: string) {
		return data.trackers.find((t: (typeof data.trackers)[number]) => t.id === id);
	}

	function scrollOnMount(node: HTMLElement) {
		if (typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches) {
			requestAnimationFrame(() => {
				node.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
			});
		}
		return {};
	}

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

	$effect(() => {
		const id = editingLog;
		if (id && typeof window !== 'undefined') {
			requestAnimationFrame(() => {
				document.querySelector(`[data-edit-log="${id}"]`)?.scrollIntoView({
					behavior: 'smooth',
					block: 'center'
				});
			});
		}
	});

	$effect(() => {
		const id = editingTracker;
		if (id && typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches) {
			setTimeout(() => {
				document.querySelector(`[data-edit-form="${id}"]`)?.scrollIntoView({
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
		<p class="page-sub">{$_('maintenance.subtitle')}</p>
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
			onclick={() => (showAddTask = !showAddTask)}
		>
			{showAddTask ? $_('common.cancel') : $_('maintenance.addTask.button')}
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
						const tracker = data.trackers.find((t) => t.id === log.tracker_id);
						const name = tracker?.template.name?.toLowerCase() ?? '';
						return name.includes(q);
					});
				}
				return logs;
			})()}
			{@const historySorted = (() => {
				const logs = [...filteredHistory];
				if (historySortBy === 'name') {
					logs.sort((a, b) => {
						const trackA = data.trackers.find((t) => t.id === a.tracker_id)?.template.name ?? '';
						const trackB = data.trackers.find((t) => t.id === b.tracker_id)?.template.name ?? '';
						return trackA.localeCompare(trackB);
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
				{#each historyGrouped as [yearMonth, logs]}
					<div class="timeline-month">
						<div class="timeline-month-label">
							<span class="timeline-month-name">{formatYearMonth(yearMonth, locale)}</span>
							<span class="timeline-month-line"></span>
						</div>
						{#each logs as log}
							{@const tracker = data.trackers.find((t) => t.id === log.tracker_id)}
							<div class="timeline-entry" data-log-id={log.id}>
								<span class="timeline-dot"></span>
								<span class="timeline-title"
									>{log.notes?.split('\n')[0] ||
										tracker?.template.name ||
										$_('maintenance.history.serviceEntry')}</span
								>
								<span class="timeline-meta">
									{formatDateShort(log.performed_at, locale)} · {formatNumber(
										log.odometer_at_service,
										locale
									)}
									{data.vehicle.odometer_unit}
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
										aria-haspopup="true">⋮</button
									>
									{#if logMenu === log.id}
										<div class="entry-menu-dropdown" role="menu">
											<button
												role="menuitem"
												class="entry-menu-item"
												onclick={() => {
													editingLog = log.id;
													logMenu = null;
												}}>{$_('common.edit')}</button
											>
										</div>
									{/if}
								</div>
							</div>
							{#if editingLog === log.id}
								<div class="entry-edit-card" data-edit-log={log.id}>
									<form
										method="POST"
										action="?/editServiceLog"
										class="entry-edit-form"
										use:enhance={() => {
											editSubmitting = true;
											return async ({ update }) => {
												await update();
												editSubmitting = false;
												editingLog = null;
											};
										}}
									>
										<input type="hidden" name="id" value={log.id} />
										<div class="form-row">
											<label class="field">
												<span class="field-label">{$_('maintenance.editLog.date')}</span>
												<input
													type="date"
													name="performed_at"
													value={log.performed_at}
													class="input"
													required
												/>
											</label>
											<label class="field">
												<span class="field-label"
													>{$_('maintenance.editLog.odometer', {
														values: { unit: data.vehicle.odometer_unit }
													})}</span
												>
												<input
													type="number"
													name="odometer_at_service"
													min="0"
													value={log.odometer_at_service}
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
															<input
																type="checkbox"
																name="reset_trackers"
																value={t.id}
																checked={log.tracker_id === t.id}
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
											<span class="field-label">{$_('maintenance.editLog.notes')}</span>
											<input
												type="text"
												name="notes"
												maxlength="200"
												value={log.notes ?? ''}
												class="input"
											/>
										</label>
										<label class="field">
											<span class="field-label">{$_('maintenance.editLog.remark')}</span>
											<input
												type="text"
												name="remark"
												maxlength="200"
												value={log.remark ?? ''}
												class="input"
												placeholder={$_('maintenance.editLog.remarkPlaceholder')}
											/>
										</label>
										<label class="field">
											<span class="field-label">{$_('maintenance.editLog.cost')}</span>
											<input
												type="number"
												name="cost"
												min="0"
												step="0.01"
												value={log.cost_cents != null ? log.cost_cents / 100 : ''}
												class="input mono"
											/>
										</label>
										<div class="form-actions">
											<button type="submit" class="btn-primary" disabled={editSubmitting}>
												{editSubmitting ? $_('maintenance.saving') : $_('maintenance.editLog.save')}
											</button>
											<button type="button" class="btn-ghost" onclick={() => (editingLog = null)}
												>{$_('common.cancel')}</button
											>
										</div>
									</form>
								</div>
							{/if}
						{/each}
					</div>
				{/each}
			{/if}
		{/if}
	</div>
{:else if showAddTask && (viewMode === 'current' || viewMode === 'forecast')}
	<form method="POST" action="?/addTask" use:enhance use:scrollOnMount class="add-task-form">
		<div class="add-task-fields">
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
				<span class="field-label"
					>{$_('maintenance.addTask.fields.intervalKm', {
						values: { unit: data.vehicle.odometer_unit }
					})}</span
				>
				<input
					name="interval_km"
					type="number"
					min="1"
					placeholder={$_('maintenance.addTask.placeholders.km')}
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
		<div class="add-task-actions">
			<button type="submit" class="btn-primary">{$_('maintenance.addTask.submit')}</button>
			<button type="button" class="btn-ghost" onclick={() => (showAddTask = false)}
				>{$_('common.cancel')}</button
			>
		</div>
	</form>
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
			<div class="tracker-item">
				<div class="tracker-card-row">
					<TrackerCard
						{tracker}
						vehicleUnit={data.vehicle.odometer_unit}
						{locale}
						serviceLogs={trackerServiceLogs().get(t.id) ?? []}
						showHistory={historyTracker === t.id}
						forecastMode={viewMode === 'forecast'}
						forecastData={viewMode === 'forecast' ? getKmForecast(t) : null}
						forecastDateEstimate={viewMode === 'forecast'
							? (() => {
									const d = getForecastDate(t);
									return d ? formatDateShort(d, locale) : null;
								})()
							: null}
						monthsOfUsage={monthsOfUsage()}
						isLogging={loggingTracker === t.id}
						isRecentlyLogged={recentlyLoggedId === t.id}
						onlogclick={(id) => {
							loggingTracker = loggingTracker === id ? null : id;
							historyTracker = null;
							editingTracker = null;
						}}
						onhistoryclick={(id) => {
							historyTracker = historyTracker === id ? null : id;
							loggingTracker = null;
							editingTracker = null;
						}}
						onoptionsclick={(id) => {
							loggingTracker = null;
							historyTracker = null;
							toggleTrackerMenu(id);
						}}
					/>

					{#if trackerMenu === t.id}
						<div class="tracker-menu-dropdown" role="menu">
							<button
								role="menuitem"
								class="tracker-menu-item"
								onclick={() => startEditTracker(t.id)}>{$_('common.edit')}</button
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

				<!-- Edit tracker state form -->
				<div class="expand-wrap" class:open={editingTracker === t.id}>
					<div class="expand-inner">
						{#if editingTracker === t.id}
							{@const et = trackerById(t.id)}
							{#if et}
								<form
									method="POST"
									action="?/updateTracker"
									class="edit-tracker-form"
									data-edit-form={t.id}
									use:enhance={() => {
										editSubmitting = true;
										return async ({ update }) => {
											await update();
											editSubmitting = false;
										};
									}}
								>
									<input type="hidden" name="id" value={t.id} />

									<div class="edit-section">
										<span class="edit-section-label"
											>{$_('maintenance.editTracker.sections.interval')}</span
										>
										<div class="edit-row">
											<label class="field">
												<span class="field-label"
													>{$_('maintenance.editTracker.fields.everyKm', {
														values: { unit: data.vehicle.odometer_unit }
													})}</span
												>
												<input
													type="number"
													name="interval_km"
													min="1"
													value={et.template.interval_km ?? ''}
													placeholder="e.g. 5000"
													class="input mono"
												/>
											</label>
											<label class="field">
												<span class="field-label"
													>{$_('maintenance.editTracker.fields.everyMonths')}</span
												>
												<input
													type="number"
													name="interval_months"
													min="1"
													value={et.template.interval_months ?? ''}
													placeholder="e.g. 12"
													class="input mono"
												/>
											</label>
										</div>
									</div>

									<div class="edit-section">
										<span class="edit-section-label"
											>{$_('maintenance.editTracker.sections.lastServiced')}</span
										>
										<div class="edit-row">
											<label class="field">
												<span class="field-label">{$_('maintenance.editTracker.fields.date')}</span>
												<input
													type="date"
													name="last_done_at"
													value={et.last_done_at ?? ''}
													class="input"
												/>
											</label>
											<label class="field">
												<span class="field-label"
													>{$_('maintenance.editTracker.fields.odometer', {
														values: { unit: data.vehicle.odometer_unit }
													})}</span
												>
												<input
													type="number"
													name="last_done_odometer"
													min="0"
													value={et.last_done_odometer ?? ''}
													class="input mono"
												/>
											</label>
										</div>
									</div>

									<div class="edit-section">
										<span class="edit-section-label"
											>{$_('maintenance.editTracker.sections.nextDue')}
											<span class="field-hint"
												>{$_('maintenance.editTracker.fields.autoCompute')}</span
											></span
										>
										<div class="edit-row">
											<label class="field">
												<span class="field-label"
													>{$_('maintenance.editTracker.fields.odometer', {
														values: { unit: data.vehicle.odometer_unit }
													})}</span
												>
												<input
													type="number"
													name="next_due_odometer"
													min="0"
													value={et.next_due_odometer ?? ''}
													placeholder="auto"
													class="input mono"
												/>
											</label>
											<label class="field">
												<span class="field-label">{$_('maintenance.editTracker.fields.date')}</span>
												<input
													type="date"
													name="next_due_at"
													value={et.next_due_at ?? ''}
													class="input"
												/>
											</label>
										</div>
									</div>

									<div class="edit-actions">
										<button type="submit" class="btn-primary" disabled={editSubmitting}>
											{editSubmitting
												? $_('maintenance.saving')
												: $_('maintenance.editTracker.submit')}
										</button>
										<button type="button" class="btn-ghost" onclick={() => (editingTracker = null)}
											>{$_('maintenance.addTask.cancel')}</button
										>
									</div>
								</form>
							{/if}
						{/if}
					</div>
				</div>

				<!-- Log service entry form -->
				<div class="expand-wrap" class:open={loggingTracker === t.id}>
					<div class="expand-inner">
						<form
							method="POST"
							action="?/log"
							use:enhance
							class="log-form"
							data-log-form={t.id}
							onsubmit={() => (loggingTracker = null)}
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
									<span class="field-label"
										>{$_('vehicle.forms.fields.odometer', {
											values: { unit: data.vehicle.odometer_unit }
										})}</span
									>
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
								<button type="submit" class="btn-primary"
									>{$_('vehicle.forms.submit.service')}</button
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
	.page-sub {
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

	/* Add task form */
	.add-task-form {
		border: 1px solid var(--border);
		border-radius: 8px;
		background: var(--bg-subtle);
		padding: 1.25rem;
		margin-bottom: 1.25rem;
		display: flex;
		flex-direction: column;
		gap: 0.875rem;
		scroll-margin-top: 1rem;
	}
	.add-task-fields {
		display: grid;
		grid-template-columns: 2fr 1fr 1fr;
		gap: 0.75rem;
	}
	.add-task-actions {
		display: flex;
		gap: 0.5rem;
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

	/* Tracker list — open, no outer box */
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

	/* Edit tracker form */
	.edit-tracker-form {
		padding: 1.25rem;
		background: var(--bg-subtle);
		border-top: 1px solid var(--border);
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
		scroll-margin-top: 1rem;
	}
	.edit-section {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.edit-section-label {
		font-size: var(--text-xs);
		font-weight: 600;
		color: var(--text-subtle);
		text-transform: uppercase;
		letter-spacing: 0.07em;
	}
	.field-hint {
		text-transform: none;
		font-weight: 400;
		letter-spacing: 0;
		color: var(--text-subtle);
	}
	.edit-row {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.75rem;
	}
	.edit-actions {
		display: flex;
		gap: 0.5rem;
		padding-top: 0.125rem;
	}

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
	.log-actions {
		display: flex;
		gap: 0.5rem;
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
