<script lang="ts">
	interface Props {
		padding?: boolean;
		hoverable?: boolean;
		class?: string;
	}
	let {
		padding = true,
		hoverable = false,
		class: className = '',
		children
	}: Props & { children?: import('svelte').Snippet } = $props();
</script>

<div class="card {className}" class:card--pad={padding} class:card--hover={hoverable}>
	{@render children?.()}
</div>

<style>
	.card {
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: 8px;
	}
	.card--pad {
		padding: 1.25rem;
	}
	.card--hover {
		transition: border-color 0.15s;
		cursor: pointer;
	}
	.card--hover:hover {
		border-color: var(--border-strong);
	}
</style>
