<script lang="ts">
	import { formatDateShort, formatCurrency } from '$lib/utils/format.js';
	import { _ } from '$lib/i18n';
	import type { Travel } from '$lib/db/schema.js';

	interface Props {
		travel: Travel;
		locale: string;
		selected?: boolean;
		onselect?: (travel: Travel) => void;
		onedit: (travel: Travel) => void;
		ondelete: (travel: Travel) => void;
	}

	let { travel, locale, selected = false, onselect, onedit, ondelete }: Props = $props();

	let menuOpen = $state(false);

	function toggleMenu(e: MouseEvent) {
		e.stopPropagation();
		menuOpen = !menuOpen;
	}

	function closeMenu() {
		menuOpen = false;
	}

	const endDate = $derived(() => {
		if (travel.duration_days <= 1) return null;
		const d = new Date(travel.start_date);
		d.setDate(d.getDate() + travel.duration_days - 1);
		return d.toISOString().slice(0, 10);
	});
</script>

<svelte:window onclick={closeMenu} />

<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div
	class="travel-entry"
	class:travel-entry--selected={selected}
	class:travel-entry--clickable={!!onselect}
	onclick={() => onselect?.(travel)}
	onkeydown={(e) => { if (onselect && (e.key === 'Enter' || e.key === ' ')) onselect(travel); }}
	tabindex={onselect ? 0 : undefined}
>
	<div class="entry-body">
		<div class="entry-title">{travel.title}</div>
		<div class="entry-meta">
			<span>{formatDateShort(travel.start_date, locale)}</span>
			{#if endDate()}
				<span class="sep">–</span>
				<span>{formatDateShort(endDate()!, locale)}</span>
			{/if}
			<span class="sep">·</span>
			<span>
				{$_('travels.entry.days', { values: { n: travel.duration_days } })}
			</span>
			{#if travel.gpx_document_ids.length > 0}
				<span class="sep">·</span>
				<span class="route-badge">
					{$_('travels.entry.routes', { values: { n: travel.gpx_document_ids.length } })}
				</span>
			{/if}
		</div>
		{#if travel.remark}
			<div class="entry-remark">{travel.remark}</div>
		{/if}
	</div>
	<div class="entry-right">
		{#if travel.total_expenses_cents != null}
			<span class="entry-cost mono">
				{formatCurrency(travel.total_expenses_cents, travel.currency, locale)}
			</span>
		{/if}
		<div class="menu-wrap">
			<button class="menu-btn" onclick={toggleMenu} aria-label="Actions" aria-expanded={menuOpen}>
				<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
					<circle cx="8" cy="3" r="1.25" />
					<circle cx="8" cy="8" r="1.25" />
					<circle cx="8" cy="13" r="1.25" />
				</svg>
			</button>
			{#if menuOpen}
				<div class="menu-dropdown">
					<button
						class="menu-item"
						onclick={(e) => { e.stopPropagation(); onedit(travel); menuOpen = false; }}
					>
						{$_('common.edit')}
					</button>
					<button
						class="menu-item menu-item--danger"
						onclick={(e) => { e.stopPropagation(); ondelete(travel); menuOpen = false; }}
					>
						{$_('common.delete')}
					</button>
				</div>
			{/if}
		</div>
	</div>
</div>

<style>
	.travel-entry {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--space-4);
		padding: 0.875rem var(--space-2) 0.875rem var(--space-2);
		border-bottom: 1px solid var(--border);
		border-left: 3px solid transparent;
		transition: background 0.15s;
	}
	.travel-entry:first-child {
		border-top: 1px solid var(--border);
	}
	.travel-entry--clickable {
		cursor: pointer;
	}
	.travel-entry--clickable:hover {
		background: var(--bg-subtle);
	}
	.travel-entry--selected {
		border-left-color: var(--accent);
		background: color-mix(in srgb, var(--accent) 4%, var(--bg));
	}
	.travel-entry--selected:hover {
		background: color-mix(in srgb, var(--accent) 6%, var(--bg));
	}
	.entry-body {
		flex: 1;
		min-width: 0;
	}
	.entry-title {
		font-size: var(--text-lg);
		font-weight: 600;
		color: var(--text);
		margin: 0;
	}
	.entry-meta {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.25rem;
		font-size: var(--text-sm);
		color: var(--text-muted);
		margin-top: 0.2rem;
	}
	.sep {
		color: var(--border-strong);
	}
	.route-badge {
		color: var(--accent);
	}
	.entry-remark {
		font-size: var(--text-sm);
		color: var(--text-subtle);
		margin-top: 0.25rem;
		line-height: var(--leading-base);
	}
	.entry-right {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		flex-shrink: 0;
	}
	.entry-cost {
		font-size: var(--text-sm);
		color: var(--text-muted);
		font-variant-numeric: tabular-nums;
	}
	.menu-wrap {
		position: relative;
	}
	.menu-btn {
		background: none;
		border: none;
		cursor: pointer;
		color: var(--text-subtle);
		padding: var(--space-1);
		border-radius: 6px;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: color 0.1s, background 0.1s;
	}
	.menu-btn:hover {
		color: var(--text);
		background: var(--bg-muted);
	}
	.menu-dropdown {
		position: absolute;
		right: 0;
		top: calc(100% + 4px);
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: 8px;
		box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
		min-width: 120px;
		z-index: 100;
		overflow: hidden;
	}
	.menu-item {
		display: block;
		width: 100%;
		padding: 0.6rem 1rem;
		background: none;
		border: none;
		text-align: left;
		font-size: var(--text-sm);
		color: var(--text);
		cursor: pointer;
		transition: background 0.1s;
	}
	.menu-item:hover {
		background: var(--bg-muted);
	}
	.menu-item--danger {
		color: var(--status-overdue);
	}
</style>
