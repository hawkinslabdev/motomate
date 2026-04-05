<script lang="ts">
	import { _ } from '$lib/i18n';

	let { data } = $props<{ data: { verified: boolean; error?: string } }>();
</script>

<svelte:head><title>{$_('auth.magicLink.title')} &middot; MotoMate</title></svelte:head>

<div class="magic-container">
	{#if data.verified}
		<div class="success-state">
			<div class="success-icon">✓</div>
			<p class="success-text">{$_('auth.magicLink.verifying')}</p>
		</div>
	{:else}
		<div class="error-state">
			<div class="error-icon">!</div>
			<p class="error-text">{data.error ?? $_('auth.magicLink.invalid')}</p>
			<a href="/login" class="retry-link">{$_('auth.magicLink.retry')}</a>
		</div>
	{/if}
</div>

<style>
	.magic-container {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		min-height: 200px;
		text-align: center;
	}

	.success-state,
	.error-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1rem;
	}

	.success-icon,
	.error-icon {
		width: 48px;
		height: 48px;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 1.5rem;
		font-weight: 600;
	}

	.success-icon {
		background: color-mix(in srgb, var(--status-ok) 15%, transparent);
		color: var(--status-ok);
	}

	.error-icon {
		background: color-mix(in srgb, var(--status-overdue) 15%, transparent);
		color: var(--status-overdue);
	}

	.success-text {
		font-size: var(--text-base);
		font-weight: 500;
		color: var(--status-ok);
		margin: 0;
	}

	.error-text {
		font-size: var(--text-base);
		color: var(--text);
		margin: 0;
		max-width: 280px;
	}

	.retry-link {
		font-size: var(--text-sm);
		color: var(--accent);
		text-decoration: none;
		transition: color 150ms ease;
	}

	.retry-link:hover {
		color: var(--accent-hover);
		text-decoration: underline;
	}

	.retry-link:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
</style>
