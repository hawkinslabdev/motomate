<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import type { PageData } from './$types';
	import TrackerCard from '$lib/components/ui/TrackerCard.svelte';
	import ConfirmDialog from '$lib/components/ui/ConfirmDialog.svelte';
	import { toasts } from '$lib/stores/toasts.js';
	import { _, waitLocale } from '$lib/i18n';

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

	const sortedTrackers = $derived(
		[...data.trackers].sort((a, b) => {
			const order: Record<string, number> = { overdue: 0, due: 1, ok: 2 };
			return (order[a.status] ?? 3) - (order[b.status] ?? 3);
		})
	);

	function toggleTrackerMenu(id: string) {
		trackerMenu = trackerMenu === id ? null : id;
	}
	function startEditTracker(id: string) {
		editingTracker = id;
		trackerMenu = null;
		loggingTracker = null;
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
		{#if sortedTrackers.length === 0}
			<form method="POST" action="?/applyDefaults" use:enhance>
				<button type="submit" class="btn-ghost">
					{$_('maintenance.applyDefaults')}
				</button>
			</form>
		{/if}
		<button class="btn-ghost" onclick={() => (showAddTask = !showAddTask)}>
			{showAddTask ? $_('common.cancel') : $_('maintenance.addTask.button')}
		</button>
	</div>
</div>

{#if showAddTask}
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

{#if sortedTrackers.length === 0}
	<div class="empty">
		<div class="empty-icon" aria-hidden="true">🔧</div>
		<p class="empty-title">{$_('maintenance.empty.title')}</p>
		<p class="empty-desc">{$_('maintenance.empty.description')}</p>
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
						isLogging={loggingTracker === t.id}
						isRecentlyLogged={recentlyLoggedId === t.id}
						onlogclick={(id) => {
							loggingTracker = loggingTracker === id ? null : id;
							editingTracker = null;
						}}
						onoptionsclick={(id) => {
							loggingTracker = null;
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
		background: var(--bg-muted);
		color: var(--text);
	}

	/* Empty state */
	.empty {
		display: flex;
		flex-direction: column;
		align-items: center;
		text-align: center;
		padding: 3rem 1.5rem;
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

	/* Mobile: narrower grid */
	@media (max-width: 540px) {
		.log-fields {
			grid-template-columns: 1fr 1fr;
		}
		.add-task-fields {
			grid-template-columns: 1fr 1fr;
		}
		.edit-row {
			grid-template-columns: 1fr;
		}
	}
	@media (max-width: 380px) {
		.log-fields {
			grid-template-columns: 1fr;
		}
		.add-task-fields {
			grid-template-columns: 1fr;
		}
	}
</style>
