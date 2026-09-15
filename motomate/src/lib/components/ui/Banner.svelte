<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		variant = 'info',
		children,
		actions
	}: {
		variant?: 'info' | 'warn' | 'error';
		children: Snippet;
		actions?: Snippet;
	} = $props();
</script>

<div class="banner banner--{variant}">
	<div class="banner-info">{@render children()}</div>
	{#if actions}
		<div class="banner-actions">{@render actions()}</div>
	{/if}
</div>

<style>
	.banner {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
		padding: var(--space-3) var(--space-4);
		border-radius: 8px;
		font-size: var(--text-sm);
		flex-wrap: wrap;
	}
	.banner--info {
		background: color-mix(in srgb, var(--accent) 6%, var(--bg));
		border: 1px solid color-mix(in srgb, var(--accent) 20%, transparent);
	}
	.banner--warn {
		background: color-mix(in srgb, var(--status-due) 8%, var(--bg));
		border: 1px solid color-mix(in srgb, var(--status-due) 25%, transparent);
	}
	.banner--error {
		background: color-mix(in srgb, var(--status-overdue) 8%, var(--bg));
		border: 1px solid color-mix(in srgb, var(--status-overdue) 25%, transparent);
	}

	.banner-info {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		min-width: 0;
	}

	.banner-actions {
		display: flex;
		gap: var(--space-2);
		flex-shrink: 0;
	}

	:global(.banner-title) {
		color: var(--text);
		font-weight: 500;
	}
	:global(.banner-desc) {
		font-size: var(--text-xs);
		color: var(--text-muted);
	}
	:global(.banner-hint--warn) {
		font-size: var(--text-xs);
		color: var(--status-due);
	}

	:global(.banner-btn) {
		border-radius: 6px;
		font-size: var(--text-xs);
		font-weight: 500;
		cursor: pointer;
		padding: 0.25rem 0.625rem;
		white-space: nowrap;
		transition:
			background 0.1s,
			border-color 0.1s;
	}
	:global(.banner-btn--secondary) {
		background: none;
		border: 1px solid var(--border);
		color: var(--text-muted);
	}
	:global(.banner-btn--secondary:hover) {
		border-color: var(--border-strong);
	}
	:global(.banner-btn--primary) {
		background: none;
		border: 1px solid color-mix(in srgb, var(--accent) 30%, transparent);
		color: var(--accent);
	}
	:global(.banner-btn--primary:hover:not(:disabled)) {
		background: color-mix(in srgb, var(--accent) 10%, transparent);
		border-color: var(--accent);
	}
	:global(.banner-btn:disabled) {
		opacity: 0.6;
		cursor: default;
	}
</style>
