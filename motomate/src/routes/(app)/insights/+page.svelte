<script lang="ts">
	import type { PageData } from './$types';
	import { untrack } from 'svelte';
	import { beforeNavigate, goto } from '$app/navigation';
	import { page } from '$app/state';
	import { formatCurrency, formatMoneyTotal, formatNumber } from '$lib/utils/format.js';
	import { totalByCurrency } from '$lib/utils/money.js';
	import { _ } from '$lib/i18n';
	import LineChart from '$lib/components/charts/LineChart.svelte';
	import BarChart from '$lib/components/charts/BarChart.svelte';
	import ViewToggle from '$lib/components/ui/ViewToggle.svelte';

	let { data }: { data: PageData } = $props();

	const locale = $derived(data.user.settings?.locale ?? 'en');
	const currency = $derived(data.user.settings?.currency ?? 'EUR');

	let selectedVehicleId = $state<string>(untrack(() => data.page_prefs?.vehicleId ?? 'all'));
	let timeRange = $state<'6m' | '1y' | '2y' | 'all'>(
		untrack(() => data.page_prefs?.timeRange ?? '1y')
	);
	let mileageMode = $state<'odometer' | 'delta'>(
		untrack(() => data.page_prefs?.mileageMode ?? 'delta')
	);
	let costMode = $state<'monthly' | 'cumulative'>(
		untrack(() => data.page_prefs?.costMode ?? 'monthly')
	);
	let showServiceEvents = $state<boolean>(
		untrack(() => data.page_prefs?.showServiceEvents ?? true)
	);

	$effect(() => {
		const vParam = page.url.searchParams.get('v');
		if (vParam && data.vehicles.some((v) => v.id === vParam)) {
			selectedVehicleId = vParam;
		}
	});

	const selectedVehicle = $derived(data.vehicles.find((v) => v.id === selectedVehicleId) ?? null);

	const cutoffDate = $derived.by(() => {
		if (timeRange === 'all') return null;
		const d = new Date();
		if (timeRange === '6m') d.setMonth(d.getMonth() - 6);
		else if (timeRange === '1y') d.setFullYear(d.getFullYear() - 1);
		else if (timeRange === '2y') d.setFullYear(d.getFullYear() - 2);
		return d.toISOString().slice(0, 10);
	});

	const filteredOdo = $derived(
		data.odometerLogs
			.filter((l) => selectedVehicleId === 'all' || l.vehicle_id === selectedVehicleId)
			.filter((l) => !cutoffDate || l.recorded_at >= cutoffDate)
			.sort((a, b) => a.recorded_at.localeCompare(b.recorded_at))
	);

	const filteredFinance = $derived(
		data.financeTransactions
			.filter((t) => selectedVehicleId === 'all' || t.vehicle_id === selectedVehicleId)
			.filter((t) => !cutoffDate || t.performed_at >= cutoffDate)
			.sort((a, b) => a.performed_at.localeCompare(b.performed_at))
	);

	const filteredServices = $derived(
		data.serviceLogs
			.filter((s) => selectedVehicleId === 'all' || s.vehicle_id === selectedVehicleId)
			.filter((s) => !cutoffDate || s.performed_at >= cutoffDate)
	);

	const mileagePoints = $derived.by(() => {
		if (filteredOdo.length === 0) return [];
		const byMonth = new Map<string, number>();
		for (const l of filteredOdo) {
			const ym = l.recorded_at.slice(0, 7);
			const existing = byMonth.get(ym) ?? 0;
			if (l.odometer > existing) byMonth.set(ym, l.odometer);
		}
		const sorted = [...byMonth.entries()].sort((a, b) => a[0].localeCompare(b[0]));
		if (mileageMode === 'odometer') {
			return sorted.map(([label, value]) => ({ label, value }));
		}
		const result: { label: string; value: number }[] = [];
		for (let i = 1; i < sorted.length; i++) {
			result.push({
				label: sorted[i][0],
				value: Math.max(0, sorted[i][1] - sorted[i - 1][1])
			});
		}
		return result;
	});

	const costPoints = $derived.by(() => {
		if (filteredFinance.length === 0) return [];
		const byMonth = new Map<string, number>();
		for (const t of filteredFinance) {
			const ym = t.performed_at.slice(0, 7);
			byMonth.set(ym, (byMonth.get(ym) ?? 0) + t.amount_cents);
		}
		const sorted = [...byMonth.entries()].sort((a, b) => a[0].localeCompare(b[0]));
		if (costMode === 'monthly') {
			return sorted.map(([label, cents]) => ({ label, value: cents / 100 }));
		}
		let running = 0;
		return sorted.map(([label, cents]) => {
			running += cents / 100;
			return { label, value: running };
		});
	});

	const totalKm = $derived.by(() => {
		if (filteredOdo.length === 0) return null;
		if (mileageMode === 'delta') return mileagePoints.reduce((s, p) => s + p.value, 0);
		const vals = filteredOdo.map((l) => l.odometer);
		return Math.max(...vals) - Math.min(...vals);
	});

	const totalCost = $derived(filteredFinance.reduce((s, t) => s + t.amount_cents, 0));
	const totalCostMoney = $derived(
		totalByCurrency(
			filteredFinance.map((t) => ({ amountCents: t.amount_cents, currency: t.currency })),
			currency
		)
	);
	const costMixed = $derived(totalCostMoney.mixed);
	const costCurrency = $derived(totalCostMoney.mixed ? currency : totalCostMoney.currency);

	const serviceEventMarkers = $derived.by(() => {
		if (!showServiceEvents) return [];
		const seen = new Set<string>();
		return filteredServices
			.map((s) => ({ label: s.performed_at.slice(0, 7), title: s.notes ?? '' }))
			.filter((e) => {
				if (seen.has(e.label)) return false;
				seen.add(e.label);
				return true;
			});
	});

	const odometerUnit = $derived(selectedVehicle?.odometer_unit ?? 'km');

	const mileageFormatter = $derived.by(() => {
		return (v: number) => formatNumber(Math.round(v), locale) + ' ' + odometerUnit;
	});

	const costFormatter = $derived.by(
		() => (v: number) => formatCurrency(Math.round(v * 100), costCurrency, locale)
	);

	function drillDownCost(label: string) {
		if (selectedVehicleId !== 'all') {
			goto('/vehicles/' + selectedVehicleId + '/finance');
			return;
		}
		const txInMonth = data.financeTransactions.filter((t) => t.performed_at.startsWith(label));
		if (txInMonth.length > 0) selectedVehicleId = txInMonth[0].vehicle_id;
	}

	let _prefTimer: ReturnType<typeof setTimeout> | undefined;
	let _firstRun = true;

	function flushPrefs() {
		fetch('/api/prefs', {
			method: 'PATCH',
			keepalive: true,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				page_prefs: {
					insights: {
						vehicleId: selectedVehicleId,
						timeRange,
						mileageMode,
						costMode,
						showServiceEvents
					}
				}
			})
		});
	}

	beforeNavigate(() => {
		clearTimeout(_prefTimer);
		flushPrefs();
	});

	$effect(() => {
		void [selectedVehicleId, timeRange, mileageMode, costMode, showServiceEvents];
		if (_firstRun) {
			_firstRun = false;
			return;
		}
		clearTimeout(_prefTimer);
		_prefTimer = setTimeout(flushPrefs, 600);
	});
</script>

<svelte:head>
	<title>{$_('insights.title')} · MotoMate</title>
</svelte:head>

<div class="insights-page">
	<div class="page-header">
		{#if selectedVehicle}
			<div class="page-header-vehicle">
				<span class="vehicle-avatar">{selectedVehicle.meta?.avatar_emoji ?? '🏍'}</span>
				<div>
					<h1 class="page-title">{selectedVehicle.name}</h1>
					<p class="page-sub">{$_('insights.subtitle')}</p>
				</div>
			</div>
		{:else}
			<div>
				<h1 class="page-title">{$_('insights.title')}</h1>
				<p class="page-sub">{$_('insights.subtitle')}</p>
			</div>
		{/if}
	</div>

	<div class="insights-controls">
		<div class="pill-group">
			<button
				class="pill"
				class:pill--active={selectedVehicleId === 'all'}
				onclick={() => (selectedVehicleId = 'all')}
			>
				{$_('insights.vehicles.all')}
			</button>
			{#each data.vehicles as v (v.id)}
				<button
					class="pill"
					class:pill--active={selectedVehicleId === v.id}
					onclick={() => (selectedVehicleId = v.id)}
				>
					{v.meta?.avatar_emoji ?? '🏍'}
					{v.name}
				</button>
			{/each}
		</div>

		<ViewToggle
			options={[
				{ value: '6m', label: $_('insights.timeRange.6m') },
				{ value: '1y', label: $_('insights.timeRange.1y') },
				{ value: '2y', label: $_('insights.timeRange.2y') },
				{ value: 'all', label: $_('insights.timeRange.all') }
			]}
			value={timeRange}
			onchange={(v) => (timeRange = v as typeof timeRange)}
		/>
	</div>

	<div class="chart-card">
		<div class="chart-card-header">
			<div class="chart-card-title-group">
				<h2 class="chart-title">{$_('insights.mileage.title')}</h2>
				{#if totalKm !== null}
					<span class="chart-stat mono">{mileageFormatter(Math.round(totalKm))}</span>
				{/if}
			</div>
			<div class="chart-card-controls">
				<ViewToggle
					options={[
						{ value: 'delta', label: $_('insights.mileage.modDelta') },
						{ value: 'odometer', label: $_('insights.mileage.modOdometer') }
					]}
					value={mileageMode}
					onchange={(v) => (mileageMode = v as typeof mileageMode)}
				/>
				<label class="events-toggle">
					<input type="checkbox" bind:checked={showServiceEvents} class="events-checkbox" />
					<span class="events-label">{$_('insights.mileage.showServices')}</span>
				</label>
			</div>
		</div>
		{#if selectedVehicleId === 'all' && mileageMode === 'odometer' && data.vehicles.length > 1}
			<p class="chart-note">{$_('insights.mileage.allFleetNote')}</p>
		{/if}
		{#if mileageMode === 'delta' && totalKm !== null && totalKm > 0}
			<p class="chart-summary">
				{$_('insights.mileage.summary', { values: { km: mileageFormatter(Math.round(totalKm)) } })}
			</p>
		{/if}
		{#if mileagePoints.length < 2}
			<div class="chart-empty">
				<p class="chart-empty-title">{$_('insights.empty.title')}</p>
				<p class="chart-empty-desc">{$_('insights.empty.mileage')}</p>
			</div>
		{:else}
			<div class="chart-wrap">
				<LineChart
					points={mileagePoints}
					events={serviceEventMarkers}
					formatValue={mileageFormatter}
					{locale}
					oneventclick={selectedVehicleId !== 'all'
						? () => goto('/vehicles/' + selectedVehicleId + '/maintenance')
						: undefined}
					viewLogLabel={selectedVehicleId !== 'all' ? $_('insights.mileage.viewLog') : undefined}
				/>
			</div>
		{/if}
	</div>

	<div class="chart-card">
		<div class="chart-card-header">
			<div class="chart-card-title-group">
				<h2 class="chart-title">{$_('insights.costs.title')}</h2>
				{#if totalCost > 0}
					<span class="chart-stat mono">{formatMoneyTotal(totalCostMoney, locale)}</span>
				{/if}
			</div>
			{#if !costMixed}
				<ViewToggle
					options={[
						{ value: 'monthly', label: $_('insights.costs.modMonthly') },
						{ value: 'cumulative', label: $_('insights.costs.modCumulative') }
					]}
					value={costMode}
					onchange={(v) => (costMode = v as typeof costMode)}
				/>
			{/if}
		</div>
		{#if costPoints.length === 0}
			<div class="chart-empty">
				<p class="chart-empty-title">{$_('insights.empty.title')}</p>
				<p class="chart-empty-desc">{$_('insights.empty.costs')}</p>
			</div>
		{:else if costMixed}
			<div class="chart-empty">
				<p class="chart-empty-title">{$_('insights.costs.mixedTitle')}</p>
				<p class="chart-empty-desc">{$_('insights.costs.mixedDesc')}</p>
			</div>
		{:else if costMode === 'monthly'}
			<div class="chart-wrap">
				<BarChart
					bars={costPoints}
					formatValue={costFormatter}
					{locale}
					onbarclick={drillDownCost}
					clickHint={selectedVehicleId !== 'all' ? $_('insights.costs.viewDetails') : undefined}
				/>
			</div>
		{:else}
			<div class="chart-wrap">
				<LineChart points={costPoints} formatValue={costFormatter} {locale} />
			</div>
		{/if}
	</div>
</div>

<style>
	.insights-page {
		max-width: 860px;
		margin: 0 auto;
		padding: var(--space-6);
		display: flex;
		flex-direction: column;
		gap: var(--space-6);
	}

	.page-header {
		margin-bottom: 0;
	}

	.page-header-vehicle {
		display: flex;
		align-items: center;
		gap: var(--space-3);
	}

	.vehicle-avatar {
		width: 56px;
		height: 56px;
		border-radius: 50%;
		background: var(--bg-muted);
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 1.75rem;
		flex-shrink: 0;
	}

	.page-title {
		font-size: var(--text-2xl);
		font-weight: 600;
		color: var(--text);
		margin: 0;
	}

	.page-sub {
		font-size: var(--text-sm);
		color: var(--text-muted);
		margin: var(--space-1) 0 0;
	}

	.insights-controls {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		flex-wrap: wrap;
	}

	.pill-group {
		display: flex;
		gap: var(--space-1);
		flex-wrap: nowrap;
		overflow-x: auto;
		-webkit-overflow-scrolling: touch;
		scrollbar-width: none;
		padding-bottom: 2px;
	}

	.pill-group::-webkit-scrollbar {
		display: none;
	}

	.pill {
		padding: 0.375rem 0.75rem;
		min-height: 2.75rem;
		border: 1px solid var(--border);
		border-radius: 100px;
		background: transparent;
		font-size: var(--text-sm);
		font-weight: 500;
		color: var(--text-muted);
		cursor: pointer;
		white-space: nowrap;
		flex-shrink: 0;
		transition:
			border-color 0.15s,
			color 0.15s,
			background 0.15s;
	}

	.pill:hover {
		border-color: var(--border-strong);
		color: var(--text);
	}

	.pill:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}

	.pill:active:not(.pill--active) {
		background: var(--bg-muted);
	}

	.pill--active {
		background: var(--text);
		color: var(--bg);
		border-color: var(--text);
	}

	.chart-card {
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: 12px;
		padding: 1.25rem 1.5rem;
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}

	.chart-card-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
		flex-wrap: wrap;
	}

	.chart-card-title-group {
		display: flex;
		align-items: baseline;
		gap: var(--space-3);
	}

	.chart-title {
		font-size: var(--text-lg);
		font-weight: 600;
		color: var(--text);
		margin: 0;
	}

	.chart-stat {
		font-size: var(--text-xl);
		font-weight: 600;
		color: var(--text-muted);
		font-variant-numeric: tabular-nums;
	}

	.mono {
		font-family: 'JetBrains Mono', ui-monospace, monospace;
	}

	.chart-card-controls {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}

	.events-toggle {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		cursor: pointer;
	}

	.events-checkbox {
		accent-color: var(--accent);
		width: 14px;
		height: 14px;
	}

	.events-label {
		font-size: var(--text-sm);
		color: var(--text-muted);
		font-weight: 500;
		user-select: none;
	}

	.chart-note {
		font-size: var(--text-xs);
		color: var(--text-subtle);
		margin: 0;
	}

	.chart-summary {
		font-size: var(--text-sm);
		color: var(--text-muted);
		margin: 0;
	}

	.chart-wrap {
		width: 100%;
		overflow: hidden;
	}

	.chart-empty {
		padding: var(--space-8) 0;
		text-align: center;
	}

	.chart-empty-title {
		font-size: var(--text-base);
		font-weight: 500;
		color: var(--text-muted);
		margin: 0 0 var(--space-1);
	}

	.chart-empty-desc {
		font-size: var(--text-sm);
		color: var(--text-subtle);
		margin: 0;
	}

	@media (max-width: 640px) {
		.insights-page {
			padding: var(--space-4) var(--space-3);
			gap: var(--space-4);
		}

		.chart-card {
			padding: var(--space-4);
		}

		.chart-card-header {
			flex-direction: column;
			align-items: flex-start;
		}
	}
</style>
