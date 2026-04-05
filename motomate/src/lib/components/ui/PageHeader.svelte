<script lang="ts">
	let {
		title,
		subtitle,
		children
	}: {
		title: string;
		subtitle?: string;
		children?: import('svelte').Snippet;
	} = $props();
</script>

<div class="page-header">
	<div class="page-header-text">
		<h1 class="page-title">{title}</h1>
		{#if subtitle}
			<p class="page-sub">{subtitle}</p>
		{/if}
	</div>
	{#if children}
		<div class="page-actions">
			{@render children()}
		</div>
	{/if}
</div>

<style>
	.page-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--space-4);
		flex-wrap: wrap;
		margin-bottom: var(--space-6);
	}
	.page-header-text {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}
	.page-title {
		font-size: var(--text-2xl);
		font-weight: 600;
		color: var(--text);
		letter-spacing: -0.02em;
		line-height: var(--leading-tight);
		margin: 0;
	}
	.page-sub {
		font-size: var(--text-sm);
		color: var(--text-muted);
		margin: 0;
		line-height: var(--leading-snug);
	}
	.page-actions {
		display: flex;
		gap: var(--space-2);
		align-items: center;
		flex-shrink: 0;
	}
</style>
