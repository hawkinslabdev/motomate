<script lang="ts">
	interface Tab {
		id: string;
		label: string;
		href?: string;
	}
	interface Props {
		tabs: Tab[];
		active: string;
		onchange?: (id: string) => void;
	}
	let { tabs, active, onchange }: Props = $props();
</script>

<div class="tabs" role="tablist">
	{#each tabs as tab}
		{#if tab.href}
			<a
				href={tab.href}
				class="tab"
				class:tab--active={active === tab.id}
				role="tab"
				aria-selected={active === tab.id}
			>
				{tab.label}
			</a>
		{:else}
			<button
				class="tab"
				class:tab--active={active === tab.id}
				role="tab"
				aria-selected={active === tab.id}
				onclick={() => onchange?.(tab.id)}
			>
				{tab.label}
			</button>
		{/if}
	{/each}
</div>

<style>
	.tabs {
		display: flex;
		gap: 0;
		border-bottom: 1px solid var(--border);
	}
	.tab {
		padding: 0.625rem 1rem;
		font-size: 0.875rem;
		font-weight: 500;
		color: var(--text-muted);
		background: none;
		border: none;
		border-bottom: 2px solid transparent;
		cursor: pointer;
		text-decoration: none;
		transition:
			color 0.1s,
			border-color 0.1s;
		margin-bottom: -1px;
	}
	.tab:hover {
		color: var(--text);
	}
	.tab--active {
		color: var(--text);
		border-bottom-color: var(--accent);
	}
</style>
