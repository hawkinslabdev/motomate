<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageData } from './$types';
	import type { RuleTrigger } from '$lib/db/schema.js';
	import type { NextFireInfo } from '$lib/workflow/preview-core.js';
	import { lastFiredAt } from '$lib/workflow/engine-utils.js';
	import { _, waitLocale } from '$lib/i18n';
	import { formatDateTime, formatDateLong } from '$lib/utils/format';
	import ConfirmDialog from '$lib/components/ui/ConfirmDialog.svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import { toasts } from '$lib/stores/toasts.svelte.js';

	let { data } = $props<{ data: PageData }>();

	$effect(() => {
		waitLocale();
	});

	// Optimistic toggle state
	let optimistic = $state<Record<string, boolean>>({});

	function isEnabled(rule: PageData['rules'][number]): boolean {
		return optimistic[rule.id] ?? rule.enabled;
	}

	function triggerSummary(rule: PageData['rules'][number]): string {
		const t = rule.trigger;
		switch (t.type) {
			case 'odometer_upcoming':
				return `${t.km_before} km ${$_('settings.workflows.trigger.beforeDue')}`;
			case 'odometer_overdue':
				return t.km_past === 0
					? $_('settings.workflows.trigger.whenOverdue')
					: `${t.km_past} km ${$_('settings.workflows.trigger.pastDue')}`;
			case 'date_upcoming':
				return `${t.days_before} ${$_('settings.workflows.trigger.daysBefore')}`;
			case 'date_overdue':
				return `${t.days_past} ${$_('settings.workflows.trigger.daysPast')}`;
			case 'calendar_date':
				return `${$_('settings.workflows.trigger.every')} ${t.day}/${t.month}`;
			case 'no_odometer_update':
				return `${$_('settings.workflows.trigger.noOdo')} ${t.days} ${$_('settings.workflows.trigger.days')}`;
			case 'document_expiring':
				return `${$_('settings.workflows.trigger.docExpiring')} ${t.days_before} ${$_('settings.workflows.trigger.days')}`;
			default:
				return $_('settings.workflows.trigger.unknown');
		}
	}

	// Inline trigger editing
	let editingRuleId = $state<string | null>(null);

	// Local copy of the trigger being edited
	let editTrigger = $state<RuleTrigger | null>(null);

	function startEdit(rule: PageData['rules'][number]) {
		editingRuleId = rule.id;
		editTrigger = structuredClone(rule.trigger);
	}

	function cancelEdit() {
		editingRuleId = null;
		editTrigger = null;
	}

	// Helpers to get/set numeric trigger fields safely
	function getTriggerNum(field: string): number {
		if (!editTrigger) return 0;
		return ((editTrigger as Record<string, unknown>)[field] as number) ?? 0;
	}

	function setTriggerNum(field: string, value: number) {
		if (!editTrigger) return;
		(editTrigger as Record<string, unknown>)[field] = value;
	}

	function lastFiredText(firedAt: string | null): string {
		if (!firedAt) return $_('settings.workflows.neverFired');
		return $_('settings.workflows.lastFired', {
			values: {
				date: formatDateTime(firedAt, data.user?.settings?.locale ?? 'en', data.user?.timezone)
			}
		});
	}

	function nextFireLabel(info: NextFireInfo): string {
		const locale = data.user?.settings?.locale ?? 'en';
		const tz = data.user?.timezone;
		switch (info.kind) {
			case 'ready':
				return $_('settings.notifications.scheduledRules.ready');
			case 'cooldown':
				return $_('settings.notifications.scheduledRules.cooldown', {
					values: { date: formatDateTime(info.until, locale, tz) }
				});
			case 'waiting':
				return $_('settings.notifications.scheduledRules.waiting');
			case 'measurement': {
				const base = $_('settings.notifications.scheduledRules.inMeasurement', {
					values: { value: info.remaining, unit: info.unit }
				});
				return info.trackerName
					? `${base} ${$_('settings.notifications.scheduledRules.trackerLabel', { values: { tracker: info.trackerName } })}`
					: base;
			}
			case 'date': {
				const base = $_('settings.notifications.scheduledRules.onDate', {
					values: { date: formatDateLong(info.fireAt.slice(0, 10), locale) }
				});
				return info.trackerName
					? `${base} ${$_('settings.notifications.scheduledRules.trackerLabel', { values: { tracker: info.trackerName } })}`
					: base;
			}
			case 'none':
			default:
				return $_('settings.notifications.scheduledRules.noData');
		}
	}

	let expandedLastId = $state<string | null>(null);

	function closeLastFiredTooltip(e: MouseEvent) {
		if (!expandedLastId) return;
		if ((e.target as HTMLElement).closest?.('.rule-last')) return;
		expandedLastId = null;
	}

	// Delete confirmation
	let deletingRule = $state<PageData['rules'][number] | null>(null);
	let deleteLoading = $state(false);

	// Per-vehicle exclusion picker
	let excludingRule = $state<PageData['rules'][number] | null>(null);
	let excludedDraft = $state<Set<string>>(new Set());
	let excludeSaving = $state(false);

	function openExcludeVehicles(rule: PageData['rules'][number]) {
		excludingRule = rule;
		excludedDraft = new Set(rule.excluded_vehicle_ids);
	}

	function closeExcludeVehicles() {
		excludingRule = null;
	}

	function toggleExcludedVehicle(vehicleId: string) {
		const next = new Set(excludedDraft);
		if (next.has(vehicleId)) next.delete(vehicleId);
		else next.add(vehicleId);
		excludedDraft = next;
	}

	// Run check now
	let runningCheck = $state(false);

	async function runCheck() {
		runningCheck = true;
		try {
			await fetch('/api/maintenance/check', { method: 'POST' });
			toasts.success($_('settings.workflows.runCheckDone'));
		} finally {
			runningCheck = false;
		}
	}
</script>

<svelte:window onclick={closeLastFiredTooltip} />

<svelte:head>
	<title>{$_('settings.workflows.title')} · {$_('layout.nav.settings')}</title>
</svelte:head>

<div class="intro">
	<h2 class="section-title">{$_('settings.workflows.title')}</h2>
	<p class="section-desc">{$_('settings.workflows.subtitle')}</p>
</div>

{#if data.rules.length === 0}
	<p class="empty-msg">{$_('settings.workflows.empty')}</p>
{:else}
	<div class="rule-list">
		{#each data.rules as rule}
			{@const firedAt = lastFiredAt(rule.last_triggered_at)}
			<div class="rule-row">
				<div class="rule-row-top">
					<!-- Toggle -->
					<form
						method="POST"
						action="?/toggle"
						use:enhance={({ formData }) => {
							const id = formData.get('id') as string;
							const val = formData.get('enabled') === 'true';
							optimistic[id] = val;
							return async ({ result, update }) => {
								if (result.type !== 'success') delete optimistic[id];
								await update({ reset: false });
							};
						}}
					>
						<input type="hidden" name="id" value={rule.id} />
						<input type="hidden" name="enabled" value={String(!isEnabled(rule))} />
						<button
							type="submit"
							class="toggle-btn"
							class:toggle-btn--on={isEnabled(rule)}
							aria-label="{isEnabled(rule) ? 'Disable' : 'Enable'} rule"
						>
							<span class="toggle-thumb"></span>
						</button>
					</form>

					<div class="rule-info">
						<div class="rule-name" class:rule-name--muted={!isEnabled(rule)}>{$_(rule.name)}</div>
						<div class="rule-meta">
							<span>{triggerSummary(rule)}</span>
							<span class="sep">·</span>
							<span>{$_('settings.workflows.allChannels')}</span>
						</div>
						<div
							class="rule-last"
							role="button"
							tabindex="0"
							aria-expanded={expandedLastId === rule.id}
							onclick={(e) => {
								if ((e.target as HTMLElement).closest('.rule-last-popover')) return;
								expandedLastId = expandedLastId === rule.id ? null : rule.id;
							}}
							onkeydown={(e) => {
								if (e.key === 'Enter' || e.key === ' ')
									expandedLastId = expandedLastId === rule.id ? null : rule.id;
							}}
						>
							<span class="rule-last-fired" title={lastFiredText(firedAt)}
								>{lastFiredText(firedAt)}</span
							>
							<span class="sep">·</span>
							<span
								class="rule-next-fire"
								class:rule-next-fire--ready={rule.nextFire.kind === 'ready'}
								title={nextFireLabel(rule.nextFire)}
								>{$_('settings.workflows.nextFire')}: {nextFireLabel(rule.nextFire)}</span
							>

							{#if expandedLastId === rule.id}
								<div class="rule-last-popover" role="tooltip">
									<div class="rule-last-popover-line">{lastFiredText(firedAt)}</div>
									<div class="rule-last-popover-line">
										{$_('settings.workflows.nextFire')}: {nextFireLabel(rule.nextFire)}
									</div>
								</div>
							{/if}
						</div>
					</div>

					<div class="rule-actions">
						<button
							type="button"
							class="icon-btn"
							onclick={() => (editingRuleId === rule.id ? cancelEdit() : startEdit(rule))}
							aria-label={editingRuleId === rule.id
								? $_('settings.workflows.editCancel')
								: $_('settings.workflows.editBtn')}
							title={editingRuleId === rule.id
								? $_('settings.workflows.editCancel')
								: $_('settings.workflows.editBtn')}
						>
							{#if editingRuleId === rule.id}
								<svg
									width="14"
									height="14"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="2"
									stroke-linecap="round"
									stroke-linejoin="round"
									aria-hidden="true"
								>
									<path d="M18 6L6 18M6 6l12 12" />
								</svg>
							{:else}
								<svg
									width="14"
									height="14"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="2"
									stroke-linecap="round"
									stroke-linejoin="round"
									aria-hidden="true"
								>
									<path d="M12 20h9" />
									<path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
								</svg>
							{/if}
						</button>

						<button
							type="button"
							class="icon-btn"
							onclick={() => openExcludeVehicles(rule)}
							aria-label={$_('settings.workflows.excludeVehiclesBtn')}
							title={$_('settings.workflows.excludeVehiclesBtn')}
						>
							<svg
								width="14"
								height="14"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
								stroke-linecap="round"
								stroke-linejoin="round"
								aria-hidden="true"
							>
								<circle cx="12" cy="12" r="3" />
								<path
									d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"
								/>
							</svg>
						</button>

						<button
							type="button"
							class="icon-btn icon-btn--danger"
							onclick={() => (deletingRule = rule)}
							aria-label={$_('settings.workflows.delete')}
							title={$_('settings.workflows.delete')}
						>
							<svg
								width="14"
								height="14"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
								stroke-linecap="round"
								stroke-linejoin="round"
								aria-hidden="true"
							>
								<polyline points="3 6 5 6 21 6" />
								<path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
								<path d="M10 11v6" />
								<path d="M14 11v6" />
								<path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
							</svg>
						</button>
					</div>
				</div>

				<!-- Inline trigger edit form -->
				{#if editingRuleId === rule.id && editTrigger}
					<div class="edit-wrap">
						<form
							method="POST"
							action="?/editTrigger"
							use:enhance={() => {
								return async ({ result, update }) => {
									await update({ reset: false });
									if (result.type === 'success') {
										editingRuleId = null;
										editTrigger = null;
									}
								};
							}}
						>
							<input type="hidden" name="id" value={rule.id} />
							<input type="hidden" name="trigger" value={JSON.stringify(editTrigger)} />

							<div class="edit-fields">
								{#if editTrigger.type === 'odometer_upcoming'}
									<label class="edit-label" for="edit-km-before">
										{$_('settings.workflows.edit.kmBefore')}
									</label>
									<input
										id="edit-km-before"
										type="number"
										min="1"
										class="edit-input"
										value={getTriggerNum('km_before')}
										oninput={(e) =>
											setTriggerNum(
												'km_before',
												parseInt((e.target as HTMLInputElement).value) || 0
											)}
									/>
								{:else if editTrigger.type === 'odometer_overdue'}
									<label class="edit-label" for="edit-km-past">
										{$_('settings.workflows.edit.kmPast')}
									</label>
									<input
										id="edit-km-past"
										type="number"
										min="0"
										class="edit-input"
										value={getTriggerNum('km_past')}
										oninput={(e) =>
											setTriggerNum('km_past', parseInt((e.target as HTMLInputElement).value) || 0)}
									/>
								{:else if editTrigger.type === 'date_upcoming'}
									<label class="edit-label" for="edit-days-before">
										{$_('settings.workflows.edit.daysBefore')}
									</label>
									<input
										id="edit-days-before"
										type="number"
										min="1"
										class="edit-input"
										value={getTriggerNum('days_before')}
										oninput={(e) =>
											setTriggerNum(
												'days_before',
												parseInt((e.target as HTMLInputElement).value) || 0
											)}
									/>
								{:else if editTrigger.type === 'date_overdue'}
									<label class="edit-label" for="edit-days-past">
										{$_('settings.workflows.edit.daysPast')}
									</label>
									<input
										id="edit-days-past"
										type="number"
										min="0"
										class="edit-input"
										value={getTriggerNum('days_past')}
										oninput={(e) =>
											setTriggerNum(
												'days_past',
												parseInt((e.target as HTMLInputElement).value) || 0
											)}
									/>
								{:else if editTrigger.type === 'calendar_date'}
									<div class="edit-row">
										<div>
											<label class="edit-label" for="edit-month"
												>{$_('settings.workflows.edit.month')}</label
											>
											<input
												id="edit-month"
												type="number"
												min="1"
												max="12"
												class="edit-input edit-input--short"
												value={getTriggerNum('month')}
												oninput={(e) =>
													setTriggerNum(
														'month',
														parseInt((e.target as HTMLInputElement).value) || 1
													)}
											/>
										</div>
										<div>
											<label class="edit-label" for="edit-day"
												>{$_('settings.workflows.edit.day')}</label
											>
											<input
												id="edit-day"
												type="number"
												min="1"
												max="31"
												class="edit-input edit-input--short"
												value={getTriggerNum('day')}
												oninput={(e) =>
													setTriggerNum('day', parseInt((e.target as HTMLInputElement).value) || 1)}
											/>
										</div>
									</div>
								{:else if editTrigger.type === 'no_odometer_update'}
									<label class="edit-label" for="edit-days">
										{$_('settings.workflows.edit.days')}
									</label>
									<input
										id="edit-days"
										type="number"
										min="1"
										class="edit-input"
										value={getTriggerNum('days')}
										oninput={(e) =>
											setTriggerNum('days', parseInt((e.target as HTMLInputElement).value) || 0)}
									/>
								{:else if editTrigger.type === 'document_expiring'}
									<label class="edit-label" for="edit-doc-days-before">
										{$_('settings.workflows.edit.daysBefore')}
									</label>
									<input
										id="edit-doc-days-before"
										type="number"
										min="1"
										class="edit-input"
										value={getTriggerNum('days_before')}
										oninput={(e) =>
											setTriggerNum(
												'days_before',
												parseInt((e.target as HTMLInputElement).value) || 0
											)}
									/>
								{/if}
							</div>

							<div class="edit-actions">
								<button type="submit" class="edit-save-btn">
									{$_('settings.workflows.editSave')}
								</button>
								<button type="button" class="edit-cancel-btn" onclick={cancelEdit}>
									{$_('settings.workflows.editCancel')}
								</button>
							</div>
						</form>
					</div>
				{/if}
			</div>
		{/each}
	</div>
{/if}

<div class="action-card">
	<span class="action-title">{$_('settings.workflows.actions.title')}</span>
	<span class="action-desc">{$_('settings.workflows.actions.description')}</span>
	<div class="action-row">
		<form method="POST" action="?/seedPresets" use:enhance>
			<button type="submit" class="save-btn">{$_('settings.workflows.loadPresets')}</button>
		</form>
		<button type="button" class="test-btn" onclick={runCheck} disabled={runningCheck}>
			{runningCheck ? $_('common.loading') : $_('settings.workflows.runCheck')}
		</button>
	</div>
</div>

<!-- Delete confirmation dialog -->
{#if deletingRule}
	<form
		id="delete-rule-form"
		method="POST"
		action="?/delete"
		use:enhance={() => {
			deleteLoading = true;
			return async ({ update }) => {
				await update();
				deleteLoading = false;
				deletingRule = null;
				toasts.success($_('settings.workflows.deleted'));
			};
		}}
	>
		<input type="hidden" name="id" value={deletingRule.id} />
	</form>

	<ConfirmDialog
		open={!!deletingRule}
		title={$_('settings.workflows.confirmDelete')}
		description={$_('settings.workflows.confirmDeleteDesc', {
			values: { name: $_(deletingRule.name) }
		})}
		confirmLabel={$_('settings.workflows.delete')}
		cancelLabel={$_('common.cancel')}
		danger={true}
		loading={deleteLoading}
		onconfirm={() => {
			const form = document.getElementById('delete-rule-form') as HTMLFormElement;
			form?.requestSubmit();
		}}
		onclose={() => (deletingRule = null)}
	/>
{/if}

{#if excludingRule}
	<form
		id="exclude-vehicles-form"
		method="POST"
		action="?/setExcludedVehicles"
		use:enhance={() => {
			excludeSaving = true;
			return async ({ update }) => {
				await update({ reset: false });
				excludeSaving = false;
				excludingRule = null;
				toasts.success($_('settings.workflows.excludeVehiclesSaved'));
			};
		}}
	>
		<input type="hidden" name="id" value={excludingRule.id} />
		<input type="hidden" name="excluded_vehicle_ids" value={JSON.stringify([...excludedDraft])} />
	</form>

	<Modal
		open={!!excludingRule}
		title={$_('settings.workflows.excludeVehiclesTitle')}
		onclose={closeExcludeVehicles}
	>
		<p class="exclude-desc">{$_('settings.workflows.excludeVehiclesDesc')}</p>
		{#if data.vehicles.length === 0}
			<p class="exclude-empty">{$_('settings.workflows.excludeVehiclesEmpty')}</p>
		{:else}
			<ul class="exclude-list">
				{#each data.vehicles as vehicle (vehicle.id)}
					<li class="exclude-item">
						<button
							type="button"
							class="exclude-row"
							onclick={() => toggleExcludedVehicle(vehicle.id)}
							aria-pressed={!excludedDraft.has(vehicle.id)}
						>
							<span class="exclude-name">{vehicle.name}</span>
							<span
								class="toggle-btn"
								class:toggle-btn--on={!excludedDraft.has(vehicle.id)}
								aria-hidden="true"
							>
								<span class="toggle-thumb"></span>
							</span>
						</button>
					</li>
				{/each}
			</ul>
		{/if}
		{#snippet footer()}
			<button type="button" class="edit-cancel-btn" onclick={closeExcludeVehicles}>
				{$_('common.cancel')}
			</button>
			<button
				type="button"
				class="edit-save-btn"
				disabled={excludeSaving}
				onclick={() => {
					const form = document.getElementById('exclude-vehicles-form') as HTMLFormElement;
					form?.requestSubmit();
				}}
			>
				{excludeSaving ? $_('common.saving') : $_('common.save')}
			</button>
		{/snippet}
	</Modal>
{/if}

<style>
	.intro {
		margin-bottom: var(--space-5);
	}
	.section-title {
		font-size: var(--text-2xl);
		font-weight: 600;
		color: var(--text);
		margin: 0 0 var(--space-2);
		letter-spacing: -0.02em;
	}
	.section-desc {
		font-size: var(--text-sm);
		color: var(--text-muted);
		line-height: var(--leading-base);
		margin: 0;
	}

	/* Page actions */
	.action-card {
		border-radius: 10px;
		padding: 1.25rem 1.5rem;
		border: 1px solid var(--border);
		background: var(--bg);
		margin-top: var(--space-5);
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
		transition: border-color 0.15s;
	}
	.action-card:hover {
		border-color: var(--border-strong);
	}
	.action-title {
		font-size: var(--text-base);
		font-weight: 500;
		color: var(--text);
	}
	.action-desc {
		font-size: var(--text-sm);
		color: var(--text-muted);
		line-height: var(--leading-snug);
	}
	.action-row {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		margin-top: var(--space-4);
		padding-top: var(--space-4);
		border-top: 1px solid var(--border);
		flex-wrap: wrap;
	}
	.save-btn {
		padding: 0.5rem 1rem;
		background: var(--accent);
		color: #fff;
		border: none;
		border-radius: 10px;
		font-size: var(--text-sm);
		font-weight: 500;
		cursor: pointer;
		transition: background 0.15s;
	}
	.save-btn:hover:not(:disabled) {
		background: var(--accent-hover);
	}
	.test-btn {
		padding: 0.375rem 0.75rem;
		font-size: var(--text-sm);
		font-weight: 500;
		border-radius: 6px;
		cursor: pointer;
		background: none;
		border: 1px solid var(--border);
		color: var(--text-muted);
		transition:
			background 0.15s,
			border-color 0.15s;
	}
	.test-btn:hover:not(:disabled) {
		border-color: var(--border-strong);
		color: var(--text);
	}
	.test-btn:disabled {
		opacity: 0.5;
		cursor: default;
	}

	.empty-msg {
		color: var(--text-muted);
		font-size: var(--text-sm);
	}

	.rule-list {
		display: flex;
		flex-direction: column;
	}
	.rule-row {
		display: flex;
		flex-direction: column;
		padding: var(--space-4) 0;
		border-bottom: 1px solid var(--border);
	}
	.rule-row:first-child {
		border-top: 1px solid var(--border);
	}
	.rule-row-top {
		display: flex;
		align-items: flex-start;
		gap: var(--space-4);
		width: 100%;
	}

	/* Toggle pill */
	.toggle-btn {
		width: 2.25rem;
		height: 1.25rem;
		border-radius: 999px;
		border: none;
		cursor: pointer;
		background: var(--border-strong);
		position: relative;
		flex-shrink: 0;
		margin-top: 0.125rem;
		transition: background 0.15s;
	}
	.toggle-btn--on {
		background: var(--accent);
	}
	.toggle-thumb {
		position: absolute;
		top: 2px;
		left: 2px;
		width: calc(1.25rem - 4px);
		height: calc(1.25rem - 4px);
		border-radius: 50%;
		background: #fff;
		transition: transform 0.15s;
	}
	.toggle-btn--on .toggle-thumb {
		transform: translateX(1rem);
	}

	.rule-info {
		flex: 1;
		min-width: 0;
	}
	.rule-name {
		font-size: var(--text-base);
		font-weight: 500;
		color: var(--text);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.rule-name--muted {
		color: var(--text-muted);
	}
	.rule-meta {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem;
		align-items: center;
		font-size: var(--text-sm);
		color: var(--text-muted);
		margin-top: 0.125rem;
	}
	.sep {
		color: var(--text-subtle);
		margin: 0 0.125rem;
	}
	.rule-last {
		position: relative;
		display: flex;
		align-items: center;
		gap: 0.25rem;
		font-size: var(--text-xs);
		color: var(--text-subtle);
		margin-top: 0.25rem;
		cursor: pointer;
		user-select: none;
	}
	.rule-last-fired {
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		flex-shrink: 1;
		min-width: 0;
	}
	.rule-next-fire {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		min-width: 0;
		flex: 1;
	}
	.rule-next-fire--ready {
		color: var(--accent);
	}
	.rule-last-popover {
		position: absolute;
		top: calc(100% + 4px);
		left: 0;
		z-index: 200;
		max-width: min(280px, 90vw);
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: 8px;
		box-shadow:
			0 4px 16px rgba(0, 0, 0, 0.1),
			0 1px 4px rgba(0, 0, 0, 0.06);
		padding: var(--space-2) var(--space-3);
		cursor: default;
		user-select: text;
	}
	.rule-last-popover-line {
		font-size: var(--text-xs);
		color: var(--text);
		white-space: normal;
		line-height: var(--leading-base);
	}
	.rule-last-popover-line + .rule-last-popover-line {
		margin-top: 0.25rem;
	}

	/* Inline edit form */
	.edit-wrap {
		margin-top: var(--space-4);
		padding-top: var(--space-4);
		border-top: 1px solid var(--border);
	}
	.edit-fields {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		margin-bottom: var(--space-3);
	}
	.edit-row {
		display: flex;
		gap: var(--space-4);
	}
	.edit-label {
		display: block;
		font-size: var(--text-xs);
		font-weight: 500;
		color: var(--text-muted);
		margin-bottom: 0.25rem;
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}
	.edit-input {
		font-size: var(--text-base);
		padding: 0.375rem 0.625rem;
		border: 1px solid var(--border);
		border-radius: 6px;
		background: var(--bg-subtle);
		color: var(--text);
		width: 140px;
		font-family: 'JetBrains Mono', monospace;
		font-variant-numeric: tabular-nums;
	}
	.edit-input--short {
		width: 80px;
	}
	.edit-input:focus {
		outline: none;
		border-color: var(--accent);
	}
	.edit-actions {
		display: flex;
		gap: var(--space-3);
		align-items: center;
	}
	.edit-save-btn {
		padding: 0.375rem 0.75rem;
		background: var(--accent);
		color: #fff;
		border: none;
		border-radius: 6px;
		font-size: var(--text-sm);
		font-weight: 500;
		cursor: pointer;
	}
	.edit-save-btn:hover {
		background: var(--accent-hover);
	}
	.edit-cancel-btn {
		padding: 0.375rem 0.75rem;
		background: none;
		border: 1px solid var(--border);
		border-radius: 6px;
		font-size: var(--text-sm);
		color: var(--text-muted);
		cursor: pointer;
	}
	.edit-cancel-btn:hover {
		border-color: var(--border-strong);
		color: var(--text);
	}

	/* Rule action buttons */
	.rule-actions {
		display: flex;
		flex-direction: row;
		gap: var(--space-2);
		align-items: center;
		flex-shrink: 0;
	}
	.icon-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0.375rem;
		background: none;
		border: 1px solid var(--border);
		border-radius: 6px;
		cursor: pointer;
		color: var(--text-muted);
		line-height: 0;
		transition:
			color 0.1s,
			border-color 0.1s;
	}
	.icon-btn:hover {
		color: var(--accent);
		border-color: var(--accent);
	}
	.icon-btn--danger {
		color: var(--text-subtle);
	}
	.icon-btn--danger:hover {
		color: var(--status-overdue);
		border-color: var(--status-overdue);
	}

	@media (max-width: 600px), (pointer: coarse) {
		.icon-btn {
			min-width: 2.75rem;
			min-height: 2.75rem;
		}
	}

	@media (max-width: 600px) {
		.rule-row-top {
			flex-wrap: wrap;
			gap: var(--space-3);
		}
		.rule-last {
			flex-direction: column;
			align-items: flex-start;
			gap: 0.125rem;
		}
		.rule-last .sep {
			display: none;
		}
		.rule-actions {
			order: 3;
			flex-direction: row;
			align-items: center;
			gap: var(--space-3);
			width: 100%;
			justify-content: flex-end;
			padding-top: var(--space-3);
			border-top: 1px solid color-mix(in srgb, var(--border) 60%, transparent);
		}
	}

	/* Exclude-vehicles picker */
	.exclude-desc {
		font-size: var(--text-sm);
		color: var(--text-muted);
		line-height: var(--leading-base);
		margin: 0 0 var(--space-3);
	}
	.exclude-empty {
		font-size: var(--text-sm);
		color: var(--text-subtle);
		margin: 0;
	}
	.exclude-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		max-height: min(320px, 50vh);
		overflow-y: auto;
	}
	.exclude-item {
		border-bottom: 1px solid var(--border);
	}
	.exclude-item:last-child {
		border-bottom: none;
	}
	.exclude-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
		width: 100%;
		min-height: 2.75rem;
		padding: var(--space-2) var(--space-1);
		margin: 0 calc(var(--space-1) * -1);
		background: none;
		border: none;
		border-radius: 6px;
		cursor: pointer;
		text-align: left;
		font: inherit;
		color: inherit;
		transition: background 0.1s;
	}
	.exclude-row:hover {
		background: var(--bg-muted);
	}
	.exclude-row:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: -2px;
	}
	.exclude-name {
		font-size: var(--text-sm);
		color: var(--text);
	}
</style>
