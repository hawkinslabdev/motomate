<script lang="ts">
	import { page } from '$app/stores';
	import { _, waitLocale } from '$lib/i18n';
	let { children } = $props<{ children?: import('svelte').Snippet }>();

	$effect(() => {
		waitLocale();
	});

	const tabs = [
		{ href: '/settings/profile', labelKey: 'settings.nav.preferences' },
		{ href: '/settings/account', labelKey: 'settings.nav.account' },
		{ href: '/settings/notifications', labelKey: 'settings.nav.notifications' },
		{ href: '/settings/workflows', labelKey: 'settings.nav.workflows' }
	];
</script>

<div class="settings-shell">
	<div class="settings-header">
		<h1 class="settings-title">{$_('settings.title')}</h1>
	</div>
	<div class="settings-body">
		<nav class="settings-nav" aria-label="Settings sections">
			{#each tabs as tab}
				<a
					href={tab.href}
					class="settings-nav-link"
					class:settings-nav-link--active={$page.url.pathname === tab.href}
				>
					{$_(tab.labelKey)}
				</a>
			{/each}

			<div class="settings-nav-divider" role="separator"></div>

			<a
				href="https://github.com/hawkinslabdev/motomate"
				target="_blank"
				rel="noopener noreferrer"
				class="settings-nav-link external-link"
			>
				<span>{$_('settings.nav.sourceCode')}</span>
				<svg
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
					class="external-icon"
				>
					<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
					<polyline points="15 3 21 3 21 9"></polyline>
					<line x1="10" y1="14" x2="21" y2="3"></line>
				</svg>
			</a>

			<a
				href="https://github.com/hawkinslabdev/motomate/issues"
				target="_blank"
				rel="noopener noreferrer"
				class="settings-nav-link external-link"
			>
				<span>{$_('settings.nav.reportIssue')}</span>
				<svg
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
					class="external-icon"
				>
					<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
					<polyline points="15 3 21 3 21 9"></polyline>
					<line x1="10" y1="14" x2="21" y2="3"></line>
				</svg>
			</a>
		</nav>
		<div class="settings-content">
			{#if children}
				{@render children()}
			{/if}
		</div>
	</div>
</div>

<style>
	.settings-shell {
		max-width: 860px;
		padding: var(--space-6) var(--space-6);
		margin: 0 auto;
	}
	.settings-header {
		margin-bottom: var(--space-6);
	}
	.settings-title {
		font-size: var(--text-2xl);
		font-weight: 600;
		color: var(--text);
		margin: 0;
		letter-spacing: -0.02em;
	}
	.settings-body {
		display: grid;
		grid-template-columns: 180px 1fr;
		gap: var(--space-7);
	}
	.settings-nav {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.settings-nav-link {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.5rem 0.75rem;
		border-left: 3px solid transparent;
		border-radius: 0 6px 6px 0;
		font-size: var(--text-sm);
		font-weight: 500;
		color: var(--text-muted);
		text-decoration: none;
		transition:
			background 0.1s,
			color 0.1s,
			border-color 0.1s;
	}
	.settings-nav-link:hover {
		background: var(--bg-muted);
		color: var(--text);
	}
	.settings-nav-link--active {
		border-left-color: var(--accent);
		color: var(--accent);
		background: transparent;
	}
	.external-link {
		opacity: 0.8;
	}
	.external-icon {
		width: 14px;
		height: 14px;
		stroke-width: 2.5px;
		opacity: 0;
		transform: translateX(-4px);
		transition:
			opacity 0.15s ease,
			transform 0.15s ease;
	}
	.external-link:hover .external-icon {
		opacity: 1;
		transform: translateX(0);
	}
	.settings-nav-divider {
		height: 1px;
		background-color: var(--border-muted, #e5e7eb);
		margin: 0.75rem;
		flex-shrink: 0;
	}
	.settings-content {
		min-width: 0;
	}
	@media (max-width: 640px) {
		.settings-shell {
			padding: var(--space-4);
		}
		.settings-body {
			grid-template-columns: 1fr;
		}
		.settings-nav {
			flex-direction: row;
			overflow-x: auto;
			-webkit-overflow-scrolling: touch;
			scrollbar-width: none;
			align-items: stretch;
			border-bottom: 1px solid var(--border);
			margin-bottom: var(--space-4);
			gap: 0;
		}
		.settings-nav::-webkit-scrollbar {
			display: none;
		}
		.settings-nav-link {
			border-left: none;
			border-bottom: 2px solid transparent;
			border-radius: 0;
			white-space: nowrap;
			padding: 0.625rem 0.875rem;
			min-height: 44px;
			justify-content: center;
		}
		.settings-nav-link--active {
			color: var(--accent);
			border-bottom-color: var(--accent);
		}
		.settings-nav-divider,
		.external-link {
			display: none;
		}
	}
</style>
