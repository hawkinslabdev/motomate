<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageData } from './$types';
	import type { RuleTrigger } from '$lib/db/schema.js';
	import type { NextFireInfo } from './+page.server.js';
	import { _, waitLocale } from '$lib/i18n';
	import { formatDateTime, formatDateLong } from '$lib/utils/format';
	import ConfirmDialog from '$lib/components/ui/ConfirmDialog.svelte';
	import { toasts } from '$lib/stores/toasts.js';

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
			case 'km': {
				const base = $_('settings.notifications.scheduledRules.inKm', {
					values: { km: info.kmRemaining }
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

	// Delete confirmation
	let deletingRule = $state<PageData['rules'][number] | null>(null);
	let deleteLoading = $state(false);

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

<svelte:head>
	<title>{$_('settings.workflows.title')} · {$_('layout.nav.settings')}</title>
</svelte:head>

<div class="wf-header">
	<h2 class="section-title">{$_('settings.workflows.title')}</h2>
	<div class="wf-header-actions">
		<button class="btn-secondary" onclick={runCheck} disabled={runningCheck}>
			{runningCheck ? '...' : $_('settings.workflows.runCheck')}
		</button>
		<form method="POST" action="?/seedPresets" use:enhance>
			<button type="submit" class="btn-primary">{$_('settings.workflows.loadPresets')}</button>
		</form>
	</div>
</div>

{#if data.rules.length === 0}
	<p class="empty-msg">{$_('settings.workflows.empty')}</p>
{:else}
	<div class="rule-list">
		{#each data.rules as rule}
			<div class="rule-row">
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
					<div class="rule-last">
						<span class="rule-last-fired">
							{#if rule.last_triggered_at}
								{$_('settings.workflows.lastFired', {
									values: {
										date: formatDateTime(
											rule.last_triggered_at,
											data.user?.settings?.locale ?? 'en',
											data.user?.timezone
										)
									}
								})}
							{:else}
								{$_('settings.workflows.neverFired')}
							{/if}
						</span>
						<span class="sep">·</span>
						<span
							class="rule-next-fire"
							class:rule-next-fire--ready={rule.nextFire.kind === 'ready'}
							title={nextFireLabel(rule.nextFire)}
							>{$_('settings.workflows.nextFire')}: {nextFireLabel(rule.nextFire)}</span
						>
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
												setTriggerNum(
													'km_past',
													parseInt((e.target as HTMLInputElement).value) || 0
												)}
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
														setTriggerNum(
															'day',
															parseInt((e.target as HTMLInputElement).value) || 1
														)}
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

				<div class="rule-actions">
					<button
						type="button"
						class="edit-btn"
						onclick={() => (editingRuleId === rule.id ? cancelEdit() : startEdit(rule))}
					>
						{editingRuleId === rule.id
							? $_('settings.workflows.editCancel')
							: $_('settings.workflows.editBtn')}
					</button>

					<button type="button" class="delete-btn" onclick={() => (deletingRule = rule)}
						>{$_('settings.workflows.delete')}</button
					>
				</div>
			</div>
		{/each}
	</div>
{/if}

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

<style>
	.wf-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: var(--space-5);
		flex-wrap: wrap;
		gap: var(--space-3);
	}
	.section-title {
		font-size: var(--text-2xl);
		font-weight: 600;
		color: var(--text);
		margin: 0;
		letter-spacing: -0.02em;
	}
	.wf-header-actions {
		display: flex;
		gap: var(--space-3);
		align-items: center;
	}
	.btn-primary {
		padding: 0.5rem 0.875rem;
		background: var(--accent);
		color: #fff;
		border: none;
		border-radius: 10px;
		font-size: var(--text-sm);
		font-weight: 500;
		cursor: pointer;
	}
	.btn-primary:hover {
		background: var(--accent-hover);
	}
	.btn-secondary {
		padding: 0.5rem 0.875rem;
		background: none;
		color: var(--text);
		border: 1px solid var(--border-strong);
		border-radius: 10px;
		font-size: var(--text-sm);
		font-weight: 500;
		cursor: pointer;
	}
	.btn-secondary:hover:not(:disabled) {
		background: var(--bg-muted);
	}
	.btn-secondary:disabled {
		opacity: 0.5;
		cursor: not-allowed;
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
		align-items: flex-start;
		gap: var(--space-4);
		padding: var(--space-4) 0;
		border-bottom: 1px solid var(--border);
	}
	.rule-row:first-child {
		border-top: 1px solid var(--border);
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
		display: flex;
		align-items: center;
		gap: 0.25rem;
		font-size: var(--text-xs);
		color: var(--text-subtle);
		margin-top: 0.25rem;
		overflow: hidden;
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
		flex-direction: column;
		gap: var(--space-2);
		align-items: flex-end;
		flex-shrink: 0;
	}
	.edit-btn {
		padding: 0.25rem 0.5rem;
		background: none;
		border: 1px solid var(--border);
		border-radius: 6px;
		cursor: pointer;
		color: var(--text-muted);
		font-size: var(--text-xs);
	}
	.edit-btn:hover {
		color: var(--accent);
		border-color: var(--accent);
	}
	.delete-btn {
		padding: 0.25rem 0.5rem;
		background: none;
		border: 1px solid var(--border);
		border-radius: 6px;
		cursor: pointer;
		color: var(--text-subtle);
		font-size: var(--text-xs);
	}
	.delete-btn:hover {
		color: var(--status-overdue);
		border-color: var(--status-overdue);
	}

	@media (max-width: 600px) {
		.rule-row {
			flex-wrap: wrap;
			gap: var(--space-3);
		}
		.rule-actions {
			order: 3;
			flex-direction: row;
			align-items: center;
			gap: var(--space-2);
			width: 100%;
			justify-content: flex-end;
			padding-top: var(--space-2);
			border-top: 1px solid color-mix(in srgb, var(--border) 60%, transparent);
		}
	}
</style>
