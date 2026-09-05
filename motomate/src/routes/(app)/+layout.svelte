<script lang="ts">
	import { page } from '$app/state';
	import { tick, untrack } from 'svelte';
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import { fade, fly } from 'svelte/transition';
	import { _, setUserLocale } from '$lib/i18n';
	import { DEFAULT_ODOMETER_UNIT, isDistanceUnit } from '$lib/utils/measurement.js';
	import NotificationBell from '$lib/components/ui/NotificationBell.svelte';
	import Toast from '$lib/components/ui/Toast.svelte';
	import ShortcutsModal from '$lib/components/ui/ShortcutsModal.svelte';
	import ConfirmDialog from '$lib/components/ui/ConfirmDialog.svelte';
	import AppSheet from '$lib/components/ui/AppSheet.svelte';
	import { quickAdd } from '$lib/stores/quickAdd.svelte.js';
	import { drafts } from '$lib/stores/drafts.svelte.js';
	import { dicebearUri } from '$lib/utils/dicebear.js';
	import { resolveTheme, readStoredTheme } from '$lib/utils/theme.js';

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
		data: { user: any; vehicles: NavVehicle[]; demoMode?: boolean };
	}>();

	// Initialize i18n with user's locale preference (skip in demo mode as locale is always forced to 'en' server-side)
	$effect(() => {
		if (data.user?.settings?.locale && !data.demoMode) {
			setUserLocale(data.user.settings.locale);
		}
	});

	$effect(() => {
		const serverDrafts = (data.user?.settings?.page_prefs as any)?.drafts;
		const vehicleIds = (data.vehicles ?? []).map((v: any) => v.id as string);
		drafts.init(serverDrafts, vehicleIds);
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

	let notifCountAdjustment = $state(0);
	const notifCount = $derived(Math.max(0, (data.unreadCount ?? 0) - notifCountAdjustment));
	const topnavAvatarUri = $derived(
		!data.user.settings?.avatar_key && data.user.settings?.avatar_seed
			? dicebearUri(data.user.settings.avatar_seed)
			: null
	);
	let shortcutsOpen = $state(false);
	let themeMenuOpen = $state(false);
	let avatarMenuOpen = $state(false);
	let notifMenuOpen = $state(false);
	let logoutConfirmOpen = $state(false);

	type NotifItem = {
		id: string;
		title: string;
		body: string;
		created_at: string;
		read_at: string | null;
		vehicle_id?: string | null;
		data?: { url?: string };
	};
	let notifItems = $state<NotifItem[]>([]);
	let notifLoading = $state(false);
	let notifError = $state(false);

	function timeAgo(dateStr: string): string {
		const diff = Date.now() - new Date(dateStr).getTime();
		const mins = Math.floor(diff / 60000);
		if (mins < 2) return 'now';
		if (mins < 60) return `${mins}m`;
		const hrs = Math.floor(mins / 60);
		if (hrs < 24) return `${hrs}h`;
		const days = Math.floor(hrs / 24);
		if (days < 7) return `${days}d`;
		return new Date(dateStr).toLocaleDateString(data.user.settings.locale ?? 'en', {
			month: 'short',
			day: 'numeric'
		});
	}

	async function fetchNotifications() {
		if (notifLoading) return;
		notifLoading = true;
		notifError = false;
		try {
			const res = await fetch('/api/notifications?limit=5&filter=unread');
			if (res.ok) notifItems = await res.json();
			else notifError = true;
		} catch {
			notifError = true;
		} finally {
			notifLoading = false;
		}
	}

	function notifHref(item: NotifItem): string {
		if (item.data?.url) return item.data.url;
		return item.vehicle_id ? `/vehicles/${item.vehicle_id}` : '/settings/notifications/all';
	}

	async function dismissNotif(item: NotifItem) {
		const wasUnread = item.read_at == null;
		notifItems = notifItems.filter((n) => n.id !== item.id);
		if (wasUnread) notifCountAdjustment++;
		fetch('/api/notifications', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ id: item.id })
		});
	}

	async function clearNotifs() {
		if (notifItems.length === 0) return;
		notifItems = [];
		notifCountAdjustment = data.unreadCount ?? 0;
		await fetch('/api/notifications', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ all: true })
		});
	}

	function toggleNotifMenu() {
		themeMenuOpen = false;
		avatarMenuOpen = false;
		notifMenuOpen = !notifMenuOpen;
		if (notifMenuOpen) {
			notifItems = [];
			fetchNotifications();
		}
	}

	function swipeable(node: HTMLElement, params: { onDismiss: () => void }) {
		let startX = 0;
		let startY = 0;
		let currentX = 0;
		let isHorizontal: boolean | null = null;

		function onStart(e: TouchEvent) {
			startX = e.touches[0].clientX;
			startY = e.touches[0].clientY;
			currentX = 0;
			isHorizontal = null;
			node.style.transition = 'none';
		}

		function onMove(e: TouchEvent) {
			const dx = e.touches[0].clientX - startX;
			const dy = e.touches[0].clientY - startY;
			if (isHorizontal === null && (Math.abs(dx) > 5 || Math.abs(dy) > 5)) {
				isHorizontal = Math.abs(dx) > Math.abs(dy);
			}
			if (!isHorizontal) return;
			e.preventDefault();
			currentX = dx;
			node.style.transform = `translateX(${dx}px)`;
			node.style.opacity = String(Math.max(0, 1 - Math.abs(dx) / 120));
		}

		function onEnd() {
			if (!isHorizontal) return;
			if (Math.abs(currentX) > 80) {
				node.style.transition = 'transform 0.18s ease, opacity 0.18s ease';
				node.style.transform = `translateX(${currentX > 0 ? '120%' : '-120%'})`;
				node.style.opacity = '0';
				setTimeout(() => params.onDismiss(), 180);
			} else {
				node.style.transition = 'transform 0.2s ease, opacity 0.2s ease';
				node.style.transform = '';
				node.style.opacity = '';
			}
		}

		node.addEventListener('touchstart', onStart, { passive: true });
		node.addEventListener('touchmove', onMove, { passive: false });
		node.addEventListener('touchend', onEnd, { passive: true });

		return {
			update(p: { onDismiss: () => void }) {
				params = p;
			},
			destroy() {
				node.removeEventListener('touchstart', onStart);
				node.removeEventListener('touchmove', onMove);
				node.removeEventListener('touchend', onEnd);
			}
		};
	}

	// Quick-add modal
	let quickAddOpen = $state(false);
	let quickAddStep = $state<'vehicle' | 'type'>('vehicle');
	let selectedVehicle = $state<NavVehicle | null>(null);
	let quickAddSheetEl: HTMLElement | undefined = $state();

	$effect(() => {
		if (quickAddOpen) tick().then(() => quickAddSheetEl?.focus());
	});

	$effect(() => {
		if (quickAddOpen && browser) {
			const prev = document.documentElement.style.overflow;
			document.documentElement.style.overflow = 'hidden';
			return () => {
				document.documentElement.style.overflow = prev;
			};
		}
	});

	$effect(() => {
		if (quickAdd.isOpen && quickAdd.vehicleId) {
			const vehicle = data.vehicles.find((v: NavVehicle) => v.id === quickAdd.vehicleId);
			if (vehicle) {
				selectedVehicle = vehicle;
				quickAddStep = 'type';
				quickAddOpen = true;
			}
		}
	});

	function openQuickAdd() {
		if (data.vehicles.length === 0) {
			goto('/vehicles/new');
			return;
		}
		// Pre-select vehicle when already on a vehicle page
		const pathParts = page.url.pathname.split('/');
		if (pathParts[1] === 'vehicles' && pathParts[2]) {
			const currentVehicle = data.vehicles.find((v: NavVehicle) => v.id === pathParts[2]);
			if (currentVehicle) {
				selectedVehicle = currentVehicle;
				quickAddStep = 'type';
				quickAddOpen = true;
				return;
			}
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
		quickAdd.close();
	}

	function quickAddNavigate(type: 'service' | 'odometer' | 'note' | 'finance') {
		if (!quickAddOpen || !selectedVehicle) return;
		const vehicleId = selectedVehicle.id;
		closeQuickAdd();
		if (type === 'finance') {
			goto(`/vehicles/${vehicleId}/finance?quick=finance`);
		} else {
			goto(`/vehicles/${vehicleId}?quick=${type}`);
		}
	}

	function vehicleEmoji(v: NavVehicle) {
		return v.meta?.avatar_emoji ?? (v.type === 'scooter' ? '🛵' : v.type === 'bike' ? '🚲' : '🏍');
	}

	let currentTheme = $state(
		untrack(() => {
			const db = (data.user.settings.theme ?? 'system') as 'light' | 'dark' | 'system';
			// DB 'system' means never set in-app, so prefer localStorage which both layouts keeps in sync
			if (db !== 'system') return db;
			return browser ? readStoredTheme() : 'system';
		})
	);

	if (browser) {
		document.documentElement.dataset.theme = resolveTheme(
			untrack(() => currentTheme) as 'light' | 'dark' | 'system'
		);
	}

	const CurrentThemeIcon = $derived(themes.find((t) => t.id === currentTheme)?.icon);

	$effect(() => {
		document.documentElement.dataset.theme = resolveTheme(
			currentTheme as 'light' | 'dark' | 'system'
		);
	});

	async function setTheme(next: 'light' | 'dark' | 'system') {
		themeMenuOpen = false;
		currentTheme = next;
		const odometerUnit = isDistanceUnit(data.user.settings.odometer_unit)
			? data.user.settings.odometer_unit
			: DEFAULT_ODOMETER_UNIT;

		// Sync to localStorage for auth pages after logout
		if (typeof window !== 'undefined') {
			localStorage.setItem('theme', next);
		}

		const fd = new FormData();
		fd.set('theme', next);
		fd.set('currency', data.user.settings.currency ?? 'EUR');
		fd.set('odometer_unit', odometerUnit);
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
		const target = e.target as Element;
		if (themeMenuOpen && !target.closest('.theme-menu-container')) themeMenuOpen = false;
		if (avatarMenuOpen && !target.closest('.avatar-menu-container')) avatarMenuOpen = false;
		if (notifMenuOpen && !target.closest('.notif-menu-container')) notifMenuOpen = false;
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			if (themeMenuOpen) themeMenuOpen = false;
			if (avatarMenuOpen) avatarMenuOpen = false;
			if (notifMenuOpen) notifMenuOpen = false;
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
			};
			window.addEventListener('keydown', handleSecondKey, { once: true });
			setTimeout(() => window.removeEventListener('keydown', handleSecondKey), 1500);
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
	<div class="demo-banner" class:active={data.demoMode}>
		{#if data.demoMode}
			Demo mode: changes are disabled &middot; intended for demonstration purposes only.
		{/if}
	</div>
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
						class:active={page.url.pathname.startsWith(link.href)}
						aria-current={page.url.pathname.startsWith(link.href) ? 'page' : undefined}
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

					{#if themeMenuOpen}
						<button
							type="button"
							class="menu-overlay"
							onclick={() => (themeMenuOpen = false)}
							aria-label={$_('layout.closeMenu')}
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

				<div class="action-item notif-menu-container">
					<NotificationBell count={notifCount} onclick={toggleNotifMenu} />

					{#if notifMenuOpen}
						<div
							class="notif-dropdown"
							in:fly={{ y: 8, duration: 150 }}
							out:fade={{ duration: 100 }}
						>
							{#if notifLoading}
								<div class="notif-loading">
									<div class="notif-placeholder"></div>
									<div class="notif-placeholder"></div>
									<div class="notif-placeholder"></div>
								</div>
							{:else if notifError}
								<p class="notif-empty notif-empty--error">{$_('layout.notifications.error')}</p>
							{:else if notifItems.length === 0}
								<p class="notif-empty">{$_('layout.notifications.empty')}</p>
							{:else}
								<div class="notif-list">
									{#each notifItems as item (item.id)}
										<div
											class="notif-item"
											class:notif-item--unread={!item.read_at}
											use:swipeable={{ onDismiss: () => dismissNotif(item) }}
										>
											<a
												class="notif-hit"
												href={notifHref(item)}
												aria-label={item.title}
												onclick={() => {
													notifMenuOpen = false;
													dismissNotif(item);
												}}
											></a>
											<div class="notif-item-row">
												<span class="notif-title">{item.title}</span>
												<span class="notif-time">{timeAgo(item.created_at)}</span>
												<button
													type="button"
													class="notif-dismiss"
													onclick={() => dismissNotif(item)}
													aria-label={$_('layout.notifications.dismiss')}
												>
													<svg
														viewBox="0 0 24 24"
														fill="none"
														stroke="currentColor"
														stroke-width="2.5"
														stroke-linecap="round"
														aria-hidden="true"
													>
														<line x1="18" y1="6" x2="6" y2="18" /><line
															x1="6"
															y1="6"
															x2="18"
															y2="18"
														/>
													</svg>
												</button>
											</div>
											{#if item.body}
												<p class="notif-body">{item.body}</p>
											{/if}
										</div>
									{/each}
								</div>
							{/if}

							<div class="notif-actions">
								{#if notifItems.length > 0}
									<button type="button" class="notif-clear" onclick={clearNotifs}>
										<svg
											viewBox="0 0 24 24"
											fill="none"
											stroke="currentColor"
											stroke-width="2"
											stroke-linecap="round"
											stroke-linejoin="round"
											aria-hidden="true"
										>
											<polyline points="20 6 9 17 4 12" />
										</svg>
										{$_('layout.notifications.clearAll')}
									</button>
								{/if}
								<a
									href="/settings/notifications/all"
									class="notif-footer"
									onclick={() => (notifMenuOpen = false)}
								>
									{$_('layout.notifications.viewAll')}
									<svg
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="2"
										stroke-linecap="round"
										stroke-linejoin="round"
										aria-hidden="true"
									>
										<polyline points="9 18 15 12 9 6" />
									</svg>
								</a>
							</div>
						</div>
					{/if}
				</div>

				<div class="avatar-menu-container">
					<button
						type="button"
						class="topnav-avatar"
						class:open={avatarMenuOpen}
						onclick={() => (avatarMenuOpen = !avatarMenuOpen)}
						aria-label={$_('layout.profileMenu')}
						aria-expanded={avatarMenuOpen}
					>
						{#if data.user.settings?.avatar_key}
							<img
								src="/api/files?key={data.user.settings.avatar_key}"
								alt=""
								class="topnav-avatar-img"
							/>
						{:else if topnavAvatarUri}
							<img src={topnavAvatarUri} alt="" class="topnav-avatar-img" />
						{:else}
							<span class="topnav-avatar-initials"
								>{(data.user.email?.[0] ?? '?').toUpperCase()}</span
							>
						{/if}
					</button>

					{#if avatarMenuOpen}
						<div
							class="avatar-dropdown"
							in:fly={{ y: 8, duration: 150 }}
							out:fade={{ duration: 100 }}
						>
							<a href="/settings" class="avatar-menu-item" onclick={() => (avatarMenuOpen = false)}
								>{$_('layout.nav.settings')}</a
							>
							<button
								type="button"
								class="avatar-menu-item avatar-menu-item--danger"
								onclick={() => {
									avatarMenuOpen = false;
									logoutConfirmOpen = true;
								}}>{$_('layout.signOut')}</button
							>
						</div>
					{/if}
				</div>
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
			class:active={page.url.pathname.startsWith('/dashboard')}
			aria-current={page.url.pathname.startsWith('/dashboard') ? 'page' : undefined}
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

		<div class="bottom-tab bottom-tab--fab">
			<button
				class="fab-btn"
				class:fab-btn--open={quickAddOpen}
				onclick={openQuickAdd}
				aria-label={$_('layout.addEntry.title')}
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
			href="/vehicles"
			class="bottom-tab"
			class:active={page.url.pathname.startsWith('/vehicles')}
			aria-current={page.url.pathname.startsWith('/vehicles') ? 'page' : undefined}
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
	</nav>
</div>

<!-- Quick-add modal -->
{#if quickAddOpen}
	<div
		class="quickadd-overlay"
		role="presentation"
		onclick={(e) => {
			if (!(e.target as Element).closest('.quickadd-sheet')) closeQuickAdd();
		}}
		in:fade={{ duration: 150 }}
		out:fade={{ duration: 120 }}
	>
		<div
			bind:this={quickAddSheetEl}
			class="quickadd-sheet"
			role="dialog"
			aria-modal="true"
			aria-labelledby="quickadd-title"
			onkeydown={(e) => e.key === 'Escape' && closeQuickAdd()}
			tabindex="-1"
			in:fly={{ y: 240, duration: 260, opacity: 1 }}
			out:fly={{ y: 240, duration: 200, opacity: 1 }}
		>
			<div class="sheet-handle" aria-hidden="true"></div>

			{#if quickAddStep === 'vehicle'}
				<div class="sheet-header">
					<p id="quickadd-title" class="sheet-title">{$_('layout.addEntry.title')}</p>
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
					<p id="quickadd-title" class="sheet-title sheet-title--vehicle">
						{selectedVehicle?.name}
					</p>
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
					<button class="pick-item pick-item--type" onclick={() => quickAddNavigate('note')}>
						<span class="type-icon">
							<svg
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="1.75"
								stroke-linecap="round"
								stroke-linejoin="round"
								aria-hidden="true"
								><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline
									points="14 2 14 8 20 8"
								/><line x1="16" y1="13" x2="8" y2="13" /><line
									x1="16"
									y1="17"
									x2="8"
									y2="17"
								/><polyline points="10 9 9 9 8 9" /></svg
							>
						</span>
						<span class="type-text">
							<span class="type-label">{$_('vehicle.forms.writeNote')}</span>
							<span class="type-desc">{$_('vehicle.forms.noteDesc')}</span>
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
					<button class="pick-item pick-item--type" onclick={() => quickAddNavigate('finance')}>
						<span class="type-icon">
							<svg
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="1.75"
								stroke-linecap="round"
								stroke-linejoin="round"
								aria-hidden="true"
								><line x1="12" y1="1" x2="12" y2="23" /><path
									d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"
								/></svg
							>
						</span>
						<span class="type-text">
							<span class="type-label">{$_('layout.addEntry.finance')}</span>
							<span class="type-desc">{$_('layout.addEntry.financeDesc')}</span>
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

{#if notifMenuOpen}
	<div
		class="notif-backdrop"
		role="presentation"
		onclick={() => (notifMenuOpen = false)}
		in:fade={{ duration: 150 }}
		out:fade={{ duration: 100 }}
	></div>
{/if}

<Toast />
<AppSheet />
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
	.demo-banner:not(.active) {
		display: none;
	}

	.demo-banner {
		background: color-mix(in srgb, var(--status-due) 6%, var(--bg));
		border-bottom: 1px solid color-mix(in srgb, var(--status-due) 20%, var(--border));
		padding: 0.5rem var(--space-6);
		font-size: var(--text-sm);
		color: var(--text-muted);
		text-align: center;
		user-select: none;
	}

	.app-shell {
		display: flex;
		flex-direction: column;
		min-height: 100svh;
	}

	.notif-backdrop {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.3);
		z-index: 60;
		cursor: default;
	}

	.topnav {
		position: sticky;
		top: 0;
		z-index: 80;
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
		user-select: none;
	}

	.topnav-links {
		display: flex;
		gap: var(--space-2);
		margin-left: var(--space-4);
	}

	.topnav-link {
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
		color: var(--accent);
		background: var(--accent-subtle);
		border-color: transparent;
	}

	.topnav-link.active:hover {
		background: var(--accent-subtle);
		color: var(--accent);
		transform: none;
	}

	.topnav-link:active {
		transform: scale(0.97);
		transition-duration: 0.06s;
	}

	@media (prefers-reduced-motion: reduce) {
		.topnav-link {
			transition:
				color 0.1s,
				background 0.1s;
		}
		.topnav-link:hover,
		.topnav-link:active {
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
		background: color-mix(in srgb, var(--accent) 4%, transparent);
		border-color: color-mix(in srgb, var(--accent) 15%, transparent);
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
		background: color-mix(in srgb, var(--accent) 4%, transparent);
		border-color: color-mix(in srgb, var(--accent) 15%, transparent);
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

	.topnav-avatar {
		width: 42px;
		height: 42px;
		border-radius: 12px;
		background: transparent;
		border: 3px solid transparent;
		display: flex;
		align-items: center;
		justify-content: center;
		text-decoration: none;
		flex-shrink: 0;
		cursor: pointer;
		transition:
			background 0.15s cubic-bezier(0.25, 1, 0.5, 1),
			border-color 0.15s cubic-bezier(0.25, 1, 0.5, 1);
	}
	.topnav-avatar:hover,
	.topnav-avatar.open {
		background: var(--bg-muted);
	}
	.topnav-avatar:active {
		background: color-mix(in srgb, var(--accent) 4%, transparent);
		border-color: color-mix(in srgb, var(--accent) 15%, transparent);
	}
	.topnav-avatar-img {
		width: 26px;
		height: 26px;
		border-radius: 50%;
		object-fit: cover;
		flex-shrink: 0;
		user-select: none;
	}
	.topnav-avatar-initials {
		width: 26px;
		height: 26px;
		border-radius: 50%;
		background: var(--bg-muted);
		border: 1px solid var(--border);
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: var(--text-xs);
		font-weight: 600;
		color: var(--text-muted);
		text-transform: uppercase;
		line-height: 1;
	}

	.avatar-menu-container {
		position: relative;
	}

	.avatar-dropdown {
		position: absolute;
		top: 100%;
		right: 0;
		margin-top: 8px;
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: 14px;
		padding: 0.4rem;
		min-width: 160px;
		box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1);
		z-index: 105;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.avatar-menu-item {
		display: flex;
		align-items: center;
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
		text-decoration: none;
	}

	.avatar-menu-item:hover {
		background: var(--bg-muted);
	}

	.avatar-menu-item:active {
		background: color-mix(in srgb, var(--accent) 4%, transparent);
		border-color: color-mix(in srgb, var(--accent) 15%, transparent);
	}

	.avatar-menu-item--danger {
		color: var(--status-overdue);
	}

	.avatar-menu-item--danger:hover {
		background: color-mix(in srgb, var(--status-overdue) 5%, transparent);
	}

	.avatar-menu-item--danger:active {
		background: color-mix(in srgb, var(--status-overdue) 10%, transparent);
		border-color: color-mix(in srgb, var(--status-overdue) 20%, transparent);
	}

	/* Notification dropdown */
	.notif-menu-container {
		position: relative;
	}

	.notif-dropdown {
		position: absolute;
		top: 100%;
		right: -0.5rem;
		margin-top: 8px;
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: 12px;
		width: min(300px, calc(100vw - 2rem));
		box-shadow:
			0 2px 8px color-mix(in srgb, var(--text) 5%, transparent),
			0 8px 24px color-mix(in srgb, var(--text) 7%, transparent);
		z-index: 105;
		overflow: hidden;
	}

	.notif-list {
		display: flex;
		flex-direction: column;
	}

	.notif-item {
		position: relative;
		padding: 0.625rem 0.875rem;
		border-bottom: 1px solid var(--border);
		border-left: 3px solid transparent;
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		touch-action: pan-y;
	}
	.notif-item:last-child {
		border-bottom: none;
	}
	.notif-item--unread {
		border-left-color: var(--accent);
	}

	.notif-hit {
		position: absolute;
		inset: 0;
		z-index: 1;
	}

	.notif-item:hover {
		background: var(--bg-subtle);
	}

	.notif-item-row {
		display: flex;
		align-items: center;
		gap: 0.375rem;
	}

	.notif-title {
		flex: 1;
		font-size: var(--text-sm);
		font-weight: 500;
		color: var(--text);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.notif-time {
		font-size: var(--text-xs);
		color: var(--text-subtle);
		flex-shrink: 0;
	}

	.notif-dismiss {
		position: relative;
		z-index: 2;
		width: 20px;
		height: 20px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: none;
		border: none;
		cursor: pointer;
		color: var(--text-subtle);
		border-radius: 6px;
		flex-shrink: 0;
		opacity: 0.35;
		transition:
			opacity 0.1s,
			background 0.1s;
		padding: 0;
	}
	.notif-dismiss svg {
		width: 11px;
		height: 11px;
	}
	.notif-item:hover .notif-dismiss {
		opacity: 1;
	}
	.notif-dismiss:hover {
		background: var(--bg-muted);
		color: var(--text);
		opacity: 1;
	}

	.notif-body {
		font-size: var(--text-sm);
		color: var(--text-muted);
		margin: 0;
		line-height: var(--leading-snug);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.notif-actions {
		display: flex;
		align-items: stretch;
		border-top: 1px solid var(--border);
	}

	.notif-clear {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.75rem 0.875rem;
		min-height: 44px;
		background: none;
		border: none;
		border-right: 1px solid var(--border);
		font-size: var(--text-sm);
		font-weight: 500;
		color: var(--text-muted);
		cursor: pointer;
		white-space: nowrap;
		transition:
			background 0.15s,
			color 0.15s;
	}

	.notif-clear svg {
		width: 15px;
		height: 15px;
		flex-shrink: 0;
		transform: scale(0.85);
		opacity: 0.6;
		transition:
			transform 0.15s ease-out,
			opacity 0.15s ease-out;
	}

	.notif-clear:hover,
	.notif-clear:active {
		background: var(--bg-subtle);
		color: var(--text);
	}

	.notif-clear:hover svg,
	.notif-clear:active svg {
		transform: scale(1);
		opacity: 1;
	}

	@media (prefers-reduced-motion: reduce) {
		.notif-clear svg {
			transition: none;
		}
	}

	.notif-footer {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: space-between;
		min-height: 44px;
		padding: 0.75rem 0.875rem;
		font-size: var(--text-sm);
		font-weight: 500;
		color: var(--accent);
		text-decoration: none;
		transition: background 0.1s;
	}
	.notif-footer:hover {
		background: var(--bg-subtle);
	}
	.notif-footer svg {
		width: 14px;
		height: 14px;
	}

	.notif-empty {
		padding: 1.25rem 0.875rem;
		font-size: var(--text-sm);
		color: var(--text-subtle);
		text-align: center;
		margin: 0;
	}
	.notif-empty--error {
		color: var(--text-muted);
	}

	.notif-loading {
		padding: 0.625rem 0.875rem;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.notif-placeholder {
		height: 32px;
		background: var(--bg-muted);
		border-radius: 6px;
		animation: notif-pulse 1.4s ease-in-out infinite;
	}
	.notif-placeholder:nth-child(2) {
		animation-delay: 0.15s;
		width: 85%;
	}
	.notif-placeholder:nth-child(3) {
		animation-delay: 0.3s;
		width: 70%;
	}

	@keyframes notif-pulse {
		0%,
		100% {
			opacity: 0.4;
		}
		50% {
			opacity: 0.8;
		}
	}

	.icon-wrapper {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 1.25rem;
		height: 1.25rem;
	}

	.topnav-link:focus-visible,
	.theme-trigger:focus-visible,
	.topnav-avatar:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
		border-radius: 8px;
	}

	.avatar-menu-item:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: -2px;
		border-radius: 10px;
	}

	.bottom-tab:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: -3px;
	}

	.app-main {
		flex: 1;
	}

	/* Bottom tabs */
	.bottom-tabs {
		display: none;
		position: sticky;
		bottom: 0;
		padding-bottom: env(safe-area-inset-bottom);
		z-index: 50;
		align-items: stretch;
		overflow: visible;
		flex-shrink: 0;
	}

	.bottom-tabs::before {
		content: '';
		position: absolute;
		inset: 0;
		background: var(--bg);
		border-top: 1px solid var(--border);
		pointer-events: none;
		mask-image: radial-gradient(circle 40px at 50% 0px, transparent 40px, black 41px);
		-webkit-mask-image: radial-gradient(circle 40px at 50% 0px, transparent 40px, black 41px);
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
		font-size: var(--text-xs);
		font-weight: 500;
		text-decoration: none;
		cursor: pointer;
		transition: color 0.1s;
		position: relative;
		z-index: 1;
	}
	.bottom-tab.active {
		color: var(--accent);
	}
	.tab-icon {
		width: 22px;
		height: 22px;
		flex-shrink: 0;
	}
	.tab-label {
		line-height: 1;
	}

	/* FAB slot */
	.bottom-tab--fab {
		flex: 0 0 80px;
		display: flex;
		align-items: center;
		justify-content: center;
		position: relative;
		z-index: 1;
	}
	.fab-btn {
		position: fixed;
		left: 50%;
		bottom: calc(env(safe-area-inset-bottom, 0px) + 20px);
		transform: translateX(-50%);
		width: 72px;
		height: 72px;
		border-radius: 50%;
		background: var(--accent);
		border: none;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		color: #fff;
		box-shadow: 0 2px 16px color-mix(in srgb, var(--accent) 45%, transparent);
		z-index: 55;
		transition:
			background 0.15s,
			box-shadow 0.15s;
	}
	.fab-btn svg {
		width: 30px;
		height: 30px;
		stroke-width: 2.25;
		transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
	}
	.fab-btn--open svg {
		transform: rotate(45deg);
	}
	.fab-btn:active {
		transform: translateX(-50%) scale(0.93);
		box-shadow: 0 1px 6px color-mix(in srgb, var(--accent) 30%, transparent);
	}
	@media (hover: hover) {
		.fab-btn:hover {
			background: var(--accent-hover);
			box-shadow: 0 4px 24px color-mix(in srgb, var(--accent) 50%, transparent);
		}
	}

	/* Quick-add modal */
	.quickadd-overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.45);
		z-index: 200;
		display: flex;
		align-items: flex-end;
		touch-action: none;
	}
	.quickadd-sheet {
		width: 100%;
		background: var(--bg);
		border-radius: 16px 16px 0 0;
		padding: 0 0 env(safe-area-inset-bottom);
		box-shadow: 0 -4px 32px rgba(0, 0, 0, 0.12);
		outline: none;
		touch-action: pan-y;
		overscroll-behavior: contain;
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
		.topnav-links {
			display: none;
		}
		.theme-menu-container {
			display: none;
		}
		.bottom-tabs {
			display: flex;
		}
	}

	@media (max-width: 360px) {
		.tab-label {
			display: none;
		}
		.bottom-tab {
			justify-content: center;
		}
	}
</style>
