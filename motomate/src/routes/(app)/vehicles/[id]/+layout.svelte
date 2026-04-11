<script lang="ts">
	import { page } from '$app/stores';
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { formatNumber } from '$lib/utils/format.js';
	import { _, waitLocale } from '$lib/i18n';
	import type { LayoutData } from './$types';

	let { children, data }: { children: import('svelte').Snippet; data: LayoutData } = $props();

	$effect(() => {
		waitLocale();
	});

	// State & Bindings
	let fileInput: HTMLInputElement | undefined = $state();
	let uploadForm: HTMLFormElement | undefined = $state();
	let showAvatarPopover = $state(false);
	let avatarCacheBuster = $state(0);

	// Derived logic
	const vehicle = $derived(data.vehicle);
	const locale = $derived(data.user?.settings?.locale ?? 'en');

	let displayOdo = $state(0);

	$effect(() => {
		const target = vehicle.current_odometer;
		if (typeof window === 'undefined') {
			displayOdo = target;
			return;
		}
		// Skip animation if user prefers reduced motion
		if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
			displayOdo = target;
			return;
		}

		const duration = 900;
		const startValue = Math.max(0, target - Math.min(Math.ceil(target * 0.04), 400));
		const startTime = performance.now();

		let rafId: number;
		function tick(now: number) {
			const elapsed = now - startTime;
			const progress = Math.min(elapsed / duration, 1);
			// ease-out-quart: decelerate strongly at the end, like a real odometer settling
			const eased = 1 - Math.pow(1 - progress, 4);
			displayOdo = Math.round(startValue + (target - startValue) * eased);
			if (progress < 1) rafId = requestAnimationFrame(tick);
		}

		rafId = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(rafId);
	});

	const defaultEmoji = $derived(
		vehicle.type === 'scooter' ? '🛵' : vehicle.type === 'bike' ? '🚲' : '🏍'
	);

	const avatarEmoji = $derived(vehicle.meta?.avatar_emoji ?? defaultEmoji);
	const hasAvatarImage = $derived(!!vehicle.cover_image_key);
	const hasAvatar = $derived(!!avatarEmoji || hasAvatarImage);

	const avatarSrc = $derived(
		hasAvatarImage ? `/api/files?key=${vehicle.cover_image_key}&v=${avatarCacheBuster}` : null
	);

	const tabs = $derived([
		{ id: 'timeline', labelKey: 'vehicle.layout.tabs.timeline', href: `/vehicles/${vehicle.id}` },
		{
			id: 'maintenance',
			labelKey: 'vehicle.layout.tabs.maintenance',
			href: `/vehicles/${vehicle.id}/maintenance`
		},
		{
			id: 'documents',
			labelKey: 'vehicle.layout.tabs.documents',
			href: `/vehicles/${vehicle.id}/documents`
		},
		{
			id: 'finance',
			labelKey: 'vehicle.layout.tabs.finance',
			href: `/vehicles/${vehicle.id}/finance`
		},
		{
			id: 'travels',
			labelKey: 'vehicle.layout.tabs.travels',
			href: `/vehicles/${vehicle.id}/travels`
		},
		{
			id: 'settings',
			labelKey: 'vehicle.layout.tabs.settings',
			href: `/vehicles/${vehicle.id}/edit`
		}
	]);

	const activeTabId = $derived(
		tabs.findLast((t) => $page.url.pathname.startsWith(t.href) || $page.url.pathname === t.href)
			?.id ?? 'timeline'
	);

	const avatarEmojis = [
		'🏍',
		'🛵',
		'🚗',
		'🚕',
		'🚙',
		'🛻',
		'🚲',
		'🏎️',
		'🚓',
		'🚑',
		'🔧',
		'🛠️',
		'⛽',
		'🏁',
		'❄️',
		'☀️',
		'🌙',
		'⚡',
		'✨',
		'🌟'
	];

	/**
	 * Standardized Submit Handler
	 * Ensures SvelteKit handles the response without a page refresh.
	 */
	const handleAvatarSubmit = () => {
		return async ({ update }: { update: any }) => {
			// update() handles the background data refresh
			await update();
			// invalidateAll() ensures the layout load function re-runs
			await invalidateAll();
			// Force img re-render by bumping the cache buster
			avatarCacheBuster++;
			showAvatarPopover = false;
		};
	};

	function triggerFileUpload() {
		if (fileInput?.files?.length) {
			uploadForm?.requestSubmit();
		}
	}
</script>

<div class="vehicle-detail">
	<div class="vehicle-header">
		<div class="vehicle-header-inner">
			<a href="/vehicles" class="back-link">{$_('vehicle.layout.backToGarage')}</a>

			<div class="vehicle-identity">
				<button
					type="button"
					class="vehicle-avatar"
					class:vehicle-avatar--image={hasAvatarImage}
					onclick={() => (showAvatarPopover = true)}
					aria-label="Change avatar"
				>
					{#if hasAvatarImage}
						<img src={avatarSrc} alt="" class="avatar-img" />
					{:else}
						<span class="avatar-emoji">{avatarEmoji}</span>
					{/if}
					<span class="avatar-edit-icon" aria-hidden="true">✎</span>
				</button>

				<div class="vehicle-identity-text">
					<div class="vehicle-name-row">
						<h1 class="vehicle-name">{vehicle.name}</h1>
						{#if vehicle.archived_at}
							<span class="archived-tag">{$_('vehicle.layout.archived')}</span>
						{/if}
					</div>
					<div class="vehicle-subtitle">
						{vehicle.make}
						{vehicle.model} · {vehicle.year}
						{#if vehicle.license_plate}
							· {vehicle.license_plate}{/if}
					</div>
					<div class="odo-display">
						<span class="odo-num">{formatNumber(displayOdo, locale)}</span>
						<span class="odo-unit">{vehicle.odometer_unit}</span>
					</div>
				</div>
			</div>
		</div>

		<nav class="vehicle-tabs" aria-label="Vehicle sections">
			{#each tabs as tab}
				<a href={tab.href} class="vtab" class:vtab--active={activeTabId === tab.id}>
					{$_(tab.labelKey)}
					{#if tab.id === 'maintenance' && data.attentionCount > 0}
						<span class="vtab-badge">
							{data.attentionCount > 9 ? '9+' : data.attentionCount}
						</span>
					{/if}
				</a>
			{/each}
		</nav>
	</div>

	<div class="vehicle-content">
		{@render children()}
	</div>

	{#if showAvatarPopover}
		<div
			class="avatar-popover-overlay"
			onclick={() => (showAvatarPopover = false)}
			role="presentation"
		>
			<div
				class="avatar-popover"
				onclick={(e) => e.stopPropagation()}
				onkeydown={(e) => e.stopPropagation()}
				role="dialog"
				aria-modal="true"
				tabindex="-1"
			>
				{#if hasAvatarImage && avatarSrc}
					<div class="popover-preview">
						<img src={avatarSrc} alt="" class="popover-preview-img" />
					</div>
				{:else}
					<div class="popover-header">{$_('vehicle.layout.avatar.choose')}</div>
				{/if}

				<div class="emoji-grid">
					{#each avatarEmojis as e}
						<form
							method="POST"
							action="/vehicles/{vehicle.id}/edit?/updateAvatar"
							use:enhance={handleAvatarSubmit}
						>
							<input type="hidden" name="emoji" value={e} />
							<button
								type="submit"
								class="emoji-btn"
								class:emoji-btn--selected={e === avatarEmoji && !hasAvatarImage}
							>
								{e}
							</button>
						</form>
					{/each}
				</div>

				<div class="popover-divider"></div>

				<!-- Explicit trigger for hidden file input -->
				<button type="button" class="popover-btn" onclick={() => fileInput?.click()}>
					{$_('vehicle.layout.avatar.upload')}
				</button>

				<form
					bind:this={uploadForm}
					method="POST"
					action="/vehicles/{vehicle.id}/edit?/updateAvatar"
					enctype="multipart/form-data"
					use:enhance={({ formData, cancel }) => {
						const file = formData.get('file') as File;
						if (!file || file.size === 0) return cancel();

						return handleAvatarSubmit();
					}}
				>
					<input
						bind:this={fileInput}
						type="file"
						name="file"
						accept="image/*"
						class="avatar-file-input"
						onchange={triggerFileUpload}
					/>
				</form>

				{#if hasAvatar}
					<form
						method="POST"
						action="/vehicles/{vehicle.id}/edit?/updateAvatar"
						use:enhance={handleAvatarSubmit}
					>
						<input type="hidden" name="remove" value="true" />
						<button type="submit" class="popover-btn popover-btn--danger">
							{$_('vehicle.layout.avatar.reset')}
						</button>
					</form>
				{/if}
			</div>
		</div>
	{/if}
</div>

<style>
	.vehicle-detail {
		display: flex;
		flex-direction: column;
		min-height: 100%;
	}

	.vehicle-header {
		border-bottom: 1px solid var(--border);
		background: var(--bg-subtle);
	}
	.vehicle-header-inner {
		padding: 1.25rem 1.5rem 1rem;
		display: flex;
		flex-direction: column;
		gap: 0.875rem;
		max-width: 860px;
		margin: 0 auto;
	}

	.back-link {
		font-size: var(--text-sm);
		color: var(--text-muted);
		text-decoration: none;
		display: inline-flex;
		align-items: center;
	}
	.back-link:hover {
		color: var(--text);
	}

	.vehicle-identity {
		display: flex;
		align-items: center;
		gap: 1.25rem;
	}
	.vehicle-avatar {
		width: 56px;
		height: 56px;
		border-radius: 50%;
		background: var(--bg-muted);
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 1.75rem;
		flex-shrink: 0;
		line-height: 1;
	}
	.vehicle-identity-text {
		min-width: 0;
	}

	.vehicle-name-row {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		flex-wrap: wrap;
	}
	.vehicle-name {
		font-size: var(--text-2xl);
		font-weight: 600;
		color: var(--text);
		letter-spacing: -0.02em;
		line-height: var(--leading-tight);
		margin: 0;
	}
	.archived-tag {
		font-size: var(--text-xs);
		font-weight: 600;
		padding: 0.125rem 0.5rem;
		border-radius: 4px;
		background: var(--bg-muted);
		color: var(--text-subtle);
		border: 1px solid var(--border);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}
	.vehicle-subtitle {
		font-size: var(--text-sm);
		color: var(--text-muted);
		margin-top: 0.125rem;
	}
	.odo-display {
		display: flex;
		align-items: baseline;
		gap: 0.375rem;
		margin-top: 0.625rem;
	}
	.odo-num {
		font-family: var(--font-mono);
		font-variant-numeric: tabular-nums;
		font-size: var(--text-3xl);
		font-weight: 600;
		color: var(--text);
		line-height: 1;
	}
	.odo-unit {
		font-size: var(--text-sm);
		color: var(--text-subtle);
	}

	/* Tabs */
	.vehicle-tabs {
		display: flex;
		padding: 0 1.5rem;
		max-width: 860px;
		margin: 0 auto;
	}
	.vtab {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		padding: 0.625rem 1rem;
		font-size: var(--text-sm);
		font-weight: 500;
		color: var(--text-muted);
		text-decoration: none;
		border-bottom: 2px solid transparent;
		margin-bottom: -1px;
		transition:
			color 0.1s,
			border-color 0.1s;
	}
	.vtab:hover {
		color: var(--text);
	}
	.vtab--active {
		color: var(--text);
		border-bottom-color: var(--accent);
	}

	.vtab-badge {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 1.125rem;
		height: 1.125rem;
		padding: 0 0.25rem;
		background: var(--status-overdue);
		color: #fff;
		border-radius: 999px;
		font-size: 0.6875rem;
		font-weight: 600;
		line-height: 1;
		font-family: var(--font-mono);
		font-variant-numeric: tabular-nums;
		flex-shrink: 0;
	}

	.vehicle-content {
		flex: 1;
		padding: 1.5rem 1.5rem 2rem;
		max-width: 860px;
		margin: 0 auto;
		width: 100%;
	}

	@media (max-width: 640px) {
		.vehicle-header-inner {
			padding: 1rem 1rem 0.875rem;
		}
		.vehicle-content {
			padding: 1rem 1rem 1.5rem;
		}
		.vehicle-tabs {
			padding: 0 1rem;
			overflow-x: auto;
			-webkit-overflow-scrolling: touch;
			scrollbar-width: none;
		}
		.vehicle-tabs::-webkit-scrollbar {
			display: none;
		}
		.odo-num {
			font-size: var(--text-2xl);
		}
	}

	/* Avatar button */
	.vehicle-avatar {
		position: relative;
		cursor: pointer;
		border: none;
		padding: 0;
		transition: box-shadow 0.15s;
	}
	.vehicle-avatar:hover {
		box-shadow: 0 0 0 2px var(--accent);
	}
	.vehicle-avatar--image {
		background: transparent;
	}
	.vehicle-avatar--image img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		border-radius: 50%;
	}
	.avatar-emoji {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 100%;
		height: 100%;
	}
	.vehicle-avatar:hover .avatar-emoji {
		animation: bike-rev 0.45s cubic-bezier(0.25, 1, 0.5, 1);
	}
	@keyframes bike-rev {
		0% {
			transform: rotate(0deg) scale(1);
		}
		20% {
			transform: rotate(-7deg) scale(1.08);
		}
		55% {
			transform: rotate(5deg) scale(1.04);
		}
		80% {
			transform: rotate(-2deg) scale(1.01);
		}
		100% {
			transform: rotate(0deg) scale(1);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.vehicle-avatar:hover .avatar-emoji {
			animation: none;
		}
	}
	.avatar-edit-icon {
		position: absolute;
		bottom: 0;
		right: 0;
		width: 18px;
		height: 18px;
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 0.625rem;
		color: var(--text-subtle);
		opacity: 0;
		transition: opacity 0.15s;
	}
	.vehicle-avatar:hover .avatar-edit-icon {
		opacity: 1;
	}

	/* Avatar popover */
	.avatar-popover-overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.4);
		z-index: 100;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 1rem;
	}
	.popover-preview {
		width: 96px;
		height: 96px;
		border-radius: 50%;
		background: var(--bg-muted);
		border: 1px solid var(--border);
		display: flex;
		align-items: center;
		justify-content: center;
		overflow: hidden;
		margin: 0 auto 1.25rem;
	}
	.popover-preview-img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.avatar-popover {
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: 12px;
		padding: 1.25rem;
		width: 100%;
		max-width: 320px;
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
	}
	.popover-header {
		font-size: var(--text-base);
		font-weight: 600;
		color: var(--text);
		margin-bottom: 1rem;
		text-align: center;
	}
	.emoji-grid {
		display: grid;
		grid-template-columns: repeat(5, 1fr);
		gap: 0.5rem;
	}
	.emoji-btn {
		width: 100%;
		aspect-ratio: 1;
		border: 1px solid var(--border);
		border-radius: 8px;
		background: var(--bg-subtle);
		font-size: 1.5rem;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		transition:
			background 0.1s,
			border-color 0.1s;
	}
	.emoji-btn:hover {
		background: var(--bg-muted);
		border-color: var(--border-strong);
	}
	.emoji-btn--selected {
		background: var(--accent-subtle);
		border-color: var(--accent);
	}
	.popover-divider {
		height: 1px;
		background: var(--border);
		margin: 1rem 0;
	}
	.avatar-file-input {
		display: none;
	}
	.popover-btn {
		width: 100%;
		padding: 0.75rem 1rem;
		border: 1px solid var(--border);
		border-radius: 8px;
		background: var(--bg-subtle);
		font-size: var(--text-base);
		font-weight: 500;
		color: var(--text);
		cursor: pointer;
		margin-bottom: 0.5rem;
		transition: background 0.1s;
		text-align: center;
	}
	.popover-btn:hover {
		background: var(--bg-muted);
	}
	.popover-btn--danger {
		color: var(--status-overdue);
		border-color: var(--status-overdue);
		background: transparent;
	}
	.popover-btn--danger:hover {
		background: color-mix(in srgb, var(--status-overdue) 10%, transparent);
	}
</style>
