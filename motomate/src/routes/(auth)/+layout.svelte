<script lang="ts">
	import { page } from '$app/state';
	import { browser } from '$app/environment';
	import { readStoredLocale, setLocale, _ } from '$lib/i18n';
	import { SUPPORTED_LANGUAGES } from '$lib/i18n/locales.js';
	import { setContext, untrack } from 'svelte';
	import 'altcha/i18n';
	import type {} from 'altcha/types/svelte';
	import { resolveTheme, readStoredTheme } from '$lib/utils/theme.js';
	import Sun from '$lib/components/icons/Sun.svelte';
	import Moon from '$lib/components/icons/Moon.svelte';
	import Monitor from '$lib/components/icons/Monitor.svelte';

	let { children, data } = $props<{
		children: any;
		data: { demoMode?: boolean };
	}>();

	let copied = $state<'email' | 'password' | null>(null);

	async function copyToClipboard(text: string, field: 'email' | 'password') {
		try {
			if (navigator.clipboard?.writeText) {
				await navigator.clipboard.writeText(text);
			} else {
				const el = document.createElement('textarea');
				el.value = text;
				el.style.position = 'fixed';
				el.style.opacity = '0';
				document.body.appendChild(el);
				el.select();
				document.execCommand('copy');
				document.body.removeChild(el);
			}
			copied = field;
			setTimeout(() => (copied = null), 1800);
		} catch {
			// perhaps clipboard unavailable
		}
	}

	const themes = [
		{ id: 'light', label: 'Light', icon: Sun },
		{ id: 'dark', label: 'Dark', icon: Moon },
		{ id: 'system', label: 'System', icon: Monitor }
	] as const;

	// Initialise synchronously; correcting in $effect later causes a double-render flash
	const initialTheme: 'light' | 'dark' | 'system' = browser ? readStoredTheme() : 'system';
	const initialLocale: string = browser
		? untrack(() => data.demoMode)
			? 'en'
			: readStoredLocale()
		: 'en';

	const initialResolvedTheme = browser ? resolveTheme(initialTheme) : 'light';

	if (browser) {
		document.documentElement.dataset.theme = initialResolvedTheme;
		document.cookie = `locale=${initialLocale}; path=/; max-age=31536000; SameSite=Lax`;
		localStorage.setItem('locale', initialLocale);
	}

	let theme = $state<'light' | 'dark' | 'system'>(initialTheme);
	let langMenuOpen = $state(false);
	let currentLocale = $state(initialLocale);

	setContext('altcha-locale', {
		get locale() {
			return currentLocale;
		}
	});

	const CurrentThemeIcon = $derived(themes.find((t) => t.id === theme)?.icon);

	$effect(() => {
		const urlTheme = page.url.searchParams.get('theme');
		if (urlTheme && ['light', 'dark', 'system'].includes(urlTheme)) {
			theme = urlTheme as 'light' | 'dark' | 'system';
		} else {
			localStorage.setItem('theme', theme);
		}
	});

	$effect(() => {
		const resolved = resolveTheme(theme);
		if (document.documentElement.dataset.theme !== resolved) {
			document.documentElement.dataset.theme = resolved;
		}
	});

	function cycleTheme() {
		if (theme === 'light') theme = 'dark';
		else if (theme === 'dark') theme = 'system';
		else theme = 'light';
	}

	function setLanguage(code: string) {
		currentLocale = code;
		setLocale(code);
		langMenuOpen = false;
	}
</script>

<svelte:document
	onclick={(e) => {
		if (langMenuOpen && !(e.target as Element).closest('.lang-toggle-wrap')) langMenuOpen = false;
	}}
/>
<div class="demo-banner" class:active={data.demoMode}>
	{#if data.demoMode}
		<span class="demo-label">Demo instance</span>
		<div class="demo-creds">
			<button class="demo-cred" onclick={() => copyToClipboard('demo@motomate.local', 'email')}>
				demo@motomate.local
				<span class="demo-copy-hint">{copied === 'email' ? 'copied' : 'copy'}</span>
			</button>
			<span class="demo-sep">/</span>
			<button class="demo-cred" onclick={() => copyToClipboard('password123', 'password')}>
				password123
				<span class="demo-copy-hint">{copied === 'password' ? 'copied' : 'copy'}</span>
			</button>
		</div>
	{/if}
</div>
<div class="auth-shell">
	<div class="auth-card">
		<div class="auth-header">
			<div class="auth-logo select-none">
				<img src="/favicon.svg" alt="MotoMate" width="40" height="40" />
				<span>MotoMate</span>
			</div>
			<div class="auth-header-actions">
				<div class="lang-toggle-wrap">
					<button
						class="theme-toggle lang-toggle"
						onclick={() => (langMenuOpen = !langMenuOpen)}
						aria-label={$_('auth.changeLanguage')}
						aria-expanded={langMenuOpen}
						data-tooltip={$_('auth.language')}
					>
						<svg
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
							aria-hidden="true"
						>
							<circle cx="12" cy="12" r="10" />
							<path
								d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"
							/>
						</svg>
					</button>
					{#if langMenuOpen}
						<div class="lang-dropdown" role="menu">
							{#each SUPPORTED_LANGUAGES as lang (lang.code)}
								<button
									role="menuitem"
									class="lang-item"
									class:lang-item--active={currentLocale === lang.code}
									onclick={() => setLanguage(lang.code)}
								>
									<span class="lang-item-code">{lang.code.toUpperCase()}</span>
									<span class="lang-item-label">{lang.label}</span>
								</button>
							{/each}
						</div>
					{/if}
				</div>
				<button
					class="theme-toggle"
					onclick={cycleTheme}
					aria-label={$_('auth.toggleTheme')}
					data-tooltip={$_('auth.theme')}
				>
					{#if CurrentThemeIcon}
						<CurrentThemeIcon />
					{/if}
				</button>
			</div>
		</div>
		{@render children()}
	</div>

	<div class="footer-actions select-none">
		<a
			href="https://github.com/hawkinslabdev/motomate"
			target="_blank"
			rel="noopener noreferrer"
			class="footer-link"
		>
			<svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor">
				<path
					d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"
				/>
			</svg>
			GitHub
		</a>
		<span class="footer-dot">•</span>
		<a
			href="https://github.com/hawkinslabdev/motomate/issues"
			target="_blank"
			rel="noopener noreferrer"
			class="footer-link"
		>
			<svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor">
				<path d="M14.4 6L14 4H5v17h2v-7h5.6l.4 2h7V6z" />
			</svg>
			Feedback
		</a>
	</div>
</div>

<style>
	.demo-banner:not(.active) {
		display: none;
	}

	.demo-banner {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.625rem;
		padding: 0.5rem var(--space-6);
		background: color-mix(in srgb, var(--status-due) 6%, var(--bg));
		border-bottom: 1px solid color-mix(in srgb, var(--status-due) 20%, var(--border));
		font-size: var(--text-sm);
		color: var(--text-muted);
		user-select: none;
	}
	.demo-label {
		font-weight: 500;
		color: var(--text-muted);
	}
	.demo-creds {
		display: flex;
		align-items: center;
		gap: 0.375rem;
	}
	.demo-cred {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		background: none;
		border: none;
		padding: 0;
		font-size: var(--text-xs);
		color: var(--text);
		cursor: pointer;
		text-decoration: underline;
		text-decoration-style: dotted;
		text-underline-offset: 2px;
		transition: color 0.12s;
	}
	.demo-cred:hover {
		color: var(--accent);
	}
	.demo-copy-hint {
		font-size: 0.625rem;
		color: var(--text-subtle);
		text-decoration: none;
	}
	.demo-sep {
		color: var(--text-subtle);
		font-size: var(--text-xs);
	}

	.auth-shell {
		min-height: 100dvh;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		background-color: var(--bg-subtle);
		padding: 1.5rem;
	}

	@keyframes auth-card-enter {
		from {
			opacity: 0;
			transform: translateY(12px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}
	.auth-card {
		width: 100%;
		max-width: 400px;
		background-color: var(--bg);
		border: 1px solid var(--border);
		border-radius: 12px;
		padding: 2rem;
		animation: auth-card-enter 0.45s cubic-bezier(0.22, 1, 0.36, 1) both;
	}
	@media (prefers-reduced-motion: reduce) {
		.auth-card {
			animation: none;
		}
	}

	.auth-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 2rem;
	}

	.auth-header-actions {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.auth-logo {
		display: flex;
		align-items: center;
		gap: 0.625rem;
		font-size: 1.125rem;
		font-weight: 600;
		color: var(--text);
	}

	.theme-toggle {
		background: none;
		border: 1px solid var(--border);
		border-radius: 8px;
		padding: 0.375rem 0.5rem;
		cursor: pointer;
		color: var(--text-muted);
		line-height: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		transition:
			background 150ms cubic-bezier(0.25, 1, 0.5, 1),
			color 150ms cubic-bezier(0.25, 1, 0.5, 1),
			border-color 150ms cubic-bezier(0.25, 1, 0.5, 1),
			transform 100ms cubic-bezier(0.25, 1, 0.5, 1);
	}
	.theme-toggle :global(svg) {
		width: 20px;
		height: 20px;
	}
	.theme-toggle:hover {
		background: var(--bg-muted);
		color: var(--text);
		transform: translateY(-1px);
	}
	.theme-toggle:active {
		transform: scale(0.94);
		transition-duration: 0.06s;
	}
	.theme-toggle:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
	.theme-toggle[data-tooltip] {
		position: relative;
	}
	.theme-toggle[data-tooltip]::after {
		content: attr(data-tooltip);
		position: absolute;
		bottom: calc(100% + 6px);
		left: 50%;
		transform: translateX(-50%);
		background: var(--text);
		color: var(--bg);
		padding: 0.2rem 0.5rem;
		border-radius: 4px;
		font-size: var(--text-xs);
		font-weight: 400;
		white-space: nowrap;
		opacity: 0;
		pointer-events: none;
		transition: opacity 0.15s ease;
		z-index: 100;
	}
	.theme-toggle[data-tooltip]:hover::after {
		opacity: 1;
	}
	@media (prefers-reduced-motion: reduce) {
		.theme-toggle {
			transition:
				background 150ms,
				color 150ms,
				border-color 150ms;
		}
		.theme-toggle:hover,
		.theme-toggle:active {
			transform: none;
		}
	}

	.lang-toggle-wrap {
		position: relative;
	}
	.lang-toggle :global(svg) {
		width: 20px;
		height: 20px;
	}
	@keyframes dropdown-enter {
		from {
			opacity: 0;
			transform: translateY(-6px) scale(0.97);
		}
		to {
			opacity: 1;
			transform: translateY(0) scale(1);
		}
	}
	.lang-dropdown {
		position: absolute;
		top: calc(100% + 6px);
		right: 0;
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: 10px;
		padding: 0.3rem;
		min-width: 160px;
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.1);
		z-index: 50;
		display: flex;
		flex-direction: column;
		gap: 1px;
		animation: dropdown-enter 0.18s cubic-bezier(0.25, 1, 0.5, 1) both;
	}
	@media (prefers-reduced-motion: reduce) {
		.lang-dropdown {
			animation: none;
		}
	}
	.lang-item {
		display: flex;
		align-items: center;
		gap: 0.625rem;
		width: 100%;
		padding: 0.5rem 0.625rem;
		background: none;
		border: none;
		border-radius: 6px;
		cursor: pointer;
		text-align: left;
		transition: background 0.1s;
	}
	.lang-item:hover {
		background: var(--bg-muted);
	}
	.lang-item--active {
		background: color-mix(in srgb, var(--accent) 8%, transparent);
	}
	.lang-item-code {
		font-size: var(--text-xs);
		font-weight: 600;
		font-family: var(--font-mono);
		color: var(--text-muted);
		width: 1.75rem;
		flex-shrink: 0;
	}
	.lang-item--active .lang-item-code {
		color: var(--accent);
	}
	.lang-item-label {
		font-size: var(--text-sm);
		font-weight: 500;
		color: var(--text);
	}

	.footer-actions {
		display: flex;
		align-items: center;
		gap: 0.625rem;
		margin-top: 1.5rem;
	}

	.footer-link {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		font-size: var(--text-xs, 0.75rem);
		font-weight: 500;
		color: var(--text-subtle, var(--text-muted));
		text-decoration: none;
		padding: 0.25rem 0.5rem;
		border-radius: 6px;
		transition:
			color 150ms ease,
			background-color 150ms ease;
	}

	.footer-link:hover {
		color: var(--text);
		background-color: var(--bg-muted);
	}

	.footer-dot {
		font-size: 0.5rem;
		color: var(--border);
	}
</style>
