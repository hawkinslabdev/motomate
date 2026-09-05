<script lang="ts">
	import { page, navigating } from '$app/state';
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { tick } from 'svelte';
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
	let tabsEl: HTMLElement | undefined = $state();
	let popoverEl: HTMLElement | undefined = $state();
	let showPinPicker = $state(false);
	let pinSearch = $state('');
	let pinSearchEl: HTMLInputElement | undefined = $state();

	$effect(() => {
		if (showPinPicker) {
			tick().then(() => pinSearchEl?.focus());
		} else {
			pinSearch = '';
		}
	});

	// Derived logic
	const vehicle = $derived(data.vehicle);
	const locale = $derived(data.user?.settings?.locale ?? 'en');
	const pinnedDoc = $derived(data.pinnedDoc);
	const docList = $derived(data.docList);
	const filteredDocList = $derived(
		pinSearch.trim().length === 0
			? docList
			: docList.filter(
					(d) =>
						d.name.toLowerCase().includes(pinSearch.toLowerCase()) ||
						d.doc_type.toLowerCase().includes(pinSearch.toLowerCase())
				)
	);

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
		function frame(now: number) {
			const elapsed = now - startTime;
			const progress = Math.min(elapsed / duration, 1);
			// ease-out-quart: decelerate strongly at the end, like a real odometer settling
			const eased = 1 - Math.pow(1 - progress, 4);
			displayOdo = Math.round(startValue + (target - startValue) * eased);
			if (progress < 1) rafId = requestAnimationFrame(frame);
		}

		rafId = requestAnimationFrame(frame);
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
			id: 'notes',
			labelKey: 'vehicle.layout.tabs.notes',
			href: `/vehicles/${vehicle.id}/notes`
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
		tabs.findLast((t) => page.url.pathname.startsWith(t.href) || page.url.pathname === t.href)
			?.id ?? 'timeline'
	);

	$effect(() => {
		void activeTabId;
		tick().then(() => {
			tabsEl?.querySelector('.vtab--active')?.scrollIntoView({
				block: 'nearest',
				inline: 'nearest',
				behavior: 'smooth'
			});
		});
	});

	$effect(() => {
		if (showAvatarPopover) {
			tick().then(() => popoverEl?.focus());
		}
	});

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

	const handlePinSubmit = () => {
		return async ({ update }: { update: any }) => {
			await update();
			await invalidateAll();
			showPinPicker = false;
		};
	};

	const handleLabelSave = () => {
		return async ({ update }: { update: any }) => {
			await update();
			await invalidateAll();
		};
	};

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
					aria-label={$_('vehicle.changeAvatar')}
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

				<div class="pin-widget" class:pin-widget--pinned={pinnedDoc !== null}>
					{#if pinnedDoc}
						<a
							href="/api/files?key={pinnedDoc.storage_key}"
							target="_blank"
							rel="noopener"
							class="pin-content"
							aria-label={vehicle.meta?.pinned_doc_label || pinnedDoc.title || pinnedDoc.name}
						>
							<span class="pin-doc-name"
								>{vehicle.meta?.pinned_doc_label || pinnedDoc.title || pinnedDoc.name}</span
							>
						</a>

						<div
							class="pin-actions"
							role="group"
							aria-label={$_('vehicle.layout.pinnedDoc.actions')}
						>
							<a
								href="/api/files?key={pinnedDoc.storage_key}"
								target="_blank"
								rel="noopener"
								class="pin-action"
								title={$_('vehicle.layout.pinnedDoc.openFile')}
							>
								<svg
									width="11"
									height="11"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="2"
									stroke-linecap="round"
									stroke-linejoin="round"
									aria-hidden="true"
								>
									<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
									<polyline points="15 3 21 3 21 9" />
									<line x1="10" y1="14" x2="21" y2="3" />
								</svg>
							</a>
							<a
								href="/vehicles/{vehicle.id}/documents?highlight={pinnedDoc.id}"
								class="pin-action"
								title={$_('vehicle.layout.pinnedDoc.viewInList')}
							>
								<svg
									width="11"
									height="11"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="2"
									stroke-linecap="round"
									stroke-linejoin="round"
									aria-hidden="true"
								>
									<line x1="8" y1="6" x2="21" y2="6" />
									<line x1="8" y1="12" x2="21" y2="12" />
									<line x1="8" y1="18" x2="21" y2="18" />
									<line x1="3" y1="6" x2="3.01" y2="6" />
									<line x1="3" y1="12" x2="3.01" y2="12" />
									<line x1="3" y1="18" x2="3.01" y2="18" />
								</svg>
							</a>
							<button
								type="button"
								class="pin-action"
								onclick={() => (showPinPicker = !showPinPicker)}
								title={$_('vehicle.layout.pinnedDoc.editPin')}
							>
								<svg
									width="11"
									height="11"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="2"
									stroke-linecap="round"
									stroke-linejoin="round"
									aria-hidden="true"
								>
									<path d="M12 20h9" />
									<path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
								</svg>
							</button>
						</div>
					{:else}
						<button
							type="button"
							class="pin-content"
							onclick={() => (showPinPicker = !showPinPicker)}
							aria-label={$_('vehicle.layout.pinnedDoc.pin')}
						>
							<svg
								class="pin-empty-icon"
								width="16"
								height="16"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="1.5"
								stroke-linecap="round"
								stroke-linejoin="round"
								aria-hidden="true"
							>
								<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
								<polyline points="14 2 14 8 20 8" />
								<line x1="16" y1="13" x2="8" y2="13" />
								<line x1="16" y1="17" x2="8" y2="17" />
							</svg>
							<span class="pin-empty-label">{$_('vehicle.layout.pinnedDoc.pin')}</span>
						</button>
					{/if}

					{#if showPinPicker}
						<div
							class="pin-picker-overlay"
							role="presentation"
							onclick={() => (showPinPicker = false)}
						></div>
						<div class="pin-picker" role="dialog" aria-label={$_('vehicle.layout.pinnedDoc.pin')}>
							<div class="pin-picker-search">
								<svg
									class="pin-search-icon"
									width="13"
									height="13"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="2"
									stroke-linecap="round"
									stroke-linejoin="round"
									aria-hidden="true"
								>
									<circle cx="11" cy="11" r="8" />
									<line x1="21" y1="21" x2="16.65" y2="16.65" />
								</svg>
								<input
									bind:this={pinSearchEl}
									bind:value={pinSearch}
									type="search"
									class="pin-search-input"
									placeholder={$_('vehicle.layout.pinnedDoc.searchPlaceholder')}
									autocomplete="off"
									onkeydown={(e) => e.key === 'Escape' && (showPinPicker = false)}
								/>
								{#if pinSearch.length > 0}
									<button
										type="button"
										class="pin-search-clear"
										onclick={() => {
											pinSearch = '';
											pinSearchEl?.focus();
										}}
										aria-label={$_('vehicle.clearSearch')}
									>
										<svg
											width="10"
											height="10"
											viewBox="0 0 24 24"
											fill="none"
											stroke="currentColor"
											stroke-width="2.5"
											stroke-linecap="round"
											aria-hidden="true"
										>
											<line x1="18" y1="6" x2="6" y2="18" />
											<line x1="6" y1="6" x2="18" y2="18" />
										</svg>
									</button>
								{/if}
							</div>
							<div class="pin-picker-list" role="menu">
								{#if docList.length === 0}
									<p class="pin-picker-empty">{$_('vehicle.layout.pinnedDoc.noDocs')}</p>
								{:else if filteredDocList.length === 0}
									<p class="pin-picker-empty">
										{$_('vehicle.layout.pinnedDoc.noResults', { values: { q: pinSearch } })}
									</p>
								{:else}
									{#each filteredDocList as doc}
										<form
											method="POST"
											action="/vehicles/{vehicle.id}/edit?/pinDocument"
											use:enhance={handlePinSubmit}
										>
											<input type="hidden" name="doc_id" value={doc.id} />
											<button
												type="submit"
												class="pin-picker-item"
												class:pin-picker-item--active={pinnedDoc?.id === doc.id}
												role="menuitem"
											>
												<span class="doc-chip-type">{$_('documents.types.' + doc.doc_type)}</span>
												<span class="pin-picker-name">{doc.title || doc.name}</span>
											</button>
										</form>
									{/each}
								{/if}
							</div>
							{#if pinnedDoc}
								<div class="pin-picker-sep"></div>
								<form
									method="POST"
									action="/vehicles/{vehicle.id}/edit?/pinDocument"
									use:enhance={handleLabelSave}
									class="pin-label-form"
								>
									<input type="hidden" name="doc_id" value={pinnedDoc.id} />
									<label class="pin-label-field">
										<span class="pin-label-caption"
											>{$_('vehicle.layout.pinnedDoc.customLabel')}</span
										>
										<div class="pin-label-input-row">
											<input
												type="text"
												name="pin_label"
												class="pin-label-input"
												value={vehicle.meta?.pinned_doc_label ?? ''}
												placeholder={pinnedDoc.title || pinnedDoc.name}
												maxlength="80"
											/>
											<button type="submit" class="pin-label-save">
												{$_('common.save')}
											</button>
										</div>
									</label>
								</form>
								<div class="pin-picker-sep"></div>
								<form
									method="POST"
									action="/vehicles/{vehicle.id}/edit?/pinDocument"
									use:enhance={handlePinSubmit}
								>
									<input type="hidden" name="doc_id" value="" />
									<button
										type="submit"
										class="pin-picker-item pin-picker-item--remove"
										role="menuitem"
									>
										{$_('vehicle.layout.pinnedDoc.remove')}
									</button>
								</form>
							{/if}
						</div>
					{/if}
				</div>
			</div>
		</div>

		<nav class="vehicle-tabs" bind:this={tabsEl} aria-label={$_('vehicle.sectionsNav')}>
			{#each tabs as tab}
				<a
					href={tab.href}
					class="vtab"
					class:vtab--active={activeTabId === tab.id}
					aria-current={activeTabId === tab.id ? 'page' : undefined}
				>
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

	<div class="vehicle-content" class:loading={navigating.to !== null}>
		{@render children()}
	</div>

	{#if showAvatarPopover}
		<div
			class="avatar-popover-overlay"
			onclick={() => (showAvatarPopover = false)}
			role="presentation"
		>
			<div
				bind:this={popoverEl}
				class="avatar-popover"
				onclick={(e) => e.stopPropagation()}
				onkeydown={(e) => e.stopPropagation()}
				role="dialog"
				aria-modal="true"
				aria-labelledby="avatar-dialog-title"
				tabindex="-1"
			>
				{#if hasAvatarImage && avatarSrc}
					<div class="popover-preview">
						<img src={avatarSrc} alt="" class="popover-preview-img" />
					</div>
				{:else}
					<div id="avatar-dialog-title" class="popover-header">
						{$_('vehicle.layout.avatar.choose')}
					</div>
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
		overflow-wrap: break-word;
		word-break: break-word;
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
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
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
		min-height: 44px;
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
		transition: opacity 0.15s;
	}
	.vehicle-content.loading {
		opacity: 0.6;
		pointer-events: none;
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
	@media (max-width: 360px) {
		.vehicle-avatar {
			width: 44px;
			height: 44px;
			font-size: 1.375rem;
		}
		.odo-num {
			font-size: var(--text-xl);
		}
		.vehicle-identity {
			gap: 0.875rem;
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

	/* Pin widget */
	.pin-widget {
		position: relative;
		margin-left: auto;
		flex-shrink: 0;
		align-self: stretch;
	}
	@media (max-width: 639px) {
		.pin-widget {
			display: none;
		}
	}
	.pin-content {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.375rem;
		width: 112px;
		height: 100%;
		border: 1px dashed var(--border);
		border-radius: 8px;
		background: transparent;
		cursor: pointer;
		padding: 0.75rem;
		transition:
			border-color 0.2s ease,
			background 0.2s ease,
			color 0.2s ease;
		color: var(--text-subtle);
		text-align: center;
		font-family: var(--font-sans);
	}
	.pin-content:hover {
		border-color: var(--accent);
		color: var(--text-muted);
		background: var(--accent-subtle);
	}
	.pin-widget--pinned .pin-content {
		border-style: solid;
		border-color: var(--border);
		background: transparent;
		align-items: flex-start;
		justify-content: flex-start;
		padding-top: 0.875rem;
		width: 152px;
		text-align: left;
	}
	.pin-widget--pinned .pin-content:hover {
		border-color: var(--border-strong);
		background: var(--bg-subtle);
	}
	.pin-empty-icon {
		color: inherit;
		flex-shrink: 0;
		transition: transform 0.25s cubic-bezier(0.25, 1, 0.5, 1);
	}
	.pin-content:hover .pin-empty-icon {
		transform: translateY(-3px) rotate(-6deg);
	}
	.pin-empty-label {
		font-size: var(--text-xs);
		font-weight: 400;
		letter-spacing: 0.02em;
		color: inherit;
		line-height: var(--leading-snug);
	}
	.pin-doc-name {
		font-size: var(--text-sm);
		font-weight: 400;
		color: var(--text-muted);
		line-height: var(--leading-snug);
		display: -webkit-box;
		-webkit-line-clamp: 4;
		line-clamp: 4;
		-webkit-box-orient: vertical;
		overflow: hidden;
		word-break: break-word;
	}
	.pin-widget--pinned .pin-content:hover .pin-doc-name {
		color: var(--text);
	}
	.pin-actions {
		position: absolute;
		bottom: 0;
		left: 0;
		right: 0;
		height: 36px;
		display: flex;
		align-items: flex-end;
		justify-content: center;
		gap: 0.25rem;
		padding: 0 0.5rem 0.375rem;
		background: linear-gradient(
			to bottom,
			transparent 0%,
			color-mix(in srgb, var(--bg-subtle) 70%, transparent) 50%,
			var(--bg-subtle) 100%
		);
		border-bottom-left-radius: 7px;
		border-bottom-right-radius: 7px;
		opacity: 0;
		transform: translateY(4px);
		transition:
			opacity 0.2s ease,
			transform 0.2s cubic-bezier(0.25, 1, 0.5, 1);
		pointer-events: none;
	}
	.pin-widget--pinned:hover .pin-actions {
		opacity: 1;
		transform: translateY(0);
		pointer-events: all;
	}
	.pin-action {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 22px;
		height: 22px;
		border-radius: 4px;
		background: var(--bg);
		border: 1px solid var(--border);
		color: var(--text-subtle);
		text-decoration: none;
		transition:
			color 0.15s,
			border-color 0.15s,
			background 0.15s,
			transform 0.15s cubic-bezier(0.25, 1, 0.5, 1);
		flex-shrink: 0;
	}
	.pin-action:hover {
		color: var(--accent);
		border-color: color-mix(in srgb, var(--accent) 40%, var(--border));
		background: var(--accent-subtle);
		transform: scale(1.1);
	}
	.pin-action:active {
		transform: scale(0.95);
	}
	.pin-picker-overlay {
		position: fixed;
		inset: 0;
		z-index: 29;
	}
	.pin-picker {
		position: absolute;
		right: 0;
		top: calc(100% + 0.375rem);
		background: var(--bg);
		border: 1px solid var(--border-strong);
		border-radius: 10px;
		box-shadow: 0 4px 20px color-mix(in srgb, var(--text) 12%, transparent);
		z-index: 30;
		width: 300px;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}
	.pin-picker-search {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.625rem 0.75rem;
		border-bottom: 1px solid var(--border);
		flex-shrink: 0;
	}
	.pin-search-icon {
		color: var(--text-subtle);
		flex-shrink: 0;
	}
	.pin-search-input {
		flex: 1;
		border: none;
		background: transparent;
		font-size: var(--text-sm);
		color: var(--text);
		font-family: var(--font-sans);
		outline: none;
		min-width: 0;
		appearance: none;
	}
	.pin-search-input::placeholder {
		color: var(--text-subtle);
	}
	.pin-search-input::-webkit-search-cancel-button {
		display: none;
	}
	.pin-search-clear {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 18px;
		height: 18px;
		border-radius: 50%;
		background: var(--bg-muted);
		border: none;
		cursor: pointer;
		color: var(--text-muted);
		flex-shrink: 0;
		transition:
			background 0.1s,
			color 0.1s;
	}
	.pin-search-clear:hover {
		background: var(--border-strong);
		color: var(--text);
	}
	.pin-picker-list {
		padding: 0.375rem;
		display: flex;
		flex-direction: column;
		gap: 2px;
		max-height: 240px;
		overflow-y: auto;
	}
	.pin-picker-empty {
		font-size: var(--text-sm);
		color: var(--text-muted);
		padding: 0.5rem 0.625rem;
		margin: 0;
	}
	.pin-picker-item {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		width: 100%;
		padding: 0.5rem 0.625rem;
		border: none;
		border-radius: 6px;
		background: transparent;
		cursor: pointer;
		text-align: left;
		transition: background 0.1s;
		font-family: var(--font-sans);
	}
	.pin-picker-item:hover {
		background: var(--bg-muted);
	}
	.pin-picker-item:active {
		transform: scale(0.98);
		transition: transform 0.08s ease;
	}
	.pin-picker-item--active {
		background: var(--accent-subtle);
	}
	.pin-picker-item--active:hover {
		background: color-mix(in srgb, var(--accent-subtle) 70%, var(--bg-muted));
	}
	.pin-picker-name {
		font-size: var(--text-sm);
		color: var(--text);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		flex: 1;
		min-width: 0;
	}
	.pin-picker-item--remove {
		color: var(--text-muted);
		font-size: var(--text-sm);
		justify-content: center;
	}
	.pin-picker-item--remove:hover {
		color: var(--status-overdue);
		background: color-mix(in srgb, var(--status-overdue) 6%, transparent);
	}
	.pin-picker-sep {
		height: 1px;
		background: var(--border);
		margin: 0;
	}
	.pin-label-form {
		padding: 0.625rem 0.75rem;
	}
	.pin-label-field {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
	}
	.pin-label-caption {
		font-size: var(--text-xs);
		font-weight: 500;
		color: var(--text-muted);
		letter-spacing: 0.01em;
	}
	.pin-label-input-row {
		display: flex;
		gap: 0.375rem;
	}
	.pin-label-input {
		flex: 1;
		min-width: 0;
		padding: 0.375rem 0.5rem;
		border: 1px solid var(--border-strong);
		border-radius: 6px;
		background: var(--bg);
		color: var(--text);
		font-size: var(--text-sm);
		font-family: var(--font-sans);
		outline: none;
	}
	.pin-label-input:focus {
		border-color: var(--accent);
		outline: 2px solid color-mix(in srgb, var(--accent) 25%, transparent);
		outline-offset: 0;
	}
	.pin-label-save {
		padding: 0.375rem 0.625rem;
		background: var(--bg-muted);
		border: 1px solid var(--border);
		border-radius: 6px;
		font-size: var(--text-sm);
		font-weight: 500;
		color: var(--text);
		cursor: pointer;
		font-family: var(--font-sans);
		white-space: nowrap;
		transition:
			background 0.1s,
			border-color 0.1s;
		flex-shrink: 0;
	}
	.pin-label-save:hover {
		background: var(--border);
		border-color: var(--border-strong);
	}
	.doc-chip-type {
		font-size: var(--text-xs);
		font-weight: 500;
		color: var(--text-muted);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		flex-shrink: 0;
	}
</style>
