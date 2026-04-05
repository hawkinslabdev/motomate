<script lang="ts">
	import { page } from '$app/stores';
	import { browser } from '$app/environment';
	import { locale } from '$lib/i18n';
	import Sun from '$lib/components/icons/Sun.svelte';
	import Moon from '$lib/components/icons/Moon.svelte';
	import Monitor from '$lib/components/icons/Monitor.svelte';

	let { children } = $props<{
		children: any;
	}>();

	const themes = [
		{ id: 'light', label: 'Light', icon: Sun },
		{ id: 'dark', label: 'Dark', icon: Moon },
		{ id: 'system', label: 'System', icon: Monitor }
	] as const;

	const languages = [
		{ code: 'en', label: 'English' },
		{ code: 'de', label: 'Deutsch' },
		{ code: 'fr', label: 'Français' },
		{ code: 'it', label: 'Italiano' },
		{ code: 'es', label: 'Español' },
		{ code: 'nl', label: 'Nederlands' },
		{ code: 'pt', label: 'Português' }
	];

	function readStoredTheme(): 'light' | 'dark' | 'system' {
		const stored = localStorage.getItem('theme');
		if (stored === 'light' || stored === 'dark' || stored === 'system') return stored;
		const t = document.documentElement.dataset.theme;
		if (t === 'light' || t === 'dark') return t;
		return 'system';
	}

	function readStoredLocale(): string {
		const stored = localStorage.getItem('locale');
		if (stored) return stored;
		const supported = languages.map((l) => l.code);
		for (const lang of navigator.languages ?? [navigator.language]) {
			const code = lang.split('-')[0].toLowerCase();
			if (supported.includes(code)) return code;
		}
		return 'en';
	}

	// Initialise synchronously so the component renders correctly on the first pass.
	// Starting with dummy defaults and correcting in $effect causes a double-render flash.
	const initialTheme: 'light' | 'dark' | 'system' = browser ? readStoredTheme() : 'system';
	const initialLocale: string = browser ? readStoredLocale() : 'en';

	function resolveTheme(t: 'light' | 'dark' | 'system'): 'light' | 'dark' {
		if (t === 'system') {
			return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
		}
		return t;
	}

	const initialResolvedTheme = browser ? resolveTheme(initialTheme) : 'light';

	if (browser) {
		document.documentElement.dataset.theme = initialResolvedTheme;
		document.cookie = `locale=${initialLocale}; path=/; max-age=31536000; SameSite=Lax`;
		localStorage.setItem('locale', initialLocale);
	}

	let theme = $state<'light' | 'dark' | 'system'>(initialTheme);
	let langMenuOpen = $state(false);
	let currentLocale = $state(initialLocale);

	const CurrentThemeIcon = $derived(themes.find((t) => t.id === theme)?.icon);

	$effect(() => {
		const urlTheme = $page.url.searchParams.get('theme');
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
		locale.set(code);
		localStorage.setItem('locale', code);
		document.cookie = `locale=${code}; path=/; max-age=31536000; SameSite=Lax`;
		langMenuOpen = false;
	}
</script>

<svelte:document
	onclick={(e) => {
		if (langMenuOpen && !(e.target as Element).closest('.lang-toggle-wrap')) langMenuOpen = false;
	}}
/>
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
						aria-label="Change language"
						aria-expanded={langMenuOpen}
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
							{#each languages as lang}
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
				<button class="theme-toggle" onclick={cycleTheme} aria-label="Toggle theme">
					{#if CurrentThemeIcon}
						<CurrentThemeIcon />
					{/if}
				</button>
			</div>
		</div>
		{@render children()}
	</div>

	<p class="footer-subtle select-none">
		<a
			href="https://github.com/hawkinslabdev/motomate"
			target="_blank"
			rel="noopener noreferrer"
			aria-label="MotoMate on GitHub"
		>
			<svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor">
				<path
					d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"
				/>
			</svg>
			Star
		</a>
		<span class="sep">·</span>
		<a
			href="https://github.com/hawkinslabdev/motomate/issues"
			target="_blank"
			rel="noopener noreferrer">Report</a
		>
	</p>
</div>

<style>
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

	.footer-subtle {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.375rem;
		margin-top: 1.5rem;
		font-size: var(--text-xs);
		color: var(--text-subtle);
	}
	.footer-subtle a {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		color: var(--text-subtle);
		text-decoration: none;
		transition: color 0.15s;
	}
	.footer-subtle a:hover {
		color: var(--accent);
	}
	.footer-subtle a:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
	.footer-subtle .sep {
		opacity: 0.5;
	}
</style>
