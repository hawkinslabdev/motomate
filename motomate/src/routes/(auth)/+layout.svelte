<script lang="ts">
	import { page } from '$app/state';
	import { browser } from '$app/environment';
	import { readStoredLocale, setLocale, _ } from '$lib/i18n';
	import { SUPPORTED_LANGUAGES } from '$lib/i18n/locales.js';
	import { onMount, setContext, untrack } from 'svelte';
	import 'altcha/i18n';
	import type {} from 'altcha/types/svelte';
	import { resolveTheme, readStoredTheme, persistTheme } from '$lib/utils/theme.js';
	import Sun from '$lib/components/icons/Sun.svelte';
	import Moon from '$lib/components/icons/Moon.svelte';

	let { children, data } = $props<{
		children: any;
		data: { demoMode?: boolean };
	}>();

	let copied = $state<'email' | 'password' | null>(null);
	let hour = $state<number | null>(null);
	let riding = $state(false);
	onMount(() => {
		hour = new Date().getHours();
		riding = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
	});

	const greeting = $derived(
		hour === null
			? ''
			: hour < 12
				? $_('dashboard.greeting.morning')
				: hour < 18
					? $_('dashboard.greeting.afternoon')
					: $_('dashboard.greeting.evening')
	);

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
	let langQuery = $state('');
	let langSearchEl = $state<HTMLInputElement | null>(null);
	let langToggleEl = $state<HTMLButtonElement | null>(null);
	let tipsHidden = $state(false);

	const matchingLanguages = $derived.by(() => {
		const q = langQuery.trim().toLowerCase();
		if (!q) return SUPPORTED_LANGUAGES;
		return SUPPORTED_LANGUAGES.filter(
			(lang) => lang.label.toLowerCase().includes(q) || lang.code.toLowerCase().includes(q)
		);
	});

	function openLangMenu(open: boolean) {
		langMenuOpen = open;
		if (!open) langQuery = '';
	}

	$effect(() => {
		if (!langMenuOpen) return;
		if (window.matchMedia('(pointer: coarse)').matches) return;
		langSearchEl?.focus();
	});

	function onLangMenuKey(e: KeyboardEvent) {
		if (e.key !== 'Escape') return;
		openLangMenu(false);
		langToggleEl?.focus();
	}

	function onLangSearchKey(e: KeyboardEvent) {
		if (e.key === 'Enter' && matchingLanguages.length > 0) {
			e.preventDefault();
			setLanguage(matchingLanguages[0].code);
		}
	}

	setContext('altcha-locale', {
		get locale() {
			return currentLocale;
		}
	});

	let resolvedTheme = $state<'light' | 'dark'>('light');
	const CurrentThemeIcon = $derived(resolvedTheme === 'dark' ? Moon : Sun);

	$effect(() => {
		const urlTheme = page.url.searchParams.get('theme');
		if (urlTheme && ['light', 'dark', 'system'].includes(urlTheme)) {
			theme = urlTheme as 'light' | 'dark' | 'system';
		} else {
			persistTheme(theme);
		}
	});

	$effect(() => {
		const resolved = resolveTheme(theme);
		resolvedTheme = resolved;
		if (document.documentElement.dataset.theme !== resolved) {
			document.documentElement.dataset.theme = resolved;
		}
	});

	function cycleTheme() {
		const next = resolveTheme(theme) === 'dark' ? 'light' : 'dark';
		theme = next === resolveTheme('system') ? 'system' : next;
	}

	function setLanguage(code: string) {
		currentLocale = code;
		setLocale(code);
		openLangMenu(false);
	}
</script>

<svelte:document
	onkeydown={(e) => {
		if (e.key === 'Escape') tipsHidden = true;
	}}
	onclick={(e) => {
		if (langMenuOpen && !(e.target as Element).closest('.lang-toggle-wrap')) openLangMenu(false);
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
	<aside class="auth-hero select-none">
		<div class="hero-brand">
			<img src="/favicon.svg" alt="" width="44" height="44" />
			<span>MotoMate</span>
		</div>
		<div class="hero-copy">
			<p class="hero-greeting" class:is-ready={hour !== null}>{greeting}</p>
			<p class="hero-tagline">{$_('auth.tagline')}</p>
		</div>
		<svg
			class="hero-road"
			viewBox="0 0 600 420"
			preserveAspectRatio="xMidYMax slice"
			aria-hidden="true"
		>
			<g class="road-contours">
				<path d="M-20 120 C 90 80, 170 150, 280 110 S 470 40, 620 90" />
				<path d="M-20 165 C 100 125, 180 195, 290 155 S 480 85, 620 135" />
				<path d="M-20 210 C 110 172, 190 240, 300 200 S 490 130, 620 180" />
				<path d="M-20 255 C 120 220, 200 285, 310 245 S 500 175, 620 225" />
			</g>
			<path
				class="road-bed"
				pathLength="1"
				d="M-30 440 C 60 400, 120 330, 220 330 S 340 390, 420 330 S 520 210, 640 200"
			/>
			<path
				id="auth-road"
				class="road-line"
				d="M-30 440 C 60 400, 120 330, 220 330 S 340 390, 420 330 S 520 210, 640 200"
			/>
			{#if riding}
				<g class="road-rider">
					<circle r="16" class="rider-halo" />
					<circle r="6" class="rider-core" />
					<animateMotion
						dur="4s"
						begin="1.2s"
						repeatCount="1"
						fill="freeze"
						keyPoints="0;1"
						keyTimes="0;1"
						calcMode="spline"
						keySplines="0.45 0 0.55 1"
					>
						<mpath href="#auth-road" />
					</animateMotion>
				</g>
			{/if}
		</svg>
	</aside>

	<main class="auth-main">
		<div
			class="auth-tools"
			role="group"
			class:tips-hidden={tipsHidden}
			onpointerleave={() => (tipsHidden = false)}
		>
			<div class="lang-toggle-wrap">
				<button
					bind:this={langToggleEl}
					class="theme-toggle lang-toggle"
					onclick={() => openLangMenu(!langMenuOpen)}
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
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<div class="lang-dropdown" aria-label={$_('auth.language')} onkeydown={onLangMenuKey}>
						<input
							bind:this={langSearchEl}
							bind:value={langQuery}
							class="lang-search"
							type="text"
							autocomplete="off"
							spellcheck="false"
							placeholder={$_('auth.searchLanguage')}
							aria-label={$_('auth.searchLanguage')}
							onkeydown={onLangSearchKey}
						/>
						<div class="lang-list">
							{#each matchingLanguages as lang (lang.code)}
								<button
									class="lang-item"
									class:lang-item--active={currentLocale === lang.code}
									onclick={() => setLanguage(lang.code)}
								>
									<span class="lang-item-code">{lang.code.toUpperCase()}</span>
									<span class="lang-item-label">{lang.label}</span>
								</button>
							{:else}
								<p class="lang-empty">{$_('auth.noLanguageMatch')}</p>
							{/each}
						</div>
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

		<div class="auth-card">
			{@render children()}
		</div>

		<footer class="footer-actions select-none">
			<a
				href="https://github.com/hawkinslabdev/motomate"
				target="_blank"
				rel="noopener noreferrer"
				class="footer-link"
			>
				<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true">
					<path
						d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"
					/>
				</svg>
				GitHub
			</a>
			<a
				href="https://github.com/hawkinslabdev/motomate/issues"
				target="_blank"
				rel="noopener noreferrer"
				class="footer-link"
			>
				<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true">
					<path d="M14.4 6L14 4H5v17h2v-7h5.6l.4 2h7V6z" />
				</svg>
				Feedback
			</a>
		</footer>
	</main>
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
		--hero-bg: #2563eb;
		--hero-glow: #3b82f6;
		--hero-ink: #ffffff;
		--hero-ink-soft: color-mix(in srgb, #ffffff 90%, var(--hero-bg));
		position: relative;
		min-height: 100dvh;
		display: grid;
		grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr);
		gap: var(--space-2);
		padding: var(--space-3);
		background-color: var(--bg);
	}
	:global([data-theme='dark']) .auth-shell {
		--hero-bg: #1e40af;
		--hero-glow: #2563eb;
	}

	.auth-hero {
		position: relative;
		isolation: isolate;
		overflow: hidden;
		display: flex;
		flex-direction: column;
		justify-content: space-between;
		gap: var(--space-8);
		padding: var(--space-7);
		border-radius: 20px;
		color: var(--hero-ink);
		background:
			radial-gradient(120% 90% at 0% 0%, var(--hero-glow) 0%, transparent 60%), var(--hero-bg);
	}

	.hero-brand {
		position: relative;
		display: flex;
		align-items: center;
		gap: var(--space-3);
		font-size: var(--text-lg);
		font-weight: 600;
		letter-spacing: -0.01em;
	}
	.hero-brand img {
		border-radius: 12px;
		box-shadow: 0 6px 18px rgba(8, 20, 70, 0.35);
	}

	.hero-copy {
		position: relative;
		z-index: 1;
		margin-bottom: auto;
		max-width: 30rem;
	}
	.hero-greeting {
		margin: 0;
		min-height: 1.05em;
		font-size: clamp(2.5rem, 4.6vw, 4.25rem);
		font-weight: 600;
		line-height: 1.05;
		letter-spacing: -0.035em;
		text-wrap: balance;
		opacity: 0;
		transform: translateY(10px);
		transition:
			opacity 0.7s cubic-bezier(0.16, 1, 0.3, 1),
			transform 0.7s cubic-bezier(0.16, 1, 0.3, 1);
	}
	.hero-greeting.is-ready {
		opacity: 1;
		transform: none;
	}
	.hero-tagline {
		margin: var(--space-4) 0 0;
		max-width: 26ch;
		font-size: var(--text-lg);
		line-height: var(--leading-snug);
		color: var(--hero-ink-soft);
		text-wrap: pretty;
	}

	.hero-road {
		position: absolute;
		inset: auto 0 0 0;
		z-index: -1;
		width: 100%;
		height: 62%;
		pointer-events: none;
	}
	.road-contours path {
		fill: none;
		stroke: #ffffff;
		stroke-opacity: 0.1;
		stroke-width: 1.25;
	}
	.road-bed {
		fill: none;
		stroke: #0b1f66;
		stroke-opacity: 0.28;
		stroke-width: 46;
		stroke-linecap: round;
		stroke-dasharray: 1;
		stroke-dashoffset: 1;
		animation: road-draw 1.4s cubic-bezier(0.16, 1, 0.3, 1) 0.1s forwards;
	}
	.road-line {
		fill: none;
		stroke: #ffffff;
		stroke-opacity: 0.85;
		stroke-width: 3;
		stroke-linecap: round;
		stroke-dasharray: 18 22;
		opacity: 0;
		animation:
			road-fade 0.6s ease-out 0.9s forwards,
			road-ride 1.6s linear 0.9s 2;
	}
	.road-rider {
		opacity: 0;
		animation: road-fade 0.6s ease-out 1.2s forwards;
	}
	.rider-halo {
		fill: #ffffff;
		fill-opacity: 0.22;
	}
	.rider-core {
		fill: #ffffff;
	}
	@keyframes road-draw {
		to {
			stroke-dashoffset: 0;
		}
	}
	@keyframes road-fade {
		to {
			opacity: 1;
		}
	}
	@keyframes road-ride {
		to {
			stroke-dashoffset: 40;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.hero-greeting {
			transform: none;
			transition: opacity 0.2s;
		}
		.road-bed {
			animation: none;
			stroke-dashoffset: 0;
		}
		.road-line {
			animation: none;
			opacity: 1;
		}
	}

	.auth-main {
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: var(--space-2) var(--space-6) var(--space-4);
	}

	.auth-tools {
		align-self: flex-end;
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}

	.auth-card {
		width: 100%;
		max-width: 380px;
		margin-block: auto;
		padding-block: var(--space-8);
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
		top: calc(100% + 6px);
		left: 50%;
		transform: translateX(-50%);
		background: var(--text);
		color: var(--bg);
		padding: 0.375rem 0.5rem;
		border-radius: 6px;
		font-size: var(--text-xs);
		font-weight: 400;
		line-height: var(--leading-snug);
		white-space: nowrap;
		opacity: 0;
		pointer-events: none;
		transition: opacity 0.15s ease;
		z-index: 100;
	}
	.theme-toggle[data-tooltip]:hover::after {
		opacity: 1;
		pointer-events: auto;
	}
	.theme-toggle[aria-expanded='true']::after,
	.tips-hidden .theme-toggle[data-tooltip]::after {
		display: none;
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
		padding: 0.375rem;
		min-width: 15rem;
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
		gap: 0.75rem;
		width: 100%;
		min-height: 38px;
		padding: 0.5rem 0.75rem;
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
		font-size: var(--text-sm);
		font-weight: 500;
		letter-spacing: 0.04em;
		color: var(--text-subtle);
		width: 2rem;
		flex-shrink: 0;
	}
	.lang-item--active .lang-item-code {
		color: var(--accent);
	}
	.lang-item-label {
		font-size: var(--text-base);
		font-weight: 500;
		color: var(--text);
	}

	.lang-search {
		width: 100%;
		min-height: 38px;
		padding: 0.5rem 0.625rem;
		margin-bottom: 0.375rem;
		border: 1px solid var(--border-input);
		border-radius: 6px;
		background: var(--bg-subtle);
		color: var(--text);
		font-size: var(--text-md);
		font-family: inherit;
	}
	.lang-search::placeholder {
		color: var(--text-subtle);
	}
	.lang-search:focus {
		outline: 2px solid var(--accent);
		outline-offset: -1px;
		border-color: transparent;
	}

	.lang-list {
		display: flex;
		flex-direction: column;
		gap: 1px;
		max-height: 20rem;
		overflow-y: auto;
	}

	.lang-empty {
		margin: 0;
		padding: 0.5rem 0.625rem;
		font-size: var(--text-sm);
		color: var(--text-muted);
	}

	.footer-actions {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		justify-content: center;
		width: 100%;
		max-width: 380px;
	}

	.footer-link {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		font-size: var(--text-sm);
		font-weight: 500;
		color: var(--text-muted);
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

	@media (hover: none) {
		.theme-toggle[data-tooltip]::after {
			display: none;
		}
	}

	@media (pointer: coarse) {
		.theme-toggle {
			min-width: 44px;
			min-height: 44px;
			padding: 0.5rem;
		}
		.lang-item {
			min-height: 44px;
			padding: 0.625rem;
		}
		.lang-search {
			min-height: 44px;
			padding: 0.5rem 0.625rem;
		}
		.footer-link {
			padding: 0.5rem;
		}
	}

	@media (max-width: 860px) {
		.auth-shell {
			grid-template-columns: minmax(0, 1fr);
			grid-template-rows: auto 1fr;
			padding: max(0.5rem, env(safe-area-inset-top)) max(0.5rem, env(safe-area-inset-right)) 0
				max(0.5rem, env(safe-area-inset-left));
		}
		.auth-hero {
			gap: 0;
			padding: var(--space-4);
			border-radius: 16px;
		}
		.hero-brand {
			min-height: 44px;
			padding-right: 6.5rem;
			font-size: var(--text-base);
		}
		.hero-brand img {
			width: 32px;
			height: 32px;
			border-radius: 9px;
		}
		.hero-copy,
		.hero-road {
			display: none;
		}
		.auth-main {
			padding: 0 var(--space-4) max(var(--space-4), env(safe-area-inset-bottom));
		}
		.auth-tools {
			position: absolute;
			top: calc(max(0.5rem, env(safe-area-inset-top)) + var(--space-4));
			right: calc(max(0.5rem, env(safe-area-inset-right)) + var(--space-4));
			gap: var(--space-2);
			z-index: 2;
		}
		.auth-tools .theme-toggle {
			color: var(--hero-ink);
			border-color: color-mix(in srgb, #ffffff 35%, transparent);
			background: color-mix(in srgb, #ffffff 10%, transparent);
		}
		.auth-tools .theme-toggle:hover {
			background: color-mix(in srgb, #ffffff 20%, transparent);
		}
		.auth-card {
			max-width: 420px;
			padding-block: var(--space-5) var(--space-6);
		}
		.demo-banner {
			padding: 0.5rem 1rem;
			flex-wrap: wrap;
		}
		.lang-dropdown {
			min-width: min(17rem, calc(100vw - 2rem));
		}
		.lang-list {
			max-height: min(50vh, 20rem);
		}
	}

	@media (max-width: 380px) {
		.auth-card {
			padding-top: var(--space-3);
		}
	}
</style>
