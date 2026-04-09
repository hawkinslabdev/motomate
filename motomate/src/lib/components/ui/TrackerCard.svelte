<script lang="ts">
	import { formatNumber, formatDateShort, formatCurrency } from '$lib/utils/format';
	import { _, waitLocale } from '$lib/i18n';

	type ServiceLog = {
		id: string;
		performed_at: string;
		odometer_at_service: number;
		cost_cents: number | null;
		currency: string;
		notes: string | null;
		remark: string | null;
		created_at: string;
	};

	let {
		tracker,
		vehicleUnit,
		locale,
		serviceLogs = [],
		forecastMode = false,
		forecastData = null,
		monthsOfUsage = 0,
		isLogging = false,
		isRecentlyLogged = false,
		showHistory = false,
		onlogclick,
		onhistoryclick,
		onoptionsclick
	}: {
		tracker: {
			id: string;
			template: { name: string; interval_km?: number | null; interval_months?: number | null };
			status: 'ok' | 'due' | 'overdue';
			next_due_odometer?: number | null;
			next_due_at?: string | null;
			last_done_at?: string | null;
			last_done_odometer?: number | null;
		};
		vehicleUnit: string;
		locale: string;
		serviceLogs?: ServiceLog[];
		forecastMode?: boolean;
		forecastData?: { odometer: number | null; monthsUntil: number | null } | null;
		monthsOfUsage?: number;
		isLogging?: boolean;
		isRecentlyLogged?: boolean;
		showHistory?: boolean;
		onlogclick?: (id: string) => void;
		onhistoryclick?: (id: string) => void;
		onoptionsclick?: (id: string) => void;
	} = $props();

	$effect(() => {
		waitLocale();
	});

	function formatInterval() {
		const t = tracker.template;
		const parts: string[] = [];
		if (t.interval_km) parts.push(`${formatNumber(t.interval_km, locale)} ${vehicleUnit}`);
		if (t.interval_months) parts.push(`${t.interval_months} ${$_('common.months')}`);
		const sep = ` ${$_('common.or')} `;
		return parts.join(sep) || '—';
	}

	function nextInfo() {
		const parts: string[] = [];
		if (tracker.next_due_odometer)
			parts.push(`${formatNumber(tracker.next_due_odometer, locale)} ${vehicleUnit}`);
		if (tracker.next_due_at) parts.push(formatDateShort(tracker.next_due_at, locale));
		return parts.join(' · ') || $_('maintenance.tracker.notScheduled');
	}

	function lastInfo() {
		const parts: string[] = [];
		if (tracker.last_done_at) parts.push(formatDateShort(tracker.last_done_at, locale));
		if (tracker.last_done_odometer)
			parts.push(`${formatNumber(tracker.last_done_odometer, locale)} ${vehicleUnit}`);
		return parts.join(' · ');
	}

	const historyGrouped = $derived(() => {
		const map = new Map<string, ServiceLog[]>();
		for (const log of serviceLogs) {
			const key = log.performed_at.slice(0, 7);
			if (!map.has(key)) map.set(key, []);
			map.get(key)!.push(log);
		}
		return [...map.entries()];
	});
</script>

<div
	class="tracker-card"
	class:tracker-card--due={tracker.status === 'due'}
	class:tracker-card--overdue={tracker.status === 'overdue'}
	class:tracker-card--logged={isRecentlyLogged}
	onclick={() => {
		if (serviceLogs.length > 0) {
			onhistoryclick?.(tracker.id);
		}
	}}
	onkeydown={(e) => {
		if (e.key === 'Enter' || e.key === ' ') {
			if (serviceLogs.length > 0) {
				onhistoryclick?.(tracker.id);
			}
		}
	}}
	role="button"
	tabindex={serviceLogs.length > 0 ? 0 : -1}
>
	<div class="tracker-main">
		<div class="tracker-info">
			<div class="tracker-name">{tracker.template.name}</div>
			<div class="tracker-meta">
				<span>{$_('maintenance.tracker.every', { values: { interval: formatInterval() } })}</span>
				{#if !forecastMode && (tracker.next_due_odometer || tracker.next_due_at)}
					<span class="meta-sep">·</span>
					<span>{$_('maintenance.tracker.next', { values: { info: nextInfo() } })}</span>
				{/if}
				{#if forecastMode && forecastData}
					{#if forecastData.odometer}
						<span class="meta-sep">·</span>
						<span class="forecast-info">
							{$_('maintenance.forecast.estimated')}
							{formatNumber(forecastData.odometer, locale)}
							{vehicleUnit}
							{#if monthsOfUsage >= 5}
								<span class="forecast-confidence">
									{$_('maintenance.forecast.basedOnUsage', { values: { months: monthsOfUsage } })}
								</span>
							{:else}
								<span class="forecast-confidence">
									{$_('maintenance.forecast.insufficientData')}
								</span>
							{/if}
						</span>
					{/if}
				{/if}
			</div>
			{#if !forecastMode && tracker.last_done_at}
				<div class="tracker-last">
					<span>{$_('maintenance.tracker.last', { values: { info: lastInfo() } })}</span>
				</div>
			{/if}
		</div>
		<div class="tracker-actions">
			{#if serviceLogs.length > 0}
				<button
					class="history-btn"
					onclick={(e) => {
						e.stopPropagation();
						onhistoryclick?.(tracker.id);
					}}
				>
					<svg
						width="16"
						height="16"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
					>
						<circle cx="12" cy="12" r="10" />
						<polyline points="12,6 12,12 16,14" />
					</svg>
					{serviceLogs.length}
				</button>
			{/if}
			{#if tracker.status !== 'ok'}
				<button
					class="log-btn"
					class:log-btn--active={isLogging}
					onclick={(e) => {
						e.stopPropagation();
						onlogclick?.(tracker.id);
					}}
				>
					{isLogging ? $_('common.cancel') : $_('maintenance.tracker.logNow')}
				</button>
			{/if}
			{#if onoptionsclick}
				<button
					class="options-btn"
					onclick={(e) => {
						e.stopPropagation();
						onoptionsclick!(tracker.id);
					}}
					aria-label="Tracker options">⋮</button
				>
			{/if}
		</div>
	</div>

	{#if showHistory && serviceLogs.length > 0}
		<div class="tracker-history">
			{#each historyGrouped() as [yearMonth, logs]}
				<div class="history-month">
					<div class="history-month-label">
						<span class="history-month-name">{yearMonth}</span>
						<span class="history-month-line"></span>
					</div>
					{#each logs as log}
						<div class="history-entry">
							<span class="history-dot"></span>
							<span class="history-title">{tracker.template.name}</span>
							<span class="history-meta">
								{formatDateShort(log.performed_at, locale)} · {formatNumber(
									log.odometer_at_service,
									locale
								)}
								{vehicleUnit}
								{#if log.cost_cents}
									<span class="history-cost">
										· {formatCurrency(log.cost_cents, log.currency, locale)}</span
									>
								{/if}
							</span>
						</div>
					{/each}
				</div>
			{/each}
		</div>
	{/if}
</div>

<style>
	.tracker-card {
		position: relative;
		border-left: 3px solid var(--border);
		padding: 1rem 0.5rem 1rem 1.25rem;
		background: var(--bg);
		cursor: pointer;
		transition: border-left-color 0.15s cubic-bezier(0.25, 1, 0.5, 1);
	}
	/* Hover tint via pseudo-element — opacity-only = GPU composited, no repaint */
	.tracker-card::before {
		content: '';
		position: absolute;
		inset: 0;
		background: var(--bg-subtle);
		opacity: 0;
		transition: opacity 0.15s cubic-bezier(0.25, 1, 0.5, 1);
		pointer-events: none;
	}
	.tracker-card--due::before {
		background: color-mix(in srgb, var(--status-due) 4%, var(--bg-subtle));
	}
	.tracker-card--overdue::before {
		background: color-mix(in srgb, var(--status-overdue) 4%, var(--bg-subtle));
	}
	.tracker-card:hover::before {
		opacity: 1;
	}
	.tracker-card--due {
		border-left-color: var(--status-due);
	}
	.tracker-card--overdue {
		border-left-color: var(--status-overdue);
	}
	/* Log success flash — border animates directly (3px strip, cheap), tint via ::after opacity */
	.tracker-card::after {
		content: '';
		position: absolute;
		inset: 0;
		background: color-mix(in srgb, var(--status-ok) 10%, var(--bg));
		opacity: 0;
		pointer-events: none;
	}
	.tracker-card--logged {
		animation: log-success-border 1.6s cubic-bezier(0.25, 1, 0.5, 1) forwards;
	}
	.tracker-card--logged::after {
		animation: log-success-fade 1.6s cubic-bezier(0.25, 1, 0.5, 1) forwards;
	}
	@keyframes log-success-border {
		0%,
		55% {
			border-left-color: var(--status-ok);
		}
		100% {
			border-left-color: var(--border);
		}
	}
	@keyframes log-success-fade {
		0% {
			opacity: 1;
		}
		55% {
			opacity: 0.5;
		}
		100% {
			opacity: 0;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.tracker-card--logged,
		.tracker-card--logged::after {
			animation: none;
		}
	}

	.tracker-main {
		position: relative;
		z-index: 1;
		display: flex;
		align-items: flex-start;
		gap: 1rem;
	}
	.tracker-info {
		flex: 1;
		min-width: 0;
	}

	.tracker-name {
		font-size: var(--text-base);
		font-weight: 500;
		color: var(--text);
		transition: color 0.15s;
	}
	.tracker-card:hover .tracker-name {
		color: var(--accent);
	}
	.tracker-meta {
		font-size: var(--text-sm);
		color: var(--text-muted);
		margin-top: 0.125rem;
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem;
	}
	.meta-sep {
		color: var(--text-subtle);
	}
	.tracker-last {
		font-size: var(--text-xs);
		color: var(--text-subtle);
		margin-top: 0.25rem;
	}
	.tracker-actions {
		display: flex;
		align-items: center;
		align-self: center;
		gap: 0.5rem;
		flex-shrink: 0;
	}

	.history-btn {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		padding: 0.375rem 0.5rem;
		min-height: 44px;
		font-size: var(--text-xs);
		font-weight: 500;
		background: none;
		border: 1px solid var(--border);
		border-radius: 6px;
		cursor: pointer;
		color: var(--text-subtle);
		transition:
			border-color 0.15s,
			color 0.15s;
	}
	.history-btn:hover {
		border-color: var(--accent);
		color: var(--accent);
	}
	.history-btn svg {
		opacity: 0.7;
	}

	.log-btn {
		flex-shrink: 0;
		padding: 0.375rem 0.75rem;
		min-height: 44px;
		font-size: var(--text-sm);
		font-weight: 500;
		background: none;
		border: 1px solid var(--border);
		border-radius: 10px;
		cursor: pointer;
		color: var(--text-muted);
		white-space: nowrap;
		transition:
			border-color 0.15s cubic-bezier(0.25, 1, 0.5, 1),
			color 0.15s cubic-bezier(0.25, 1, 0.5, 1);
	}
	.log-btn:hover {
		border-color: var(--accent);
		color: var(--accent);
	}
	.log-btn--active {
		border-color: var(--border-strong);
		color: var(--text-subtle);
	}

	.tracker-card--due .log-btn {
		color: var(--status-due);
		border-color: color-mix(in srgb, var(--status-due) 50%, var(--border));
	}
	.tracker-card--overdue .log-btn {
		color: var(--status-overdue);
		border-color: color-mix(in srgb, var(--status-overdue) 50%, var(--border));
	}
	.tracker-card--due .log-btn:hover {
		border-color: var(--status-due);
	}
	.tracker-card--overdue .log-btn:hover {
		border-color: var(--status-overdue);
	}

	.options-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 36px;
		height: 36px;
		flex-shrink: 0;
		background: none;
		border: 1px solid transparent;
		border-radius: 6px;
		color: var(--text-subtle);
		font-size: 1rem;
		cursor: pointer;
		line-height: 1;
		opacity: 0;
		transition:
			opacity 0.15s,
			background 0.15s,
			border-color 0.15s;
	}
	.tracker-card:hover .options-btn,
	.options-btn:focus {
		opacity: 1;
	}
	@media (max-width: 480px) {
		.options-btn {
			opacity: 1;
			width: 44px;
			height: 44px;
		}
	}
	.options-btn:hover {
		background: var(--bg-muted);
		border-color: var(--border);
		color: var(--text);
	}

	/* Forecast mode */
	.forecast-info {
		color: var(--text-muted);
	}
	.forecast-confidence {
		color: var(--text-subtle);
		font-size: var(--text-xs);
		margin-left: 0.25rem;
	}

	/* History section */
	.tracker-history {
		position: relative;
		z-index: 2;
		margin-top: 0.75rem;
		padding-top: 0.75rem;
		border-top: 1px solid var(--border);
	}
	.history-month {
		margin-bottom: var(--space-4);
	}
	.history-month-label {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		margin-bottom: var(--space-2);
	}
	.history-month:first-child .history-month-line {
		display: none;
	}
	.history-month-name {
		font-size: var(--text-xs);
		font-weight: 600;
		color: var(--text-subtle);
		text-transform: uppercase;
		letter-spacing: 0.07em;
		flex-shrink: 0;
	}
	.history-month-line {
		flex: 1;
		height: 1px;
		background: var(--border);
	}
	.history-month:first-child .history-month-line {
		display: none;
	}
	.history-entry {
		display: flex;
		align-items: baseline;
		gap: 0.5rem;
		padding: 0.875rem 0;
		padding-left: 0.5rem;
		border-bottom: 1px solid var(--border);
	}
	.history-entry:first-child {
		border-top: 1px solid var(--border);
	}
	.history-dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: var(--text-subtle);
		flex-shrink: 0;
		margin-top: 0.35rem;
	}
	.history-title {
		font-size: var(--text-base);
		font-weight: 500;
		color: var(--text);
	}
	.history-meta {
		font-size: var(--text-sm);
		color: var(--text-muted);
		font-family: var(--font-mono);
		font-variant-numeric: tabular-nums;
	}
	.history-cost {
		color: var(--text-subtle);
	}
</style>
