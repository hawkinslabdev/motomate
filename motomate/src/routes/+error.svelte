<script lang="ts">
	import { page } from '$app/state';
	import { _ } from '$lib/i18n';
	import AuthShell from '$lib/components/auth/AuthShell.svelte';

	const notFound = $derived(page.status === 404);
</script>

<svelte:head>
	<title
		>{notFound ? $_('errorPage.notFoundTitle') : $_('errorPage.genericTitle')} &middot; MotoMate</title
	>
</svelte:head>

<AuthShell>
	<p class="error-status">{page.status}</p>
	<h1 class="page-title">
		{notFound ? $_('errorPage.notFoundTitle') : $_('errorPage.genericTitle')}
	</h1>
	<p class="page-subtitle">
		{notFound ? $_('errorPage.notFoundBody') : $_('errorPage.genericBody')}
	</p>
	<a href="/" class="btn-primary">{$_('errorPage.action')}</a>
</AuthShell>

<style>
	.error-status {
		margin: 0 0 var(--space-2);
		font-family: var(--font-mono);
		font-variant-numeric: tabular-nums;
		font-size: var(--text-sm);
		font-weight: 500;
		color: var(--text-muted);
	}
	.page-title {
		margin: 0 0 var(--space-2);
		font-size: var(--text-2xl);
		font-weight: 600;
		line-height: var(--leading-tight);
		letter-spacing: -0.025em;
		color: var(--text);
	}
	.page-subtitle {
		margin: 0 0 var(--space-5);
		font-size: var(--text-sm);
		line-height: var(--leading-base);
		color: var(--text-muted);
	}
	.btn-primary {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-height: 44px;
		padding: 0.625rem 1rem;
		background: var(--accent);
		color: var(--accent-fg);
		border-radius: 10px;
		font-size: var(--text-sm);
		font-weight: 500;
		text-decoration: none;
		transition: background 0.15s cubic-bezier(0.25, 1, 0.5, 1);
	}
	.btn-primary:hover {
		background: var(--accent-hover);
	}
	.btn-primary:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
</style>
