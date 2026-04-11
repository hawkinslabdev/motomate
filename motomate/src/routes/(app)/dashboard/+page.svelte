<script lang="ts">
	import type { PageData } from './$types';
	import AttentionCard from '$lib/components/ui/AttentionCard.svelte';
	import { formatCurrency, formatDateShort, formatNumber } from '$lib/utils/format.js';
	import { _ } from '$lib/i18n';

	let { data } = $props<{ data: PageData }>();

	const currentLocale = $derived(data.user.settings.locale ?? 'en');
	const _currency = $derived(data.user.settings.currency ?? 'EUR');

	const hour = new Date().getHours();
	const greeting = $derived(
		hour < 12
			? $_('dashboard.greeting.morning')
			: hour < 18
				? $_('dashboard.greeting.afternoon')
				: $_('dashboard.greeting.evening')
	);

	type TrackerItem = (typeof data.overdueTrackers)[number];
	const attentionItems = $derived([
		...data.overdueTrackers.map((t: TrackerItem) => ({ ...t, status: 'overdue' as const })),
		...data.dueTrackers.map((t: TrackerItem) => ({ ...t, status: 'due' as const }))
	]);
	const visibleAttention = $derived(attentionItems.slice(0, 3));
	const hiddenAttentionCount = $derived(attentionItems.length - visibleAttention.length);

	function attentionDetail(tracker: (typeof data.overdueTrackers)[0]) {
		const v = tracker.vehicle;
		if (tracker.status === 'overdue' && tracker.next_due_odometer && v.current_odometer) {
			const diff = v.current_odometer - tracker.next_due_odometer;
			if (diff > 0)
				return $_('vehicle.detail.overdueByKm', {
					values: { km: formatNumber(diff, currentLocale), unit: v.odometer_unit }
				});
		}
		if (tracker.status === 'overdue') return $_('vehicle.detail.overdue');
		if (tracker.next_due_odometer) {
			const diff = tracker.next_due_odometer - (tracker.vehicle as any).current_odometer;
			if (diff > 0)
				return $_('vehicle.detail.dueInKm', {
					values: { km: formatNumber(diff, currentLocale), unit: v.odometer_unit }
				});
		}
		if (tracker.next_due_at)
			return $_('vehicle.detail.dueDate', {
				values: { date: formatDateShort(tracker.next_due_at, currentLocale) }
			});
		return $_('vehicle.detail.dueSoon');
	}
</script>

<svelte:head><title>Dashboard &middot; MotoMate</title></svelte:head>

<div class="dashboard">
	<!-- Mobile brand -->
	<div class="mobile-brand">
		<img src="/favicon.svg" alt="" width="18" height="18" />
		<span>MotoMate</span>
	</div>

	<!-- Greeting hero -->
	<div class="dash-greeting">
		<h1 class="greeting-text">{greeting}.</h1>
		<p
			class="status-summary"
			class:summary--overdue={data.overdueTrackers.length > 0}
			class:summary--due={data.overdueTrackers.length === 0 && data.dueTrackers.length > 0}
		>
			{#if data.overdueTrackers.length > 0}
				{$_('dashboard.status.overdue', { values: { count: data.overdueTrackers.length } })}
			{:else if data.dueTrackers.length > 0}
				{$_('dashboard.status.dueSoon', { values: { count: data.dueTrackers.length } })}
			{:else if data.vehicles.length > 0}
				{$_('dashboard.status.allGood')}
			{:else}
				{$_('dashboard.status.addFirst')}
			{/if}
		</p>
	</div>

	<!-- Attention needed -->
	{#if attentionItems.length > 0}
		<section class="dash-section">
			<h2 class="section-eyebrow">{$_('dashboard.sections.needsAttention')}</h2>
			<div class="attention-list">
				{#each visibleAttention as tracker}
					<AttentionCard
						status={tracker.status}
						vehicleName={tracker.vehicle.name}
						taskName={tracker.template.name}
						detail={attentionDetail(tracker)}
						href="/vehicles/{tracker.vehicle.id}/maintenance"
					/>
				{/each}
				{#if hiddenAttentionCount > 0}
					<a href="/vehicles" class="attention-overflow">
						{$_('dashboard.attention.andMore', { values: { count: hiddenAttentionCount } })}
					</a>
				{/if}
			</div>
		</section>
	{/if}

	<!-- Garage -->
	{#if data.vehicles.length > 0}
		<section class="dash-section">
			<div class="section-header">
				<h2 class="section-eyebrow">{$_('dashboard.sections.garage')}</h2>
				<a href="/vehicles" class="section-link">{$_('dashboard.viewAll')}</a>
			</div>
			<div class="entry-list">
				{#each data.vehicles as vehicle}
					{@const defaultEmoji =
						vehicle.type === 'scooter' ? '🛵' : vehicle.type === 'bike' ? '🚲' : '🏍'}
					{@const avatarEmoji = vehicle.meta?.avatar_emoji ?? defaultEmoji}
					{@const hasAvatarImage = !!vehicle.cover_image_key}
					{@const vStatus = data.vehicleStatus[vehicle.id] ?? 'ok'}
					<a href="/vehicles/{vehicle.id}" class="entry">
						<div class="entry-avatar" aria-hidden="true">
							{#if hasAvatarImage}
								<img src="/api/files?key={vehicle.cover_image_key}" alt="" class="avatar-img" />
							{:else}
								{avatarEmoji}
							{/if}
						</div>
						<div class="entry-body">
							<div class="entry-title">{vehicle.name}</div>
							<div class="entry-meta">
								<span>{vehicle.make} {vehicle.model} · {vehicle.year}</span>
								<span class="sep">·</span>
								<span class="mono"
									>{formatNumber(vehicle.current_odometer, currentLocale)}
									{vehicle.odometer_unit}</span
								>
							</div>
						</div>
						{#if vStatus !== 'ok'}
							<span
								class="vehicle-status-dot"
								class:vehicle-status-dot--overdue={vStatus === 'overdue'}
								class:vehicle-status-dot--due={vStatus === 'due'}
								aria-label={vStatus}
							></span>
						{/if}
					</a>
				{/each}
			</div>
		</section>
	{/if}

	<!-- Recent activity -->
	{#if data.recentLogs.length > 0}
		<section class="dash-section">
			<h2 class="section-eyebrow">{$_('dashboard.sections.recentActivity')}</h2>
			<div class="entry-list">
				{#each data.recentLogs as log}
					<a href="/vehicles/{log.vehicle_id}/maintenance" class="entry">
						<div class="entry-body">
							<div class="entry-title">
								{log.trackerName ?? log.notes?.split('\n')[0] ?? $_('dashboard.serviceEntry')}
							</div>
							<div class="entry-meta">
								<span>{log.vehicle.name}</span>
								<span class="sep">·</span>
								<span class="mono"
									>{formatNumber(log.odometer_at_service, currentLocale)}
									{log.vehicle.odometer_unit}</span
								>
								{#if log.cost_cents}
									<span class="sep">·</span>
									<span class="mono cost"
										>{formatCurrency(log.cost_cents, log.currency, currentLocale)}</span
									>
								{/if}
								<span class="sep">·</span>
								<span class="date">{formatDateShort(log.performed_at, currentLocale)}</span>
							</div>
						</div>
					</a>
				{/each}
			</div>
		</section>
	{/if}

	<!-- Empty state -->
	{#if data.vehicles.length === 0}
		<section class="dash-section">
			<div class="empty">
				<div class="empty-icon" aria-hidden="true">🏍</div>
				{#if data.user.settings.onboarding_done}
					<p class="empty-title">{$_('dashboard.empty.title')}</p>
					<p class="empty-desc">{$_('dashboard.empty.descriptionActive')}</p>
				{:else}
					<p class="empty-title">{$_('dashboard.empty.title')}</p>
					<p class="empty-desc">{$_('dashboard.empty.descriptionOnboarding')}</p>
				{/if}
				<a href="/vehicles/new" class="btn-primary">{$_('dashboard.empty.submit')}</a>
			</div>
		</section>
	{/if}
</div>

<style>
	.dashboard {
		padding: var(--space-8) var(--space-6);
		max-width: 860px;
		margin: 0 auto;
	}

	/* Greeting */
	.dash-greeting {
		margin-bottom: var(--space-10);
	}
	.greeting-text {
		font-size: var(--text-2xl);
		font-weight: 600;
		color: var(--text);
		letter-spacing: -0.02em;
		line-height: var(--leading-tight);
		margin: 0 0 0.5rem;
	}
	.status-summary {
		font-size: var(--text-base);
		color: var(--text-muted);
		margin: 0;
		line-height: var(--leading-snug);
	}
	.status-summary.summary--overdue {
		color: var(--status-overdue);
	}
	.status-summary.summary--due {
		color: var(--status-due);
	}

	/* Sections */
	.dash-section {
		margin-bottom: var(--space-8);
	}
	.section-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: var(--space-3);
	}
	.section-eyebrow {
		font-size: var(--text-xs);
		font-weight: 600;
		color: var(--text-subtle);
		text-transform: uppercase;
		letter-spacing: 0.08em;
		margin: 0 0 var(--space-3);
		line-height: 1;
	}
	.section-header .section-eyebrow {
		margin: 0;
	}
	.section-link {
		font-size: var(--text-sm);
		color: var(--accent);
		text-decoration: none;
		font-weight: 500;
	}

	/* Attention cards */
	.attention-list {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
	.attention-overflow {
		font-size: var(--text-sm);
		color: var(--text-muted);
		text-decoration: none;
		padding: var(--space-2) 0 0;
		display: block;
	}
	.attention-overflow:hover {
		color: var(--accent);
	}

	/* Open entry list */
	/* No outer border/box — separation is whitespace + thin entry divider */
	.entry-list {
		display: flex;
		flex-direction: column;
	}

	.entry {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		padding: var(--space-3) 0;
		text-decoration: none;
		border-bottom: 1px solid var(--border);
		min-width: 0;
		transition: opacity 0.1s;
	}
	.entry:first-child {
		border-top: 1px solid var(--border);
	}
	.entry:hover {
		opacity: 0.75;
	}

	.entry-avatar {
		font-size: 1.25rem;
		flex-shrink: 0;
		width: 32px;
		height: 32px;
		border-radius: 50%;
		background: var(--bg-muted);
		display: flex;
		align-items: center;
		justify-content: center;
		overflow: hidden;
	}
	.avatar-img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	.entry-body {
		flex: 1;
		min-width: 0;
	}
	.entry-title {
		font-size: var(--text-base);
		font-weight: 500;
		color: var(--text);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		line-height: var(--leading-snug);
	}
	.entry-meta {
		font-size: var(--text-sm);
		color: var(--text-muted);
		margin-top: 0.125rem;
		display: flex;
		flex-wrap: nowrap;
		gap: 0.25rem;
		align-items: center;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.sep {
		color: var(--text-subtle);
		flex-shrink: 0;
	}
	.mono {
		font-family: var(--font-mono);
		font-variant-numeric: tabular-nums;
	}
	.cost {
		color: var(--status-ok);
	}
	.date {
		flex-shrink: 0;
		color: var(--text-subtle);
	}

	.vehicle-status-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		flex-shrink: 0;
		background: var(--border-strong);
	}
	.vehicle-status-dot--due {
		background: var(--status-due);
	}
	.vehicle-status-dot--overdue {
		background: var(--status-overdue);
	}

	/* Empty state */
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
		margin: 0 0 1.5rem;
		line-height: var(--leading-base);
	}
	.btn-primary {
		display: inline-flex;
		align-items: center;
		padding: 0.5rem 1.25rem;
		background: var(--accent);
		color: #fff;
		border-radius: 10px;
		font-size: var(--text-sm);
		font-weight: 500;
		text-decoration: none;
	}
	.btn-primary:hover {
		background: var(--accent-hover);
	}

	@media (max-width: 640px) {
		.dashboard {
			padding: var(--space-5) var(--space-4);
		}
		.dash-greeting {
			margin-bottom: var(--space-7);
		}
		.mobile-brand {
			display: none;
		}
	}

	/* Mobile brand - hidden on desktop */
	.mobile-brand {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		margin-bottom: var(--space-4);
		font-size: var(--text-xs);
		font-weight: 500;
		color: var(--text-muted);
		letter-spacing: 0.05em;
		text-transform: uppercase;
	}

	@media (min-width: 641px) {
		.mobile-brand {
			display: none;
		}
	}
</style>
