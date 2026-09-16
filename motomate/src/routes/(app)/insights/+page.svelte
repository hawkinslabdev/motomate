<script lang="ts">
	import type { PageData } from './$types';
	import { tick, untrack } from 'svelte';
	import { beforeNavigate, goto } from '$app/navigation';
	import { page } from '$app/state';
	import { formatCurrency, formatMoneyTotal, formatNumber } from '$lib/utils/format.js';
	import { primaryCurrency, totalByCurrency } from '$lib/utils/money.js';
	import { createPrefsSync } from '$lib/utils/prefs-sync.js';
	import { _ } from '$lib/i18n';
	import LineChart from '$lib/components/charts/LineChart.svelte';
	import BarChart from '$lib/components/charts/BarChart.svelte';
	import ViewToggle from '$lib/components/ui/ViewToggle.svelte';
	import VehicleAvatar from '$lib/components/ui/VehicleAvatar.svelte';

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
			tick().then(() => {
				pillGroupEl
					?.querySelector(`[data-vehicle-id="${vParam}"]`)
					?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
			});
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
		data.expenses
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
		let runningMax = 0;
		for (const l of filteredOdo) {
			if (l.odometer < runningMax) continue;
			runningMax = l.odometer;
			byMonth.set(l.recorded_at.slice(0, 7), runningMax);
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

	const totalCostMoney = $derived(
		totalByCurrency(
			filteredFinance.map((t) => ({ amountCents: t.amount_cents, currency: t.currency })),
			currency
		)
	);

	// Charts plot a single currency; prefer the profile currency, else the largest subtotal
	const costCurrency = $derived(primaryCurrency(totalCostMoney, currency));

	const excludedTotals = $derived(
		totalCostMoney.mixed ? totalCostMoney.subtotals.filter((s) => s.currency !== costCurrency) : []
	);

	const chartEntries = $derived(
		filteredFinance.filter((t) => (t.currency || currency) === costCurrency)
	);

	const costPoints = $derived.by(() => {
		if (chartEntries.length === 0) return [];
		const byMonth = new Map<string, number>();
		for (const t of chartEntries) {
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
		const vals = mileagePoints.map((p) => p.value);
		return vals.length ? Math.max(...vals) - Math.min(...vals) : 0;
	});

	const totalCost = $derived(filteredFinance.reduce((s, t) => s + t.amount_cents, 0));

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
		const txInMonth = chartEntries.filter((t) => t.performed_at.startsWith(label));
		if (txInMonth.length > 0) selectedVehicleId = txInMonth[0].vehicle_id;
	}

	let pillGroupEl: HTMLDivElement | undefined;
	let dragOrigin: { x: number; scrollLeft: number } | null = null;
	let dragged = false;

	function onPillMouseDown(e: MouseEvent) {
		const el = e.currentTarget as HTMLDivElement;
		if (el.scrollWidth <= el.clientWidth) return;
		dragOrigin = { x: e.clientX, scrollLeft: el.scrollLeft };
		dragged = false;
		window.addEventListener('mousemove', onPillMouseMove);
		window.addEventListener('mouseup', onPillMouseUp);
	}

	function onPillMouseMove(e: MouseEvent) {
		if (!dragOrigin || !pillGroupEl) return;
		const dx = e.clientX - dragOrigin.x;
		if (Math.abs(dx) > 4) dragged = true;
		pillGroupEl.scrollLeft = dragOrigin.scrollLeft - dx;
	}

	function onPillMouseUp() {
		dragOrigin = null;
		window.removeEventListener('mousemove', onPillMouseMove);
		window.removeEventListener('mouseup', onPillMouseUp);
	}

	function guardPillClick(e: MouseEvent) {
		if (dragged) {
			e.preventDefault();
			e.stopPropagation();
			dragged = false;
		}
	}

	function selectVehicle(id: string, e: MouseEvent) {
		selectedVehicleId = id;
		(e.currentTarget as HTMLElement).scrollIntoView({
			behavior: 'smooth',
			block: 'nearest',
			inline: 'nearest'
		});
	}

	const prefsSync = createPrefsSync('insights');
	let _firstRun = true;

	beforeNavigate(() => prefsSync.flush());

	$effect(() => {
		void [selectedVehicleId, timeRange, mileageMode, costMode, showServiceEvents];
		if (_firstRun) {
			_firstRun = false;
			return;
		}
		prefsSync.schedule({
			vehicleId: selectedVehicleId,
			timeRange,
			mileageMode,
			costMode,
			showServiceEvents
		});
	});
</script>

<svelte:head>
	<title>{$_('insights.title')} · MotoMate</title>
</svelte:head>

<div class="insights-page">
	<div class="page-header">
		{#if selectedVehicle}
			<div class="page-header-vehicle">
				<VehicleAvatar vehicle={selectedVehicle} size={56} class="page-header-avatar" />
				<div>
					<div class="page-title-row">
						<h1 class="page-title">{selectedVehicle.name}</h1>
						<a
							href="/vehicles/{selectedVehicle.id}"
							class="vehicle-page-link"
							aria-label={$_('common.open')}
							title={$_('common.open')}
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
								<path d="M7 17L17 7" />
								<path d="M7 7h10v10" />
							</svg>
						</a>
					</div>
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
		<div
			class="pill-group"
			role="toolbar"
			tabindex="-1"
			onwheel={(e) => {
				const el = e.currentTarget;
				if (el.scrollWidth <= el.clientWidth) return;
				if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
					e.preventDefault();
					el.scrollLeft += e.deltaY;
				}
			}}
			bind:this={pillGroupEl}
			onmousedown={onPillMouseDown}
			onclickcapture={guardPillClick}
		>
			<button
				class="pill"
				class:pill--active={selectedVehicleId === 'all'}
				data-vehicle-id="all"
				onclick={(e) => selectVehicle('all', e)}
			>
				{$_('insights.vehicles.all')}
			</button>
			{#each data.vehicles as v (v.id)}
				<button
					class="pill"
					class:pill--active={selectedVehicleId === v.id}
					data-vehicle-id={v.id}
					onclick={(e) => selectVehicle(v.id, e)}
				>
					<VehicleAvatar vehicle={v} size={18} />
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
			<ViewToggle
				options={[
					{ value: 'monthly', label: $_('insights.costs.modMonthly') },
					{ value: 'cumulative', label: $_('insights.costs.modCumulative') }
				]}
				value={costMode}
				onchange={(v) => (costMode = v as typeof costMode)}
			/>
		</div>
		{#if excludedTotals.length > 0}
			<p class="chart-note">
				{$_('insights.costs.currencyNote', {
					values: {
						currency: costCurrency,
						excluded: excludedTotals
							.map((s) => formatCurrency(s.cents, s.currency, locale))
							.join(' · ')
					}
				})}
			</p>
		{/if}
		{#if costPoints.length === 0}
			<div class="chart-empty">
				<p class="chart-empty-title">{$_('insights.empty.title')}</p>
				<p class="chart-empty-desc">{$_('insights.empty.costs')}</p>
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

	:global(.page-header-avatar) {
		background: var(--bg-muted);
	}

	.page-title-row {
		display: flex;
		align-items: center;
		gap: var(--space-1);
	}

	.vehicle-page-link {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 24px;
		height: 24px;
		border-radius: 6px;
		color: var(--text-subtle);
		flex-shrink: 0;
		transition:
			color 0.15s,
			background 0.15s;
	}

	.vehicle-page-link:hover {
		color: var(--text);
		background: var(--bg-muted);
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
		flex-wrap: nowrap;
	}

	.insights-controls :global(.view-toggle) {
		flex-shrink: 0;
	}

	.pill-group {
		display: flex;
		flex: 1 1 auto;
		gap: var(--space-1);
		flex-wrap: nowrap;
		overflow-x: auto;
		-webkit-overflow-scrolling: touch;
		scrollbar-width: none;
		padding-bottom: 2px;
		min-width: 0;
		cursor: grab;
		user-select: none;
		background:
			linear-gradient(to right, var(--bg) 40%, transparent) 0 0 / 24px 100% local no-repeat,
			linear-gradient(to left, var(--bg) 40%, transparent) 100% 0 / 24px 100% local no-repeat,
			linear-gradient(to right, rgba(0, 0, 0, 0.1), transparent) 0 0 / 16px 100% scroll no-repeat,
			linear-gradient(to left, rgba(0, 0, 0, 0.1), transparent) 100% 0 / 16px 100% scroll no-repeat;
	}

	.pill-group::-webkit-scrollbar {
		display: none;
	}

	.pill {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
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
		user-select: none;
		transition:
			border-color 0.15s,
			color 0.15s,
			background 0.15s;
	}

	.pill:hover:not(.pill--active) {
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

		.chart-card-header :global(.view-toggle) {
			width: 100%;
		}

		.chart-card-controls {
			flex-direction: column;
			align-items: stretch;
			width: 100%;
		}

		.insights-controls {
			flex-wrap: wrap;
		}

		.insights-controls :global(.view-toggle) {
			width: 100%;
		}

		.pill-group {
			flex-basis: 100%;
		}
	}
</style>
