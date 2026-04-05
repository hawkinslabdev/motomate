<script lang="ts">
	interface Props {
		variant?: 'primary' | 'secondary' | 'ghost';
		size?: 'sm' | 'md' | 'lg';
		loading?: boolean;
		disabled?: boolean;
		type?: 'button' | 'submit' | 'reset';
		href?: string;
		class?: string;
		onclick?: (e: MouseEvent) => void;
	}

	let {
		variant = 'primary',
		size = 'md',
		loading = false,
		disabled = false,
		type = 'button',
		href,
		class: className = '',
		onclick,
		children
	}: Props & { children?: import('svelte').Snippet } = $props();
</script>

{#if href}
	<a {href} class="btn btn--{variant} btn--{size} {className}" class:loading>
		{#if loading}<span class="spinner" aria-hidden="true"></span>{/if}
		{@render children?.()}
	</a>
{:else}
	<button
		{type}
		{disabled}
		class="btn btn--{variant} btn--{size} {className}"
		class:loading
		{onclick}
	>
		{#if loading}<span class="spinner" aria-hidden="true"></span>{/if}
		{@render children?.()}
	</button>
{/if}

<style>
	.btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: var(--space-2);
		border-radius: 10px;
		font-weight: 500;
		cursor: pointer;
		border: 1px solid transparent;
		text-decoration: none;
		white-space: nowrap;
		transition:
			background 0.15s cubic-bezier(0.25, 1, 0.5, 1),
			border-color 0.15s cubic-bezier(0.25, 1, 0.5, 1),
			transform 0.12s cubic-bezier(0.25, 1, 0.5, 1),
			opacity 0.15s;
		font-family: var(--font-sans);
	}
	.btn:not(:disabled):not(.loading):hover {
		transform: translateY(-1px);
	}
	.btn:not(:disabled):not(.loading):active {
		transform: translateY(0) scale(0.97);
		transition-duration: 0.06s;
	}
	@media (prefers-reduced-motion: reduce) {
		.btn {
			transition:
				background 0.1s,
				border-color 0.1s,
				opacity 0.1s;
		}
		.btn:not(:disabled):not(.loading):hover,
		.btn:not(:disabled):not(.loading):active {
			transform: none;
		}
	}
	.btn:disabled,
	.btn.loading {
		opacity: 0.6;
		cursor: not-allowed;
		pointer-events: none;
	}

	/* Sizes */
	.btn--sm {
		padding: 0.375rem 0.75rem;
		font-size: var(--text-sm);
		min-height: 36px;
	}
	.btn--md {
		padding: 0.75rem 1rem;
		font-size: var(--text-sm);
		min-height: 48px;
	}
	.btn--lg {
		padding: 0.875rem 1.5rem;
		font-size: var(--text-base);
		min-height: 52px;
	}

	/* Primary */
	.btn--primary {
		background: var(--accent);
		color: #fff;
		border-color: var(--accent);
	}
	.btn--primary:hover {
		background: var(--accent-hover);
		border-color: var(--accent-hover);
	}

	/* Secondary */
	.btn--secondary {
		background: var(--bg);
		color: var(--text);
		border-color: var(--border);
	}
	.btn--secondary:hover {
		background: var(--bg-subtle);
		border-color: var(--border-strong);
	}

	/* Ghost */
	.btn--ghost {
		background: transparent;
		color: var(--text-muted);
		border-color: transparent;
	}
	.btn--ghost:hover {
		background: var(--bg-muted);
		color: var(--text);
	}

	/* Spinner */
	.spinner {
		width: 1em;
		height: 1em;
		border: 2px solid currentColor;
		border-top-color: transparent;
		border-radius: 50%;
		animation: spin 0.6s linear infinite;
		flex-shrink: 0;
	}
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
</style>
