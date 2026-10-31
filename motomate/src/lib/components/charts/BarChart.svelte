<script lang="ts">
	import { formatNumber } from '#lib/utils/format.js';

	let {
		bars,
		formatValue = (v: number) => formatNumber(v, locale),
		accentColor = 'var(--accent)',
		height = 200,
		locale = 'en',
		ariaLabel = 'Bar chart',
		onbarclick,
		clickHint
	}: {
		bars: { label: string; value: number }[];
		formatValue?: (v: number) => string;
		accentColor?: string;
		height?: number;
		locale?: string;
		ariaLabel?: string;
		onbarclick?: (label: string) => void;
		clickHint?: string;
	} = $props();

	const W = 600;
	const PAD = { top: 20, right: 20, bottom: 40, left: 56 };
	const INNER_W = W - PAD.left - PAD.right;

	const INNER_H = $derived(height - PAD.top - PAD.bottom);

	const minVal = $derived(bars.length ? Math.min(0, Math.min(...bars.map((b) => b.value))) : 0);
	const maxVal = $derived(bars.length ? Math.max(...bars.map((b) => b.value)) : 1);
	const valRange = $derived(Math.max(maxVal - minVal, 1));

	const barW = $derived(bars.length > 0 ? (INNER_W / bars.length) * 0.65 : 0);

	function toX(i: number): number {
		const slotW = INNER_W / Math.max(bars.length, 1);
		return PAD.left + slotW * i + slotW / 2;
	}

	function toY(v: number): number {
		return PAD.top + ((maxVal - v) / valRange) * INNER_H;
	}

	const baseline = $derived(height - PAD.bottom);

	const yTicks = $derived.by(() => {
		const count = 4;
		return Array.from({ length: count + 1 }, (_, i) => {
			return minVal + (valRange * i) / count;
		});
	});

	const xTickIndices = $derived.by(() => {
		if (bars.length <= 6) return bars.map((_, i) => i);
		const step = Math.floor(bars.length / 6);
		const indices: number[] = [];
		for (let i = 0; i < bars.length; i += step) indices.push(i);
		if (indices[indices.length - 1] !== bars.length - 1) indices.push(bars.length - 1);
		return indices;
	});

	let hoveredBar = $state<number | null>(null);
	let tooltipData = $state<{ x: number; y: number; label: string; value: string } | null>(null);
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

	function formatMonthLabel(ym: string, loc: string): string {
		try {
			return new Date(ym + '-01').toLocaleDateString(loc, { month: 'short', year: 'numeric' });
		} catch {
			return ym;
		}
	}

	function onBarPointerEnter(e: PointerEvent, i: number) {
		clearTouchDismiss();
		hoveredBar = i;
		if (!svgEl) return;
		const rect = svgEl.getBoundingClientRect();
		const b = bars[i];
		tooltipData = {
			x: e.clientX - rect.left,
			y: e.clientY - rect.top,
			label: formatMonthLabel(b.label, locale),
			value: formatValue(b.value)
		};
	}

	function onBarPointerLeave(e: PointerEvent) {
		if (e.pointerType === 'touch') {
			touchDismissTimer = setTimeout(() => {
				hoveredBar = null;
				tooltipData = null;
				touchDismissTimer = null;
			}, 2500);
			return;
		}
		hoveredBar = null;
		tooltipData = null;
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
		onpointerleave={(e) => onBarPointerLeave(e)}
		style="display:block"
	>
		{#each yTicks as tick (tick)}
			{@const py = PAD.top + ((maxVal - tick) / valRange) * INNER_H}
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
			{@const px = toX(i)}
			<text
				x={px}
				y={height - PAD.bottom + 16}
				text-anchor="middle"
				font-family="'JetBrains Mono', ui-monospace, monospace"
				font-size="9"
				fill="var(--text-subtle)"
			>
				{formatMonthLabel(bars[i].label, locale)}
			</text>
		{/each}

		{#each bars as bar, i (bar.label)}
			{@const px = toX(i)}
			{@const py = toY(bar.value)}
			{@const bh = Math.max(0, baseline - py)}
			<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
			<rect
				role={onbarclick ? 'button' : 'graphics-symbol'}
				tabindex={onbarclick ? 0 : undefined}
				aria-label={bar.label}
				x={px - barW / 2}
				y={py}
				width={barW}
				height={bh}
				rx="2"
				fill={accentColor}
				fill-opacity={hoveredBar === i ? 1 : 0.8}
				onpointerenter={(e) => onBarPointerEnter(e, i)}
				onclick={() => onbarclick?.(bar.label)}
				onkeydown={(e) => {
					if (e.key === 'Enter' || e.key === ' ') onbarclick?.(bar.label);
				}}
				style="cursor: {onbarclick ? 'pointer' : 'default'}"
			/>
		{/each}
	</svg>

	{#if tooltipData}
		<div
			class="chart-tooltip"
			style="left: {tooltipData.x}px; top: {Math.max(0, tooltipData.y - 52)}px"
		>
			<span class="tooltip-label">{tooltipData.label}</span>
			<span class="tooltip-value">{tooltipData.value}</span>
			{#if onbarclick && clickHint}
				<span class="tooltip-hint">{clickHint}</span>
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
