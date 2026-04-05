<script lang="ts">
	interface Props {
		icon?: string;
		title: string;
		description?: string;
		children?: import('svelte').Snippet;
	}
	let { icon = '○', title, description, children }: Props = $props();
</script>

<div class="empty">
	<div class="empty-icon" aria-hidden="true">{icon}</div>
	<p class="empty-title">{title}</p>
	{#if description}<p class="empty-desc">{description}</p>{/if}
	{#if children}
		<div class="empty-actions">
			{@render children()}
		</div>
	{/if}
</div>

<style>
	.empty {
		display: flex;
		flex-direction: column;
		align-items: center;
		text-align: center;
		padding: 3rem 1.5rem;
		gap: 0;
	}
	.empty-icon {
		font-size: 3rem;
		margin-bottom: 1rem;
		line-height: 1;
	}
	.empty-title {
		font-size: var(--text-lg);
		font-weight: 600;
		color: var(--text);
		margin: 0 0 0.5rem;
		line-height: var(--leading-tight);
	}
	.empty-desc {
		font-size: var(--text-sm);
		color: var(--text-muted);
		margin: 0;
		max-width: 320px;
		line-height: var(--leading-base);
	}
	.empty-actions {
		margin-top: 1.25rem;
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
		justify-content: center;
	}
</style>
