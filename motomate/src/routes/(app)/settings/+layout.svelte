<script lang="ts">
	import { page } from '$app/stores';
	import { _, waitLocale } from '$lib/i18n';
	let { children } = $props<{ children?: import('svelte').Snippet }>();

	$effect(() => {
		waitLocale();
	});

	// eslint-disable-next-line no-undef
	const appVersion: string = __APP_VERSION__;

	const tabs = [
		{ href: '/settings/profile', labelKey: 'settings.nav.preferences' },
		{ href: '/settings/account', labelKey: 'settings.nav.account' },
		{ href: '/settings/notifications', labelKey: 'settings.nav.notifications' },
		{ href: '/settings/workflows', labelKey: 'settings.nav.workflows' },
		{ href: '/settings/integrations', labelKey: 'settings.nav.integrations' },
		{ href: '/settings/developer', labelKey: 'settings.nav.developer' }
	];

	let navOpen = $state(false);

	const activeLabelKey = $derived(
		tabs.find((tab) => tab.href === $page.url.pathname)?.labelKey ?? 'settings.title'
	);

	function closeNav() {
		navOpen = false;
	}

	function handleNavClickOutside(e: MouseEvent) {
		if (navOpen && !(e.target as Element).closest('.settings-nav-mobile')) closeNav();
	}

	function handleNavKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape' && navOpen) closeNav();
	}
</script>

<svelte:window onclick={handleNavClickOutside} onkeydown={handleNavKeydown} />

{#snippet navLinks(onLinkClick: () => void)}
	{#each tabs as tab}
		<a
			href={tab.href}
			class="settings-nav-link"
			class:settings-nav-link--active={$page.url.pathname === tab.href}
			onclick={onLinkClick}
		>
			{$_(tab.labelKey)}
		</a>
	{/each}

	<div class="settings-nav-divider" role="separator"></div>

	<a
		href="https://github.com/hawkinslabdev/motomate/issues"
		target="_blank"
		rel="noopener noreferrer"
		class="settings-nav-link external-link"
		onclick={onLinkClick}
	>
		<span>{$_('settings.nav.reportIssue')}</span>
		&nbsp;
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
		href="/settings/changelog"
		class="settings-nav-version"
		class:settings-nav-version--active={$page.url.pathname === '/settings/changelog'}
		data-tooltip={$_('settings.nav.changelog')}
		onclick={onLinkClick}>v{appVersion}</a
	>
{/snippet}

<div class="settings-shell">
	<div class="settings-header">
		<h1 class="settings-title">{$_('settings.title')}</h1>
	</div>
	<div class="settings-body">
		<nav class="settings-nav" aria-label={$_('settings.sectionsNav')}>
			{@render navLinks(() => {})}
		</nav>

		<div class="settings-nav-mobile">
			<button
				type="button"
				class="settings-nav-trigger"
				class:settings-nav-trigger--open={navOpen}
				onclick={() => (navOpen = !navOpen)}
				aria-expanded={navOpen}
				aria-haspopup="true"
			>
				<svg
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					aria-hidden="true"
				>
					<line x1="4" y1="7" x2="20" y2="7" />
					<line x1="4" y1="12" x2="20" y2="12" />
					<line x1="4" y1="17" x2="20" y2="17" />
				</svg>
				<span class="settings-nav-trigger-label">{$_(activeLabelKey)}</span>
				<svg
					class="settings-nav-trigger-chevron"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
					aria-hidden="true"
				>
					<polyline points="6 9 12 15 18 9" />
				</svg>
			</button>

			{#if navOpen}
				<nav class="settings-nav-dropdown" aria-label={$_('settings.sectionsNav')}>
					{@render navLinks(closeNav)}
				</nav>
			{/if}
		</div>

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
		background: color-mix(in srgb, var(--accent) 5%, var(--bg));
	}
	.settings-nav-link--active:hover {
		background: color-mix(in srgb, var(--accent) 8%, var(--bg));
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
	.settings-nav-version {
		position: relative;
		font-family: 'JetBrains Mono', monospace;
		font-size: var(--text-xs);
		color: var(--text-subtle);
		padding: 0.5rem 1rem;
		opacity: 0.7;
		text-decoration: none;
		display: block;
		transition:
			color 0.1s,
			opacity 0.1s;
	}
	.settings-nav-version:hover {
		color: var(--text-muted);
		opacity: 1;
	}
	.settings-nav-version--active {
		color: var(--accent);
		opacity: 1;
	}
	.settings-nav-version::after {
		content: attr(data-tooltip);
		position: absolute;
		top: calc(100% + 4px);
		left: 1rem;
		background: var(--bg-muted);
		border: 1px solid var(--border-strong);
		color: var(--text);
		font-family: Inter, system-ui, sans-serif;
		font-size: var(--text-xs);
		font-weight: 500;
		padding: 0.2rem 0.5rem;
		border-radius: 6px;
		white-space: nowrap;
		opacity: 0;
		pointer-events: none;
		transition: opacity 0.15s ease;
		z-index: 10;
	}
	.settings-nav-version:hover::after,
	.settings-nav-version:focus-visible::after {
		opacity: 1;
	}
	@media (prefers-reduced-motion: reduce) {
		.settings-nav-version::after {
			transition: none;
		}
	}
	.settings-nav-divider {
		height: 1px;
		background-color: var(--border);
		margin: 0.75rem;
		flex-shrink: 0;
	}
	.settings-content {
		min-width: 0;
	}

	.settings-nav-mobile {
		display: none;
	}

	@media (max-width: 640px) {
		.settings-shell {
			padding: var(--space-4);
		}
		.settings-body {
			grid-template-columns: 1fr;
		}
		.settings-nav {
			display: none;
		}
		.settings-nav-mobile {
			display: block;
			position: relative;
			margin-bottom: var(--space-4);
		}
		.settings-nav-trigger {
			display: flex;
			align-items: center;
			gap: 0.625rem;
			width: 100%;
			min-height: 44px;
			padding: 0.625rem 0.875rem;
			background: var(--bg);
			border: 1px solid var(--border);
			border-radius: 12px;
			color: var(--text);
			font-size: var(--text-sm);
			font-weight: 500;
			font-family: inherit;
			cursor: pointer;
		}
		.settings-nav-trigger svg:first-child {
			width: 18px;
			height: 18px;
			flex-shrink: 0;
			color: var(--text-muted);
		}
		.settings-nav-trigger-label {
			flex: 1;
			min-width: 0;
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
			text-align: left;
		}
		.settings-nav-trigger-chevron {
			width: 16px;
			height: 16px;
			flex-shrink: 0;
			color: var(--text-subtle);
			transition: transform 0.15s cubic-bezier(0.25, 1, 0.5, 1);
		}
		.settings-nav-trigger--open {
			border-color: var(--border-strong);
		}
		.settings-nav-trigger--open .settings-nav-trigger-chevron {
			transform: rotate(180deg);
		}
		.settings-nav-dropdown {
			position: absolute;
			top: calc(100% + 6px);
			left: 0;
			right: 0;
			display: flex;
			flex-direction: column;
			gap: 2px;
			background: var(--bg);
			border: 1px solid var(--border);
			border-radius: 14px;
			padding: 0.4rem;
			box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1);
			z-index: 30;
		}
		.settings-nav-dropdown .settings-nav-link {
			border-left: none;
			border-radius: 10px;
			padding: 0.625rem 0.75rem;
			min-height: 44px;
		}
		.settings-nav-dropdown .settings-nav-link--active {
			border-left: none;
		}
		.settings-nav-divider {
			margin: 0.4rem 0.75rem;
		}
		.external-link .external-icon {
			opacity: 0.5;
			transform: translateX(0);
		}
		.settings-nav-dropdown .settings-nav-version {
			border-left: none;
			min-height: 44px;
			display: flex;
			align-items: center;
			opacity: 1;
			font-family: 'JetBrains Mono', monospace;
		}
		.settings-nav-dropdown .settings-nav-version::after {
			display: none;
		}
	}
</style>
