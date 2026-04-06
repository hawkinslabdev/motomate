<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/stores';
	import { replaceState } from '$app/navigation';
	import type { PageData } from './$types';
	import ConfirmDialog from '$lib/components/ui/ConfirmDialog.svelte';
	import { _, waitLocale } from '$lib/i18n';
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

	function openForm(kind: 'service' | 'odometer' | 'note') {
		menuOpen = false;
		activeForm = kind;
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
	let deletingEntry = $state<{ id: string; kind: 'service' | 'odometer' | 'note' } | null>(null);

	function toggleEntryMenu(id: string) {
		entryMenu = entryMenu === id ? null : id;
	}
	function startEdit(id: string, kind: 'service' | 'odometer' | 'note') {
		editingEntry = { id, kind };
		entryMenu = null;
	}

	$effect(() => {
		if (form?.logged || form?.odoUpdated || form?.noteLogged) {
			activeForm = null;
			menuOpen = false;
		}
		if ((form as any)?.editedLog || (form as any)?.deletedLog) {
			editingEntry = null;
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

	// ── Combined timeline (newest first) ──────────────────────────────────────
	type Entry =
		| { kind: 'service'; date: string; odometer: number; log: (typeof data.logs)[0] }
		| { kind: 'odometer'; date: string; odometer: number; log: (typeof data.odoLogs)[0] }
		| { kind: 'note'; date: string; odometer: number; log: (typeof data.odoLogs)[0] };

	const allEntries = $derived((): Entry[] => {
		const entries: Entry[] = [
			...data.logs.map((log: (typeof data.logs)[number]) => ({
				kind: 'service' as const,
				date: log.performed_at,
				odometer: log.odometer_at_service,
				log
			})),
			...data.odoLogs.map((log: (typeof data.odoLogs)[number]) => {
				if (log.kind === 'note') {
					return { kind: 'note' as const, date: log.recorded_at, odometer: log.odometer, log };
				}
				return { kind: 'odometer' as const, date: log.recorded_at, odometer: log.odometer, log };
			})
		];
		return entries.sort((a, b) => {
			const dateCmp = b.date.localeCompare(a.date);
			if (dateCmp !== 0) return dateCmp;
			return b.log.created_at.localeCompare(a.log.created_at);
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

	const hasHistory = $derived(data.logs.length > 0 || data.odoLogs.length > 0);

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

	// ── Helpers for edit form initial values ──────────────────────────────────
	function serviceLogById(id: string) {
		return data.logs.find((l: (typeof data.logs)[number]) => l.id === id);
	}
	function odoLogById(id: string) {
		return data.odoLogs.find((l: (typeof data.odoLogs)[number]) => l.id === id);
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
		<button
			class="btn-primary log-trigger"
			onclick={() => (menuOpen = !menuOpen)}
			aria-haspopup="true"
			aria-expanded={menuOpen}
		>
			+ {$_('common.add')}
		</button>

		{#if menuOpen}
			<div class="log-backdrop" role="presentation" onclick={() => (menuOpen = false)}></div>

			<div class="log-menu-items" role="menu">
				<button role="menuitem" class="menu-item" onclick={() => openForm('service')}>
					<span class="menu-item-label">{$_('layout.addEntry.maintenance')}</span>
					<span class="menu-item-desc">{$_('layout.addEntry.maintenanceDesc')}</span>
				</button>

				<button role="menuitem" class="menu-item" onclick={() => openForm('odometer')}>
					<span class="menu-item-label">{$_('layout.addEntry.mileage')}</span>
					<span class="menu-item-desc">{$_('layout.addEntry.mileageDesc')}</span>
				</button>

				<button role="menuitem" class="menu-item" onclick={() => openForm('note')}>
					<span class="menu-item-label">{$_('vehicle.forms.writeNote')}</span>
					<span class="menu-item-desc">{$_('vehicle.forms.noteDesc')}</span>
				</button>
			</div>
		{/if}
	</div>
</div>

<div class="page-content">
	{#if activeForm === 'service'}
		<form
			method="POST"
			action="?/logService"
			class="inline-form"
			use:enhance={() => {
				submitting = true;
				return async ({ update }) => {
					await update();
					submitting = false;
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
			{#if (form as any)?.warning}
				<div class="form-warning">{(form as any).warning}</div>
			{/if}
			<div class="form-row">
				<label class="field">
					<span class="field-label"
						>{$_('vehicle.forms.fields.currentReading', { values: { unit } })}</span
					>
					<input
						type="number"
						name="odometer"
						value={data.vehicle.current_odometer}
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

	<!-- ── Upcoming section ── -->
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
						<a href="/vehicles/{data.vehicle.id}/maintenance" class="upcoming-log-link"
							>{$_('vehicle.detail.logLink')}</a
						>
					</div>
				{/each}
			</div>
		</section>
	{/if}

	<!-- ── Timeline ── -->
	{#if !hasHistory}
		<div class="empty">
			<div class="empty-icon" aria-hidden="true">📋</div>
			<p class="empty-title">{$_('vehicle.detail.timeline.empty.title')}</p>
			<p class="empty-desc">{$_('vehicle.detail.timeline.empty.description')}</p>
		</div>
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
							<div class="timeline-entry">
								<div class="entry-icon service-dot" title="Service" aria-hidden="true"></div>
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
							{/if}
						{:else if entry.kind === 'note'}
							{@const log = entry.log}
							<div class="timeline-entry note-entry">
								<div class="entry-icon note-dot" title="Note" aria-hidden="true"></div>
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
						{:else}
							{@const log = entry.log}
							<div class="timeline-entry odo-entry">
								<div class="entry-icon odo-dot" title="Mileage" aria-hidden="true"></div>
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
										<span class="field-label">Remark <span class="muted">(optional)</span></span>
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
			form.action = entry.kind === 'service' ? '?/deleteServiceLog' : '?/deleteOdometerLog';
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
		align-items: center;
		flex-shrink: 0;
		position: relative;
	}

	/* ── Log dropdown ── */
	.log-trigger {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.5rem 0.875rem;
		background: var(--accent);
		color: #fff;
		border: none;
		border-radius: 10px;
		font-size: var(--text-sm);
		font-weight: 500;
		cursor: pointer;
	}
	.log-trigger:hover {
		background: var(--accent-hover);
	}

	.log-backdrop {
		position: fixed;
		inset: 0;
		z-index: 10;
	}
	.log-menu-items {
		position: absolute;
		right: 0;
		top: calc(100% + 0.375rem);
		background: var(--bg);
		border: 1px solid var(--border-strong);
		border-radius: 8px;
		box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
		z-index: 20;
		min-width: 200px;
		padding: 0.375rem;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.menu-item {
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
	.menu-item:hover {
		background: var(--bg-muted);
	}
	.menu-item-label {
		font-size: var(--text-sm);
		font-weight: 500;
		color: var(--text);
	}
	.menu-item-desc {
		font-size: var(--text-xs);
		color: var(--text-muted);
		margin-top: 1px;
	}

	/* ── Inline forms ── */
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
	.muted {
		font-weight: 400;
		color: var(--text-subtle);
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

	/* ── Tracker checkboxes ── */
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

	/* ── Upcoming ── */
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

	/* ── Timeline ── */
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
		letter-spacing: 0.08em;
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
		width: 8px;
		height: 8px;
		border-radius: 50%;
		flex-shrink: 0;
		margin-top: 0.375rem;
		transition: transform 0.15s ease-out-quart;
	}
	.service-dot {
		background: var(--text-subtle);
	}
	.odo-dot {
		background: var(--bg);
		border: 2px solid var(--border-strong);
	}
	.note-dot {
		background: transparent;
		border: 2px solid var(--text-subtle);
	}
	.timeline-entry:first-of-type .service-dot {
		background: var(--accent);
	}
	.timeline-entry:first-of-type .odo-dot,
	.timeline-entry:first-of-type .note-dot {
		border-color: var(--accent);
	}
	.timeline-entry:hover .entry-icon {
		transform: scale(1.35);
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
		align-self: flex-start;
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
	/* ── Entry ⋮ menu ── */
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
		width: 28px;
		height: 28px;
		background: none;
		border: 1px solid transparent;
		border-radius: 4px;
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

	/* ── Inline edit form (appears below entry) ── */
	.entry-edit-form {
		border: 1px solid var(--border);
		border-radius: 8px;
		background: var(--bg-subtle);
		padding: 1rem 1.25rem;
		margin: 0 0 0 1.25rem;
		display: flex;
		flex-direction: column;
		gap: 0.875rem;
	}

	/* ── Empty ── */
	.empty {
		display: flex;
		flex-direction: column;
		align-items: center;
		text-align: center;
		padding: 4rem var(--space-5);
	}
	.empty-icon {
		font-size: 3rem;
		margin-bottom: 1rem;
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

	/* ── Collapse toggle ── */
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
		}
	}
</style>
