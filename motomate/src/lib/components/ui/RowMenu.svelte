<script lang="ts">
	import { _ } from '#lib/i18n/index.js';

	interface Item {
		label: string;
		href?: string;
		onclick?: () => void;
		danger?: boolean;
	}

	let { items }: { items: Item[] } = $props();

	let open = $state(false);
	let root = $state<HTMLElement | null>(null);

	function closeOnOutside(e: MouseEvent) {
		if (open && root && !e.composedPath().includes(root)) open = false;
	}
</script>

<svelte:window
	onclick={closeOnOutside}
	onkeydown={(e) => {
		if (open && e.key === 'Escape') open = false;
	}}
/>

<div class="row-menu" bind:this={root}>
	<button
		type="button"
		class="row-menu-btn"
		class:active={open}
		onclick={() => (open = !open)}
		aria-label={$_('common.entryOptions')}
		aria-haspopup="menu"
		aria-expanded={open}>⋮</button
	>
	{#if open}
		<div class="row-menu-dropdown" role="menu">
			{#each items as item}
				{#if item.href}
					<a
						role="menuitem"
						class="row-menu-item"
						href={item.href}
						target="_blank"
						rel="noopener"
						onclick={() => (open = false)}>{item.label}</a
					>
				{:else}
					<button
						type="button"
						role="menuitem"
						class="row-menu-item"
						class:row-menu-item--danger={item.danger}
						onclick={() => {
							open = false;
							item.onclick?.();
						}}>{item.label}</button
					>
				{/if}
			{/each}
		</div>
	{/if}
</div>

<style>
	.row-menu {
		position: relative;
		flex-shrink: 0;
		align-self: center;
	}
	.row-menu-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 36px;
		height: 36px;
		background: none;
		border: 1px solid transparent;
		border-radius: 6px;
		color: var(--text-subtle);
		font-size: 1rem;
		line-height: 1;
		cursor: pointer;
	}
	.row-menu-btn:hover,
	.row-menu-btn.active {
		background: var(--bg-muted);
		border-color: var(--border);
		color: var(--text);
	}
	.row-menu-btn:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 1px;
	}
	.row-menu-dropdown {
		position: absolute;
		right: 0;
		top: calc(100% + 2px);
		z-index: 30;
		min-width: 140px;
		padding: 0.25rem;
		display: flex;
		flex-direction: column;
		gap: 1px;
		background: var(--bg);
		border: 1px solid var(--border-strong);
		border-radius: 8px;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
	}
	.row-menu-item {
		display: block;
		width: 100%;
		padding: 0.5rem 0.75rem;
		border: none;
		border-radius: 5px;
		background: none;
		color: var(--text);
		font-size: var(--text-sm);
		font-weight: 500;
		text-align: left;
		text-decoration: none;
		cursor: pointer;
	}
	.row-menu-item:hover {
		background: var(--bg-muted);
	}
	.row-menu-item--danger {
		color: var(--status-overdue);
	}
	@media (pointer: coarse) {
		.row-menu-btn {
			width: 44px;
			height: 44px;
		}
	}
</style>
