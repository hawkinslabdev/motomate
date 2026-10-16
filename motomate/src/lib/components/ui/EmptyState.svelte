<script lang="ts">
	interface Props {
		title: string;
		description?: string;
		road?: boolean;
		children?: import('svelte').Snippet;
	}
	let { title, description, road = true, children }: Props = $props();
</script>

<div class="empty" class:empty--quiet={!road}>
	{#if road}
		<svg class="empty-road" viewBox="0 0 200 56" aria-hidden="true">
			<path class="empty-road-bed" d="M4 48 C 44 46, 60 16, 100 22 S 160 44, 196 10" />
			<path class="empty-road-line" d="M4 48 C 44 46, 60 16, 100 22 S 160 44, 196 10" />
		</svg>
	{/if}
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
		padding: var(--space-10) var(--space-5);
	}
	.empty--quiet {
		padding: var(--space-8) var(--space-5);
	}
	.empty-road {
		width: 10rem;
		height: 2.8rem;
		margin-bottom: var(--space-5);
		overflow: visible;
	}
	.empty-road-bed {
		fill: none;
		stroke: var(--bg-muted);
		stroke-width: 14;
		stroke-linecap: round;
	}
	.empty-road-line {
		fill: none;
		stroke: var(--accent);
		stroke-width: 2;
		stroke-linecap: round;
		stroke-dasharray: 8 9;
	}
	.empty-title {
		font-size: var(--text-lg);
		font-weight: 600;
		color: var(--text);
		margin: 0 0 var(--space-2);
		line-height: var(--leading-tight);
	}
	.empty--quiet .empty-title {
		font-size: var(--text-base);
		font-weight: 500;
	}
	.empty-desc {
		font-size: var(--text-sm);
		color: var(--text-muted);
		margin: 0;
		max-width: 22rem;
		line-height: var(--leading-base);
	}
	.empty-actions {
		margin-top: var(--space-5);
		display: flex;
		gap: var(--space-2);
		flex-wrap: wrap;
		justify-content: center;
	}
</style>
