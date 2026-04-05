<script lang="ts">
	import { page } from '$app/stores';
	import { untrack } from 'svelte';
	import { goto } from '$app/navigation';
	import { fade, fly } from 'svelte/transition';
	import { _, setUserLocale } from '$lib/i18n';
	import NotificationBell from '$lib/components/ui/NotificationBell.svelte';
	import Toast from '$lib/components/ui/Toast.svelte';
	import ShortcutsModal from '$lib/components/ui/ShortcutsModal.svelte';
	import ConfirmDialog from '$lib/components/ui/ConfirmDialog.svelte';

	import Sun from '$lib/components/icons/Sun.svelte';
	import Moon from '$lib/components/icons/Moon.svelte';
	import Monitor from '$lib/components/icons/Monitor.svelte';

	type NavVehicle = {
		id: string;
		name: string;
		type: string;
		meta: { avatar_emoji?: string } | null;
	};

	let { children, data } = $props<{
		children: import('svelte').Snippet;
		data: { user: any; vehicles: NavVehicle[] };
	}>();

	// Initialize i18n with user's locale preference
	$effect(() => {
		if (data.user?.settings?.locale) {
			setUserLocale(data.user.settings.locale);
		}
	});

	const navLinks = [
		{ href: '/dashboard', labelKey: 'layout.nav.dashboard' },
		{ href: '/vehicles', labelKey: 'layout.nav.garage' },
		{ href: '/settings', labelKey: 'layout.nav.settings' }
	];

	const themes = [
		{ id: 'light', labelKey: 'layout.theme.light', icon: Sun },
		{ id: 'dark', labelKey: 'layout.theme.dark', icon: Moon },
		{ id: 'system', labelKey: 'layout.theme.system', icon: Monitor }
	] as const;

	let notifCount = $derived(data.unreadCount ?? 0);
	let shortcutsOpen = $state(false);
	let themeMenuOpen = $state(false);
	let isMobile = $state(false);
	let logoutConfirmOpen = $state(false);

	function checkMobile() {
		isMobile = window.innerWidth <= 768;
	}

	$effect(() => {
		checkMobile();
		let rafId: number;
		function onResize() {
			cancelAnimationFrame(rafId);
			rafId = requestAnimationFrame(checkMobile);
		}
		window.addEventListener('resize', onResize, { passive: true });
		return () => {
			cancelAnimationFrame(rafId);
			window.removeEventListener('resize', onResize);
		};
	});

	// Quick-add modal
	let quickAddOpen = $state(false);
	let quickAddStep = $state<'vehicle' | 'type'>('vehicle');
	let selectedVehicle = $state<NavVehicle | null>(null);

	function openQuickAdd() {
		if (data.vehicles.length === 0) {
			goto('/vehicles/new');
			return;
		}
		if (data.vehicles.length === 1) {
			selectedVehicle = data.vehicles[0];
			quickAddStep = 'type';
		} else {
			quickAddStep = 'vehicle';
			selectedVehicle = null;
		}
		quickAddOpen = true;
	}

	function closeQuickAdd() {
		quickAddOpen = false;
		quickAddStep = 'vehicle';
		selectedVehicle = null;
	}

	function quickAddNavigate(type: 'service' | 'odometer') {
		if (!selectedVehicle) return;
		closeQuickAdd();
		goto(`/vehicles/${selectedVehicle.id}?quick=${type}`);
	}

	function vehicleEmoji(v: NavVehicle) {
		return v.meta?.avatar_emoji ?? (v.type === 'scooter' ? '🛵' : v.type === 'bike' ? '🚲' : '🏍');
	}

	let currentTheme = $state(untrack(() => data.user.settings.theme ?? 'system'));

	const CurrentThemeIcon = $derived(themes.find((t) => t.id === currentTheme)?.icon);

	$effect(() => {
		if (currentTheme === 'system') {
			// Keep data-theme="system" so app.html script doesn't override on nav
			document.documentElement.dataset.theme = 'system';
		} else {
			document.documentElement.dataset.theme = currentTheme;
		}
	});

	async function setTheme(next: 'light' | 'dark' | 'system') {
		themeMenuOpen = false;
		currentTheme = next;

		// Sync to localStorage for auth pages after logout
		if (typeof window !== 'undefined') {
			localStorage.setItem('theme', next);
		}

		const fd = new FormData();
		fd.set('theme', next);
		fd.set('currency', data.user.settings.currency ?? 'EUR');
		fd.set('odometer_unit', data.user.settings.odometer_unit ?? 'km');
		fd.set('locale', data.user.settings.locale ?? 'en');

		await fetch('/settings/profile?/savePrefs', {
			method: 'POST',
			body: fd
		});
	}

	function toggleThemeMenu(e: MouseEvent) {
		e.preventDefault();
		themeMenuOpen = !themeMenuOpen;
	}

	function handleClickOutside(e: MouseEvent) {
		if (themeMenuOpen) {
			const target = e.target as Element;
			if (!target.closest('.theme-menu-container') && !target.closest('.theme-mobile-trigger')) {
				themeMenuOpen = false;
			}
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape' && themeMenuOpen) {
			themeMenuOpen = false;
			return;
		}

		if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as Element)?.tagName)) return;
		if (e.ctrlKey || e.metaKey || e.altKey) return;

		const key = e.key.toLowerCase();
		if (key === 'g') {
			e.preventDefault();
			const handleSecondKey = (ev: KeyboardEvent) => {
				const k = ev.key.toLowerCase();
				if (k === 'd') goto('/dashboard');
				if (k === 'g') goto('/vehicles');
				if (k === 's') goto('/settings');
				window.removeEventListener('keydown', handleSecondKey);
			};
			window.addEventListener('keydown', handleSecondKey, { once: true });
		}
		if (key === 'n') {
			e.preventDefault();
			goto('/vehicles/new');
		}
		if (key === '?') {
			e.preventDefault();
			shortcutsOpen = true;
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} onclick={handleClickOutside} />

<div class="app-shell">
	<header class="topnav">
		<div class="topnav-inner">
			<a href="/dashboard" class="topnav-logo">
				<img src="/favicon.svg" alt="" width="22" height="22" />
				<span>MotoMate</span>
			</a>

			<nav class="topnav-links">
				{#each navLinks as link}
					<a
						href={link.href}
						class="topnav-link"
						class:active={$page.url.pathname.startsWith(link.href)}
					>
						{$_(link.labelKey)}
					</a>
				{/each}
			</nav>

			<div class="topnav-end">
				<div class="action-item theme-menu-container">
					<button
						type="button"
						class="theme-trigger"
						class:open={themeMenuOpen}
						onclick={toggleThemeMenu}
					>
						{#if CurrentThemeIcon}
							<CurrentThemeIcon />
						{/if}
					</button>

					{#if themeMenuOpen && !isMobile}
						<button
							type="button"
							class="menu-overlay"
							onclick={() => (themeMenuOpen = false)}
							aria-label="Close menu"
						></button>

						<div
							class="theme-dropdown"
							in:fly={{ y: 8, duration: 150 }}
							out:fade={{ duration: 100 }}
						>
							{#each themes as t}
								<button
									type="button"
									class="theme-item"
									class:selected={currentTheme === t.id}
									onclick={() => setTheme(t.id)}
								>
									<span class="icon-wrapper">
										<t.icon />
									</span>
									{$_(t.labelKey)}
								</button>
							{/each}
						</div>
					{/if}
				</div>

				<div class="action-item">
					<NotificationBell count={notifCount} onclick={() => goto('/settings/notifications/all')} />
				</div>

				<button type="button" class="topnav-signout" onclick={() => (logoutConfirmOpen = true)}
					>{$_('layout.signOut')}</button
				>
			</div>
		</div>
	</header>

	<main class="app-main">
		{@render children()}
	</main>

	<nav class="bottom-tabs">
		<a
			href="/dashboard"
			class="bottom-tab"
			class:active={$page.url.pathname.startsWith('/dashboard')}
		>
			<svg
				class="tab-icon"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="1.75"
				stroke-linecap="round"
				stroke-linejoin="round"
				aria-hidden="true"
			>
				<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
				<polyline points="9 22 9 12 15 12 15 22" />
			</svg>
			<span class="tab-label">{$_('layout.nav.dashboard')}</span>
		</a>

		<a
			href="/vehicles"
			class="bottom-tab"
			class:active={$page.url.pathname.startsWith('/vehicles')}
		>
			<svg
				class="tab-icon"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="1.75"
				stroke-linecap="round"
				stroke-linejoin="round"
				aria-hidden="true"
			>
				<circle cx="5.5" cy="17.5" r="2.5" />
				<circle cx="18.5" cy="17.5" r="2.5" />
				<path d="M8 17.5h7" />
				<path d="M5.5 17.5L8 10h6l3 4.5" />
				<path d="M14 10l1.5-3H19" />
			</svg>
			<span class="tab-label">{$_('layout.nav.garage')}</span>
		</a>

		<div class="bottom-tab bottom-tab--fab">
			<button
				class="fab-btn"
				class:fab-btn--open={quickAddOpen}
				onclick={openQuickAdd}
				aria-label="Add entry"
			>
				<svg
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2.5"
					stroke-linecap="round"
					aria-hidden="true"
				>
					<line x1="12" y1="5" x2="12" y2="19" />
					<line x1="5" y1="12" x2="19" y2="12" />
				</svg>
			</button>
		</div>

		<a
			href="/settings"
			class="bottom-tab"
			class:active={$page.url.pathname.startsWith('/settings')}
		>
			<svg
				class="tab-icon"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="1.75"
				stroke-linecap="round"
				stroke-linejoin="round"
				aria-hidden="true"
			>
				<circle cx="12" cy="12" r="3" />
				<path
					d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"
				/>
			</svg>
			<span class="tab-label">{$_('layout.nav.settings')}</span>
		</a>

		<button type="button" class="bottom-tab theme-mobile-trigger" onclick={toggleThemeMenu}>
			<div class="tab-icon tab-icon--theme">
				{#if CurrentThemeIcon}
					<CurrentThemeIcon />
				{/if}
			</div>
			<span class="tab-label">{$_('layout.theme.title')}</span>
		</button>
	</nav>

	<!-- Mobile theme dropdown (above bottom bar) -->
	{#if themeMenuOpen && isMobile}
		<button
			type="button"
			class="menu-overlay"
			onclick={() => (themeMenuOpen = false)}
			aria-label="Close menu"
		></button>
		<div
			class="theme-dropdown theme-dropdown--mobile"
			in:fly={{ y: 8, duration: 150 }}
			out:fade={{ duration: 100 }}
		>
			{#each themes as t}
				<button
					type="button"
					class="theme-item"
					class:selected={currentTheme === t.id}
					onclick={() => setTheme(t.id)}
				>
					<span class="icon-wrapper"><t.icon /></span>
					{$_(t.labelKey)}
				</button>
			{/each}
		</div>
	{/if}
</div>

<!-- Quick-add modal -->
{#if quickAddOpen}
	<div
		class="quickadd-overlay"
		role="presentation"
		onclick={closeQuickAdd}
		in:fade={{ duration: 150 }}
		out:fade={{ duration: 120 }}
	>
		<div
			class="quickadd-sheet"
			role="dialog"
			aria-modal="true"
			onclick={(e) => e.stopPropagation()}
			onkeydown={(e) => e.key === 'Escape' && closeQuickAdd()}
			tabindex="-1"
			in:fly={{ y: 240, duration: 260, opacity: 1 }}
			out:fly={{ y: 240, duration: 200, opacity: 1 }}
		>
			<div class="sheet-handle" aria-hidden="true"></div>

			{#if quickAddStep === 'vehicle'}
				<div class="sheet-header">
					<p class="sheet-title">{$_('layout.addEntry.title')}</p>
					<button class="sheet-close" onclick={closeQuickAdd} aria-label={$_('common.close')}>
						<svg
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg
						>
					</button>
				</div>
				<p class="sheet-sub">{$_('layout.addEntry.chooseVehicle')}</p>
				<div class="pick-list">
					{#each data.vehicles as v}
						<button
							class="pick-item"
							onclick={() => {
								selectedVehicle = v;
								quickAddStep = 'type';
							}}
						>
							<span class="pick-emoji">{vehicleEmoji(v)}</span>
							<span class="pick-name">{v.name}</span>
							<svg
								class="pick-arrow"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
								stroke-linecap="round"
								stroke-linejoin="round"
								aria-hidden="true"><polyline points="9 18 15 12 9 6" /></svg
							>
						</button>
					{/each}
				</div>
			{:else}
				<div class="sheet-header">
					<button
						class="sheet-back"
						onclick={() => {
							quickAddStep = 'vehicle';
							selectedVehicle = null;
						}}
					>
						<svg
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"><polyline points="15 18 9 12 15 6" /></svg
						>
						{$_('common.back')}
					</button>
					<p class="sheet-title sheet-title--vehicle">{selectedVehicle?.name}</p>
					<button class="sheet-close" onclick={closeQuickAdd} aria-label="Close">
						<svg
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg
						>
					</button>
				</div>
				<p class="sheet-sub">{$_('layout.addEntry.whatLogging')}</p>
				<div class="pick-list">
					<button class="pick-item pick-item--type" onclick={() => quickAddNavigate('service')}>
						<span class="type-icon">
							<svg
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="1.75"
								stroke-linecap="round"
								stroke-linejoin="round"
								aria-hidden="true"
								><path
									d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"
								/></svg
							>
						</span>
						<span class="type-text">
							<span class="type-label">{$_('layout.addEntry.maintenance')}</span>
							<span class="type-desc">{$_('layout.addEntry.maintenanceDesc')}</span>
						</span>
						<svg
							class="pick-arrow"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
							aria-hidden="true"><polyline points="9 18 15 12 9 6" /></svg
						>
					</button>
					<button class="pick-item pick-item--type" onclick={() => quickAddNavigate('odometer')}>
						<span class="type-icon">
							<svg
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="1.75"
								stroke-linecap="round"
								stroke-linejoin="round"
								aria-hidden="true"><circle cx="12" cy="12" r="10" /><path d="M12 8v4l3 3" /></svg
							>
						</span>
						<span class="type-text">
							<span class="type-label">{$_('layout.addEntry.mileage')}</span>
							<span class="type-desc">{$_('layout.addEntry.mileageDesc')}</span>
						</span>
						<svg
							class="pick-arrow"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
							aria-hidden="true"><polyline points="9 18 15 12 9 6" /></svg
						>
					</button>
				</div>
			{/if}
		</div>
	</div>
{/if}

<Toast />
<ShortcutsModal bind:open={shortcutsOpen} />
<ConfirmDialog
	open={logoutConfirmOpen}
	title={$_('layout.logoutConfirm.title')}
	description={$_('layout.logoutConfirm.description')}
	confirmLabel={$_('layout.logoutConfirm.confirm')}
	cancelLabel={$_('layout.logoutConfirm.cancel')}
	onconfirm={async () => {
		await fetch('/auth/logout', { method: 'POST', redirect: 'manual' });
		window.location.href = '/login';
	}}
	onclose={() => (logoutConfirmOpen = false)}
/>

<style>
	.app-shell {
		display: flex;
		flex-direction: column;
		min-height: 100dvh;
	}

	.topnav {
		position: sticky;
		top: 0;
		z-index: 50;
		background: var(--bg);
		border-bottom: 1px solid var(--border);
	}

	.topnav-inner {
		display: flex;
		align-items: center;
		padding: 0 var(--space-6);
		height: 64px;
		max-width: 860px;
		margin: 0 auto;
		width: 100%;
	}

	.topnav-logo {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-weight: 600;
		color: var(--text);
		text-decoration: none;
		flex-shrink: 0;
	}

	.topnav-links {
		display: flex;
		gap: var(--space-1);
		margin-left: var(--space-4);
	}

	.topnav-link,
	.topnav-signout {
		padding: 0.4rem 0.8rem;
		font-size: var(--text-sm);
		font-weight: 500;
		color: var(--text-muted);
		text-decoration: none;
		border-radius: 12px;
		border: 3px solid transparent;
		transition:
			color 0.1s cubic-bezier(0.25, 1, 0.5, 1),
			background 0.1s cubic-bezier(0.25, 1, 0.5, 1),
			transform 0.12s cubic-bezier(0.25, 1, 0.5, 1);
		display: inline-flex;
		align-items: center;
		background: none;
		cursor: pointer;
	}

	.topnav-link:hover {
		color: var(--text);
		background: var(--bg-muted);
		transform: translateY(-1px);
	}

	.topnav-link.active {
		color: var(--text);
	}

	.topnav-link:active {
		transform: scale(0.97);
		transition-duration: 0.06s;
	}

	@media (prefers-reduced-motion: reduce) {
		.topnav-link,
		.topnav-signout {
			transition:
				color 0.1s,
				background 0.1s;
		}
		.topnav-link:hover,
		.topnav-link:active,
		.topnav-signout:hover,
		.topnav-signout:active {
			transform: none;
		}
	}

	.topnav-end {
		margin-left: auto;
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}

	.action-item {
		width: 42px;
		height: 42px;
		display: flex;
		align-items: center;
		justify-content: center;
		position: relative;
	}

	.theme-trigger {
		background: transparent;
		border: 3px solid transparent;
		color: var(--text-muted);
		width: 100%;
		height: 100%;
		border-radius: 12px;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		transition:
			background 0.15s cubic-bezier(0.25, 1, 0.5, 1),
			color 0.15s cubic-bezier(0.25, 1, 0.5, 1),
			border-color 0.15s cubic-bezier(0.25, 1, 0.5, 1);
		position: relative;
		z-index: 101; /* Above overlay */
	}

	.theme-trigger :global(svg),
	.bottom-tab :global(svg),
	.theme-item :global(svg) {
		width: 20px;
		height: 20px;
		pointer-events: none;
	}

	.theme-trigger:hover,
	.theme-trigger.open {
		background: var(--bg-muted);
		color: var(--text);
	}

	.theme-trigger:active {
		background: rgba(37, 99, 235, 0.04);
		border-color: rgba(37, 99, 235, 0.15);
	}

	.action-item :global(button:not(.theme-trigger):not(.theme-item)) {
		width: 42px !important;
		height: 42px !important;
		border: 3px solid transparent !important;
		border-radius: 12px !important;
		background: transparent !important;
		display: flex !important;
		align-items: center !important;
		justify-content: center !important;
		cursor: pointer !important;
		transition:
			background 0.15s cubic-bezier(0.25, 1, 0.5, 1),
			border-color 0.15s cubic-bezier(0.25, 1, 0.5, 1) !important;
	}

	.action-item :global(button:not(.theme-trigger):not(.theme-item):hover) {
		background: var(--bg-muted) !important;
	}

	.action-item :global(button:not(.theme-trigger):not(.theme-item):active) {
		background: rgba(37, 99, 235, 0.04) !important;
		border-color: rgba(37, 99, 235, 0.15) !important;
	}

	.theme-dropdown {
		position: absolute;
		top: 100%;
		right: 0;
		margin-top: 8px;
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: 14px;
		padding: 0.4rem;
		min-width: 140px;
		box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1);
		z-index: 105; /* Above everything */
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.theme-item {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.6rem 0.8rem;
		border: 3px solid transparent;
		background: transparent;
		color: var(--text);
		font-size: var(--text-sm);
		font-weight: 500;
		cursor: pointer;
		border-radius: 12px;
		text-align: left;
		width: 100%;
	}

	.theme-item:active,
	.theme-item.selected {
		background: rgba(37, 99, 235, 0.04);
		border-color: rgba(37, 99, 235, 0.15);
		color: var(--text);
	}

	.theme-item:hover:not(.selected) {
		background: var(--bg-muted);
	}

	.menu-overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.3);
		z-index: 104;
		border: none;
		cursor: default;
	}

	.topnav-signout {
		margin-left: var(--space-2);
	}

	.topnav-signout:hover {
		background: rgba(239, 68, 68, 0.05);
		color: var(--status-overdue);
		border-color: rgba(239, 68, 68, 0.1);
		transform: translateY(-1px);
	}

	.topnav-signout:active {
		background: rgba(239, 68, 68, 0.1) !important;
		border-color: rgba(239, 68, 68, 0.2) !important;
		color: var(--status-overdue) !important;
		transform: scale(0.97);
		transition-duration: 0.06s;
	}

	.icon-wrapper {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 1.25rem;
		height: 1.25rem;
	}

	.app-main {
		flex: 1;
	}

	/* ── Bottom tabs ── */
	.bottom-tabs {
		display: none;
		position: fixed;
		bottom: 0;
		width: 100%;
		background: var(--bg);
		border-top: 1px solid var(--border);
		padding-bottom: env(safe-area-inset-bottom);
		z-index: 50;
		align-items: stretch;
	}

	.bottom-tab {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.25rem;
		padding: 0.625rem 0;
		min-height: 56px;
		background: none;
		border: none;
		color: var(--text-muted);
		font-size: 0.6875rem;
		font-weight: 500;
		text-decoration: none;
		cursor: pointer;
		transition: color 0.1s;
	}
	.bottom-tab.active {
		color: var(--accent);
	}
	.tab-icon {
		width: 22px;
		height: 22px;
		flex-shrink: 0;
	}
	.tab-icon--theme {
		width: 22px;
		height: 22px;
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.tab-icon--theme :global(svg) {
		width: 20px;
		height: 20px;
	}
	.tab-label {
		line-height: 1;
	}

	/* FAB slot */
	.bottom-tab--fab {
		flex: 1;
		display: flex;
		align-items: flex-start;
		justify-content: center;
		padding: 0;
		position: relative;
	}
	.fab-btn {
		width: 76px;
		height: 76px;
		border-radius: 50%;
		background: var(--accent);
		border: none;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		color: #fff;
		box-shadow: 0 2px 16px rgba(37, 99, 235, 0.45);
		transition:
			background 0.15s,
			transform 0.1s,
			box-shadow 0.15s;
		position: absolute;
		bottom: -10px;
		left: 50%;
		transform: translateX(-50%);
	}
	.fab-btn svg {
		width: 44px;
		height: 44px;
		stroke-width: 2;
		transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
	}
	.fab-btn--open svg {
		transform: rotate(45deg);
	}
	.fab-btn:active {
		transform: translateX(-50%) scale(0.93);
		box-shadow: 0 1px 6px rgba(37, 99, 235, 0.3);
	}
	@media (hover: hover) {
		.fab-btn:hover {
			background: var(--accent-hover);
			box-shadow: 0 4px 16px rgba(37, 99, 235, 0.45);
		}
	}

	/* Mobile theme dropdown (above bottom bar) */
	.theme-dropdown--mobile {
		position: fixed !important;
		bottom: calc(4rem + env(safe-area-inset-bottom) + 0.5rem);
		right: 0.75rem;
		top: auto !important;
		left: auto;
		margin-top: 0;
	}

	/* Quick-add modal */
	.quickadd-overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.45);
		z-index: 200;
		display: flex;
		align-items: flex-end;
	}
	.quickadd-sheet {
		width: 100%;
		background: var(--bg);
		border-radius: 16px 16px 0 0;
		padding: 0 0 env(safe-area-inset-bottom);
		box-shadow: 0 -4px 32px rgba(0, 0, 0, 0.12);
		outline: none;
	}
	.sheet-handle {
		width: 36px;
		height: 4px;
		background: var(--border-strong);
		border-radius: 2px;
		margin: 0.75rem auto 0;
	}
	.sheet-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 1rem 1.25rem 0;
		gap: 0.5rem;
	}
	.sheet-title {
		font-size: var(--text-base);
		font-weight: 600;
		color: var(--text);
		margin: 0;
		flex: 1;
		text-align: center;
	}
	.sheet-title--vehicle {
		font-size: var(--text-sm);
		color: var(--text-muted);
		font-weight: 500;
	}
	.sheet-close {
		width: 32px;
		height: 32px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--bg-muted);
		border: none;
		border-radius: 50%;
		cursor: pointer;
		color: var(--text-muted);
		flex-shrink: 0;
	}
	.sheet-close svg {
		width: 14px;
		height: 14px;
	}
	.sheet-close:active {
		background: var(--border);
	}
	.sheet-back {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		background: none;
		border: none;
		cursor: pointer;
		color: var(--accent);
		font-size: var(--text-sm);
		font-weight: 500;
		padding: 0;
		flex-shrink: 0;
	}
	.sheet-back svg {
		width: 16px;
		height: 16px;
	}
	.sheet-sub {
		font-size: var(--text-sm);
		color: var(--text-muted);
		margin: 0.5rem 0 0.75rem;
		padding: 0 1.25rem;
		text-align: center;
	}
	.pick-list {
		display: flex;
		flex-direction: column;
		padding: 0 0.75rem 1.25rem;
		gap: 0.25rem;
	}
	.pick-item {
		display: flex;
		align-items: center;
		gap: 0.875rem;
		padding: 0.875rem 0.75rem;
		border: none;
		border-radius: 12px;
		background: none;
		cursor: pointer;
		text-align: left;
		width: 100%;
		transition: background 0.1s;
		min-height: 56px;
	}
	.pick-item:active {
		background: var(--bg-muted);
	}
	@media (hover: hover) {
		.pick-item:hover {
			background: var(--bg-subtle);
		}
	}
	.pick-emoji {
		font-size: 1.75rem;
		line-height: 1;
		flex-shrink: 0;
		width: 2.5rem;
		height: 2.5rem;
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--bg-muted);
		border-radius: 50%;
	}
	.pick-name {
		flex: 1;
		font-size: var(--text-base);
		font-weight: 500;
		color: var(--text);
	}
	.pick-arrow {
		width: 18px;
		height: 18px;
		color: var(--text-subtle);
		flex-shrink: 0;
	}
	.pick-item--type {
		border: 1px solid var(--border);
		background: var(--bg-subtle);
		border-radius: 12px;
	}
	.pick-item--type:active {
		background: var(--bg-muted);
		border-color: var(--border-strong);
	}
	.type-icon {
		width: 40px;
		height: 40px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--bg-muted);
		border-radius: 10px;
		color: var(--text-muted);
		flex-shrink: 0;
	}
	.type-icon svg {
		width: 20px;
		height: 20px;
	}
	.type-text {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
	}
	.type-label {
		font-size: var(--text-base);
		font-weight: 500;
		color: var(--text);
	}
	.type-desc {
		font-size: var(--text-sm);
		color: var(--text-muted);
	}

	@media (max-width: 768px) {
		.topnav {
			display: none;
		}
		.bottom-tabs {
			display: flex;
		}
		.app-main {
			padding-bottom: 5rem;
		}
	}
</style>
