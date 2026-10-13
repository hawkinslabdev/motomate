<script lang="ts">
	import { _ } from '$lib/i18n';

	let { data } = $props<{ data: { verified: boolean; errorKey?: string } }>();
</script>

<svelte:head><title>{$_('auth.magicLink.title')} &middot; MotoMate</title></svelte:head>

{#if data.verified}
	<div class="page-header">
		<h1 class="page-title">{$_('auth.magicLink.verifying')}</h1>
	</div>
	<div class="loading-bar" role="status" aria-label={$_('auth.magicLink.verifying')}></div>
{:else}
	<div class="page-header">
		<h1 class="page-title">{$_('auth.magicLink.title')}</h1>
	</div>
	<div class="error-notice">
		<svg
			class="error-icon"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="1.75"
			stroke-linecap="round"
			stroke-linejoin="round"
			aria-hidden="true"
		>
			<circle cx="12" cy="12" r="10" />
			<line x1="12" y1="8" x2="12" y2="12" />
			<line x1="12" y1="16" x2="12.01" y2="16" />
		</svg>
		<p class="error-text">{$_(data.errorKey ?? 'auth.magicLink.invalid')}</p>
	</div>
	<a href="/login?mode=magic" class="btn-primary">{$_('auth.magicLink.retry')}</a>
{/if}

<style>
	.page-header {
		margin-bottom: var(--space-4);
	}
	.page-title {
		font-size: var(--text-2xl);
		font-weight: 600;
		color: var(--text);
		margin: 0;
		letter-spacing: -0.025em;
		line-height: var(--leading-tight);
	}

	.loading-bar {
		height: 2px;
		background: var(--border);
		border-radius: 999px;
		overflow: hidden;
		position: relative;
	}
	.loading-bar::after {
		content: '';
		position: absolute;
		top: 0;
		left: -40%;
		width: 40%;
		height: 100%;
		background: var(--accent);
		border-radius: inherit;
		animation: bar-slide 1.2s cubic-bezier(0.4, 0, 0.2, 1) infinite;
	}
	@keyframes bar-slide {
		0% {
			left: -40%;
		}
		100% {
			left: 100%;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.loading-bar::after {
			animation: none;
			left: 0;
			width: 100%;
			opacity: 0.4;
		}
	}

	.error-notice {
		display: flex;
		align-items: flex-start;
		gap: 0.75rem;
		padding: 0.875rem 1.125rem;
		background: color-mix(in srgb, var(--status-overdue) 6%, var(--bg));
		border: 1px solid color-mix(in srgb, var(--status-overdue) 20%, var(--border));
		border-radius: 10px;
		margin-bottom: var(--space-4);
	}
	.error-icon {
		width: 18px;
		height: 18px;
		color: var(--status-overdue);
		flex-shrink: 0;
		margin-top: 0.1rem;
	}
	.error-text {
		font-size: var(--text-sm);
		color: var(--text);
		line-height: var(--leading-base);
		margin: 0;
	}

	.btn-primary {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 100%;
		padding: 0.625rem 1rem;
		background: var(--accent);
		color: var(--bg);
		border: none;
		border-radius: 10px;
		font-weight: 500;
		font-size: var(--text-sm);
		text-decoration: none;
		cursor: pointer;
		transition:
			background 0.15s cubic-bezier(0.25, 1, 0.5, 1),
			transform 0.12s cubic-bezier(0.25, 1, 0.5, 1);
	}
	.btn-primary:hover {
		background: var(--accent-hover);
		transform: translateY(-1px);
	}
	.btn-primary:active {
		transform: scale(0.97);
		transition-duration: 0.06s;
	}
	.btn-primary:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
	@media (prefers-reduced-motion: reduce) {
		.btn-primary:hover,
		.btn-primary:active {
			transform: none;
		}
	}
</style>
