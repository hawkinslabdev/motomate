<script lang="ts">
	import { formatNumber } from '#lib/utils/format.js';

	interface Point {
		label: string;
		value: number;
	}

	interface EventMarker {
		label: string;
		title: string;
	}

	let {
		points,
		events = [],
		formatValue = (v: number) => formatNumber(v, locale),
		accentColor = 'var(--accent)',
		height = 200,
		locale = 'en',
		ariaLabel = 'Line chart',
		oneventclick,
		viewLogLabel
	}: {
		points: Point[];
		events?: EventMarker[];
		formatValue?: (v: number) => string;
		accentColor?: string;
		height?: number;
		locale?: string;
		ariaLabel?: string;
		oneventclick?: () => void;
		viewLogLabel?: string;
	} = $props();

	const W = 600;
	const PAD = { top: 20, right: 20, bottom: 40, left: 56 };
	const INNER_W = W - PAD.left - PAD.right;

	const minVal = $derived(points.length ? Math.min(...points.map((p) => p.value)) : 0);
	const maxVal = $derived(points.length ? Math.max(...points.map((p) => p.value)) : 1);
	const valRange = $derived(Math.max(maxVal - minVal, 1));

	function toX(i: number, total: number): number {
		return PAD.left + (i / Math.max(total - 1, 1)) * INNER_W;
	}

	function smoothLinePath(pts: Point[], getY: (v: number) => number): string {
		if (pts.length === 0) return '';
		if (pts.length === 1) return `M ${toX(0, pts.length)} ${getY(pts[0].value)}`;
		const coords = pts.map((p, i) => ({ x: toX(i, pts.length), y: getY(p.value) }));
		let d = `M ${coords[0].x} ${coords[0].y}`;
		for (let i = 1; i < coords.length; i++) {
			const prev = coords[i - 1];
			const curr = coords[i];
			const cpx = (curr.x - prev.x) * 0.4;
			d += ` C ${prev.x + cpx} ${prev.y}, ${curr.x - cpx} ${curr.y}, ${curr.x} ${curr.y}`;
		}
		return d;
	}

	function areaPath(pts: Point[], getY: (v: number) => number, baseline: number): string {
		if (pts.length === 0) return '';
		const line = smoothLinePath(pts, getY);
		const lastX = toX(pts.length - 1, pts.length);
		const firstX = toX(0, pts.length);
		return `${line} L ${lastX} ${baseline} L ${firstX} ${baseline} Z`;
	}

	function formatMonthLabel(ym: string, loc: string): string {
		try {
			return new Date(ym + '-01').toLocaleDateString(loc, { month: 'short', year: 'numeric' });
		} catch {
			return ym;
		}
	}

	const yTicks = $derived.by(() => {
		const count = 4;
		return Array.from({ length: count + 1 }, (_, i) => {
			const v = minVal + (valRange * i) / count;
			return v;
		});
	});

	const xTickIndices = $derived.by(() => {
		if (points.length <= 6) return points.map((_, i) => i);
		const step = Math.floor(points.length / 6);
		const indices: number[] = [];
		for (let i = 0; i < points.length; i += step) indices.push(i);
		if (indices[indices.length - 1] !== points.length - 1) indices.push(points.length - 1);
		return indices;
	});

	let tooltipData = $state<{ x: number; y: number; label: string; value: string } | null>(null);
	let hoveredEvent = $state<string | null>(null);
	let eventTooltip = $state<{ x: number; y: number; month: string; title: string } | null>(null);
	let svgEl = $state<SVGSVGElement | undefined>();
	let touchDismissTimer: ReturnType<typeof setTimeout> | null = null;

	$effect(() => () => {
		if (touchDismissTimer) clearTimeout(touchDismissTimer);
	});

	function clearTouchDismiss() {
		if (touchDismissTimer) {
			clearTimeout(touchDismissTimer);
			touchDismissTimer = null;
		}
	}

	function showNearestTooltip(e: PointerEvent) {
		if (!svgEl || points.length === 0) return;
		clearTouchDismiss();
		const rect = svgEl.getBoundingClientRect();
		const relX = ((e.clientX - rect.left) / rect.width) * W;
		let nearest = 0;
		let minDist = Infinity;
		for (let i = 0; i < points.length; i++) {
			const dist = Math.abs(toX(i, points.length) - relX);
			if (dist < minDist) {
				minDist = dist;
				nearest = i;
			}
		}
		const p = points[nearest];
		tooltipData = {
			x: e.clientX - rect.left,
			y: e.clientY - rect.top,
			label: formatMonthLabel(p.label, locale),
			value: formatValue(p.value)
		};
	}

	function onPointerMove(e: PointerEvent) {
		showNearestTooltip(e);
	}

	function onPointerDown(e: PointerEvent) {
		if (e.pointerType !== 'touch') return;
		showNearestTooltip(e);
	}

	function onPointerLeave(e: PointerEvent) {
		if (e.pointerType === 'touch') {
			touchDismissTimer = setTimeout(() => {
				tooltipData = null;
				touchDismissTimer = null;
			}, 2500);
			return;
		}
		tooltipData = null;
	}

	function onEventPointerEnter(e: PointerEvent, ev: { label: string; title: string }) {
		clearTouchDismiss();
		hoveredEvent = ev.label;
		if (!svgEl) return;
		const rect = svgEl.getBoundingClientRect();
		eventTooltip = {
			x: e.clientX - rect.left,
			y: e.clientY - rect.top,
			month: formatMonthLabel(ev.label, locale),
			title: ev.title
		};
	}

	function onEventPointerLeave(e: PointerEvent) {
		if (e.pointerType === 'touch') {
			touchDismissTimer = setTimeout(() => {
				hoveredEvent = null;
				eventTooltip = null;
				touchDismissTimer = null;
			}, 2500);
			return;
		}
		hoveredEvent = null;
		eventTooltip = null;
	}
</script>

<div class="chart-wrap">
	<svg
		bind:this={svgEl}
		role="img"
		aria-label={ariaLabel}
		viewBox="0 0 {W} {height}"
		width="100%"
		preserveAspectRatio="xMidYMid meet"
		onpointermove={onPointerMove}
		onpointerdown={onPointerDown}
		onpointerleave={onPointerLeave}
		style="display:block; cursor:crosshair"
	>
		<defs>
			<linearGradient id="area-grad-line" x1="0" y1="0" x2="0" y2="1">
				<stop offset="0%" stop-color={accentColor} stop-opacity="0.18" />
				<stop offset="100%" stop-color={accentColor} stop-opacity="0" />
			</linearGradient>
		</defs>

		{#each yTicks as tick (tick)}
			{@const py = PAD.top + ((maxVal - tick) / valRange) * (height - PAD.top - PAD.bottom)}
			<line
				x1={PAD.left}
				x2={W - PAD.right}
				y1={py}
				y2={py}
				stroke="var(--border)"
				stroke-width="1"
			/>
			<text
				x={PAD.left - 6}
				y={py + 4}
				text-anchor="end"
				font-family="'JetBrains Mono', ui-monospace, monospace"
				font-size="10"
				fill="var(--text-subtle)"
			>
				{formatValue(tick)}
			</text>
		{/each}

		{#each xTickIndices as i (i)}
			{@const px = toX(i, points.length)}
			<text
				x={px}
				y={height - PAD.bottom + 16}
				text-anchor="middle"
				font-family="'JetBrains Mono', ui-monospace, monospace"
				font-size="9"
				fill="var(--text-subtle)"
			>
				{formatMonthLabel(points[i].label, locale)}
			</text>
		{/each}

		{#if points.length >= 2}
			{@const baseline = height - PAD.bottom}
			{@const getY = (v: number) =>
				PAD.top + ((maxVal - v) / valRange) * (height - PAD.top - PAD.bottom)}
			<path d={areaPath(points, getY, baseline)} fill="url(#area-grad-line)" />
			<path
				d={smoothLinePath(points, getY)}
				fill="none"
				stroke={accentColor}
				stroke-width="2"
				stroke-linejoin="round"
				stroke-linecap="round"
			/>
		{/if}

		{#if points.length <= 24}
			{#each points as p, i (p.label)}
				{@const px = toX(i, points.length)}
				{@const py = PAD.top + ((maxVal - p.value) / valRange) * (height - PAD.top - PAD.bottom)}
				<circle cx={px} cy={py} r="3" fill={accentColor} />
			{/each}
		{/if}

		{#each events as ev (ev.label)}
			{@const idx = points.findIndex((p) => p.label === ev.label)}
			{#if idx !== -1}
				{@const px = toX(idx, points.length)}
				{@const isHovered = hoveredEvent === ev.label}
				<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
				<line
					role={oneventclick ? 'button' : undefined}
					tabindex={oneventclick ? 0 : undefined}
					aria-label={ev.label}
					x1={px}
					x2={px}
					y1={PAD.top}
					y2={height - PAD.bottom}
					stroke={isHovered ? accentColor : 'var(--text-subtle)'}
					stroke-opacity={isHovered ? 0.4 : 1}
					stroke-width="1"
					stroke-dasharray="3 3"
					onclick={oneventclick}
					onkeydown={(e) => {
						if (e.key === 'Enter' || e.key === ' ') oneventclick?.();
					}}
					onpointerenter={(e) => onEventPointerEnter(e, ev)}
					onpointerleave={onEventPointerLeave}
					style="cursor: {oneventclick ? 'pointer' : 'default'}"
				/>
				<circle
					role={oneventclick ? 'button' : undefined}
					aria-label={ev.label}
					cx={px}
					cy={PAD.top}
					r={isHovered ? 5 : 3}
					fill={isHovered ? accentColor : 'var(--text-muted)'}
					onclick={oneventclick}
					onkeydown={(e) => {
						if (e.key === 'Enter' || e.key === ' ') oneventclick?.();
					}}
					onpointerenter={(e) => onEventPointerEnter(e, ev)}
					onpointerleave={onEventPointerLeave}
					style="cursor: {oneventclick ? 'pointer' : 'default'}"
				/>
			{/if}
		{/each}
	</svg>

	{#if tooltipData && !eventTooltip}
		<div
			class="chart-tooltip"
			style="left: {tooltipData.x}px; top: {Math.max(0, tooltipData.y - 52)}px"
		>
			<span class="tooltip-label">{tooltipData.label}</span>
			<span class="tooltip-value">{tooltipData.value}</span>
		</div>
	{/if}

	{#if eventTooltip}
		<div
			class="chart-tooltip"
			style="left: {eventTooltip.x}px; top: {Math.max(0, eventTooltip.y - 68)}px"
		>
			<span class="tooltip-label">{eventTooltip.month}</span>
			{#if eventTooltip.title}
				<span class="tooltip-value">{eventTooltip.title}</span>
			{/if}
			{#if viewLogLabel}
				<span class="tooltip-hint">{viewLogLabel}</span>
			{/if}
		</div>
	{/if}
</div>

<style>
	.chart-wrap {
		position: relative;
		overflow: visible;
	}

	.chart-tooltip {
		position: absolute;
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: 8px;
		padding: 0.375rem 0.625rem;
		pointer-events: none;
		display: flex;
		flex-direction: column;
		gap: 2px;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
		z-index: 100;
		white-space: nowrap;
	}

	.tooltip-label {
		font-size: var(--text-xs);
		color: var(--text-muted);
	}

	.tooltip-value {
		font-family: 'JetBrains Mono', ui-monospace, monospace;
		font-size: var(--text-sm);
		font-weight: 600;
		color: var(--text);
		font-variant-numeric: tabular-nums;
	}

	.tooltip-hint {
		font-size: var(--text-xs);
		color: var(--text-subtle);
		font-style: italic;
	}
</style>
