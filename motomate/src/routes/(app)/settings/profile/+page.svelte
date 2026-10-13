<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import type { User } from '$lib/db/schema.js';
	import { _ } from '$lib/i18n';
	import { SUPPORTED_LANGUAGES } from '$lib/i18n/locales.js';
	import {
		DEFAULT_ODOMETER_UNIT,
		DISTANCE_UNITS,
		getDistanceUnitTranslationKey,
		isDistanceUnit,
		type DistanceUnit
	} from '$lib/utils/measurement.js';
	import { untrack } from 'svelte';
	import { browser } from '$app/environment';
	import { dicebearUri, parseAvatarSeed, randomAvatarSeed } from '$lib/utils/dicebear.js';
	import { resolveTheme, readStoredTheme } from '$lib/utils/theme.js';
	import { toasts } from '$lib/stores/toasts.svelte.js';

	let { data, form } = $props<{
		data: { user: User };
		form: {
			savedPrefs?: boolean;
			avatarUpdated?: boolean;
			avatarError?: string;
			error?: string;
		} | null;
	}>();

	let saving = $state(false);
	let avatarUploading = $state(false);
	let showAvatarPopover = $state(false);
	let avatarCacheBuster = $state(0);
	let fileInput = $state<HTMLInputElement | null>(null);
	let uploadForm = $state<HTMLFormElement | null>(null);

	function normalizeSeed(value: string): string {
		const { style, seed } = parseAvatarSeed(value);
		return `${style}:${seed}`;
	}

	// 9 seeds: index 0 = currently selected, 1-8 = alternatives
	const initialSeed = untrack(() =>
		data.user.settings.avatar_seed
			? normalizeSeed(data.user.settings.avatar_seed)
			: randomAvatarSeed()
	);
	let gridSeeds = $state<string[]>([initialSeed, ...Array.from({ length: 8 }, randomAvatarSeed)]);
	let selectedSeed = $state(initialSeed);
	let gridUris = $state<string[]>([]);
	let previewUri = $state<string | null>(null);
	let showAttribution = $state(false);

	$effect(() => {
		const values = gridSeeds;
		let stale = false;
		Promise.all(values.map(dicebearUri)).then((uris) => {
			if (!stale) gridUris = uris;
		});
		return () => {
			stale = true;
		};
	});

	$effect(() => {
		if (form?.avatarUpdated) {
			avatarCacheBuster = Date.now();
			showAvatarPopover = false;
			if (data.user.settings.avatar_seed) {
				selectedSeed = normalizeSeed(data.user.settings.avatar_seed);
			}
		}
	});

	const hasAvatarImage = $derived(!!data.user.settings.avatar_key);
	const avatarSrc = $derived(
		data.user.settings.avatar_key
			? `/api/files?key=${data.user.settings.avatar_key}${avatarCacheBuster > 0 ? `&v=${avatarCacheBuster}` : ''}`
			: null
	);

	// DiceBear URI for the 56px button and 96px preview
	$effect(() => {
		if (hasAvatarImage) {
			previewUri = null;
			return;
		}
		let stale = false;
		dicebearUri(selectedSeed).then((uri) => {
			if (!stale) previewUri = uri;
		});
		return () => {
			stale = true;
		};
	});

	function triggerFileUpload() {
		if (fileInput?.files?.length) {
			uploadForm?.requestSubmit();
		}
	}

	const CC_BY = 'https://creativecommons.org/licenses/by/4.0/';
	const AVATAR_CREDITS = [
		{
			artist: 'Davis Uche',
			artistUrl: 'https://www.instagram.com/davedirect3/',
			license: 'CC BY 4.0',
			licenseUrl: CC_BY
		},
		{
			artist: 'The Visual Team',
			artistUrl: 'https://thevisual.team/',
			license: 'CC BY 4.0',
			licenseUrl: CC_BY
		},
		{
			artist: 'DiceBear',
			artistUrl: 'https://www.dicebear.com',
			license: 'CC0',
			licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/'
		}
	];

	function shuffle() {
		gridSeeds = [gridSeeds[0], ...Array.from({ length: 8 }, randomAvatarSeed)];
	}

	let selectedOdometerUnit = $state<DistanceUnit>(
		untrack(() =>
			isDistanceUnit(data.user.settings.odometer_unit)
				? data.user.settings.odometer_unit
				: DEFAULT_ODOMETER_UNIT
		)
	);

	const themeOptions = [
		{ id: 'light' as const, labelKey: 'layout.theme.light' },
		{ id: 'dark' as const, labelKey: 'layout.theme.dark' },
		{ id: 'system' as const, labelKey: 'layout.theme.system' }
	];
	let selectedTheme = $state<'light' | 'dark' | 'system'>(
		untrack(() => {
			const db = (data.user.settings.theme ?? 'system') as 'light' | 'dark' | 'system';
			if (db !== 'system') return db;
			return browser ? readStoredTheme() : 'system';
		})
	);

	async function setTheme(t: 'light' | 'dark' | 'system') {
		selectedTheme = t;
		localStorage.setItem('theme', t);
		document.documentElement.dataset.theme = resolveTheme(t);
		const fd = new FormData();
		fd.set('theme', t);
		await fetch('?/savePrefs', { method: 'POST', body: fd });
	}
</script>

<svelte:head><title>{$_('settings.profile.title')} &middot; Settings</title></svelte:head>

<div class="intro">
	<h2 class="section-title">{$_('settings.profile.title')}</h2>
	<p class="section-desc">{$_('settings.profile.subtitle')}</p>
</div>

<section class="setting-section">
	<h3 class="sub-title">{$_('settings.profile.avatar')}</h3>

	<button
		type="button"
		class="user-avatar"
		class:user-avatar--image={hasAvatarImage || previewUri}
		onclick={() => {
			showAttribution = false;
			showAvatarPopover = true;
		}}
		aria-label={$_('settings.profile.avatarUpload')}
	>
		{#if hasAvatarImage && avatarSrc}
			<img src={avatarSrc} alt="" class="avatar-img" />
		{:else if previewUri}
			<img src={previewUri} alt="" class="avatar-img" />
		{:else}
			<span class="avatar-initials">{data.user.email[0].toUpperCase()}</span>
		{/if}
		<span class="avatar-edit-icon" aria-hidden="true">✎</span>
	</button>
</section>

<section class="setting-section">
	<h3 class="sub-title">{$_('settings.profile.display')}</h3>

	<form
		method="POST"
		action="?/savePrefs"
		class="pref-form"
		use:enhance={() => {
			saving = true;
			return async ({ result, update }) => {
				await update({ reset: false });
				saving = false;
				if (result.type === 'success') toasts.success($_('settings.profile.saved'));
			};
		}}
	>
		<label class="field">
			<span class="field-label">
				{$_('settings.profile.displayName')}
				<span class="optional">{$_('common.optional')}</span>
			</span>
			<input
				type="text"
				name="display_name"
				class="input"
				maxlength="80"
				value={data.user.settings.display_name ?? ''}
				placeholder={$_('settings.profile.displayNamePlaceholder')}
			/>
		</label>

		<label class="field">
			<span class="field-label">{$_('settings.profile.language')}</span>
			<select name="locale" class="input">
				{#each SUPPORTED_LANGUAGES as lang (lang.code)}
					<option value={lang.code} selected={data.user.settings.locale === lang.code}
						>{lang.label}</option
					>
				{/each}
			</select>
		</label>

		<label class="field">
			<span class="field-label">{$_('settings.profile.currency')}</span>
			<select name="currency" class="input">
				{#each [['EUR', '€ Euro'], ['GBP', '£ Pound'], ['CHF', 'CHF Franc'], ['USD', '$ Dollar']] as [val, label]}
					<option value={val} selected={data.user.settings.currency === val}>{label}</option>
				{/each}
			</select>
		</label>

		<label class="field">
			<span class="field-label">{$_('settings.profile.odometerUnit')}</span>
			<div class="toggle-row">
				{#each DISTANCE_UNITS as unit}
					<label class="toggle-opt" class:toggle-opt--active={selectedOdometerUnit === unit}>
						<input
							type="radio"
							name="odometer_unit"
							value={unit}
							bind:group={selectedOdometerUnit}
							class="sr-only"
						/>
						{$_(getDistanceUnitTranslationKey(unit))}
					</label>
				{/each}
			</div>
		</label>

		<div class="field">
			<span class="field-label">{$_('layout.theme.title')}</span>
			<div class="toggle-row">
				{#each themeOptions as opt}
					<button
						type="button"
						class="toggle-opt"
						class:toggle-opt--active={selectedTheme === opt.id}
						onclick={() => setTheme(opt.id)}
					>
						{$_(opt.labelKey)}
					</button>
				{/each}
			</div>
		</div>

		<button type="submit" class="btn-primary" disabled={saving}>
			{saving ? $_('settings.profile.saving') : $_('settings.profile.submit')}
		</button>
	</form>
</section>

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
			<div class="popover-preview">
				{#if hasAvatarImage && avatarSrc}
					<img src={avatarSrc} alt="" class="popover-preview-img" />
				{:else if previewUri}
					<img src={previewUri} alt="" class="popover-preview-img" />
				{:else}
					<span class="popover-preview-initials">{data.user.email[0].toUpperCase()}</span>
				{/if}
			</div>

			<div class="dice-head">
				<span class="dice-label">{$_('settings.profile.avatarDicebear')}</span>
				<button
					type="button"
					class="dice-info"
					aria-label={$_('settings.profile.avatarCredits')}
					aria-expanded={showAttribution}
					onclick={() => (showAttribution = !showAttribution)}
				>
					<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
						<circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" stroke-width="1.25" />
						<path
							d="M6.2 6.1a1.85 1.85 0 0 1 3.6.55c0 1.25-1.8 1.6-1.8 2.85"
							fill="none"
							stroke="currentColor"
							stroke-width="1.25"
							stroke-linecap="round"
						/>
						<circle cx="8" cy="11.6" r="0.8" fill="currentColor" />
					</svg>
				</button>
			</div>
			{#if showAttribution}
				<ul class="dice-credits">
					{#each AVATAR_CREDITS as c (c.artist)}
						<li>
							<a href={c.artistUrl} target="_blank" rel="noopener noreferrer">{c.artist}</a>
							&middot;
							<a href={c.licenseUrl} target="_blank" rel="noopener noreferrer">{c.license}</a>
						</li>
					{/each}
				</ul>
			{/if}
			<div class="dice-grid">
				{#each gridSeeds as seed, i (seed)}
					<form
						method="POST"
						action="?/setDiceBearSeed"
						use:enhance={() => {
							selectedSeed = seed;
							return async ({ update }) => {
								await update();
								gridSeeds = [seed, ...gridSeeds.filter((s) => s !== seed).slice(0, 8)];
								await invalidateAll();
							};
						}}
					>
						<input type="hidden" name="seed" value={seed} />
						<button
							type="submit"
							class="dice-btn"
							class:dice-btn--selected={seed === selectedSeed && !hasAvatarImage}
							aria-label="Avatar option {i + 1}"
						>
							{#if gridUris[i]}<img src={gridUris[i]} alt="" />{/if}
						</button>
					</form>
				{/each}
			</div>

			<button type="button" class="popover-btn popover-btn--muted" onclick={shuffle}>
				{$_('settings.profile.avatarShuffle')}
			</button>

			<div class="popover-divider"></div>

			<button
				type="button"
				class="popover-btn"
				disabled={avatarUploading}
				onclick={() => fileInput?.click()}
			>
				{avatarUploading ? $_('settings.profile.saving') : $_('settings.profile.avatarUpload')}
			</button>

			<form
				bind:this={uploadForm}
				method="POST"
				action="?/uploadAvatar"
				enctype="multipart/form-data"
				use:enhance={({ formData, cancel }) => {
					const file = formData.get('file') as File;
					if (!file || file.size === 0) return cancel();
					avatarUploading = true;
					return async ({ result, update }) => {
						await update();
						avatarUploading = false;
						if (result.type === 'failure') toasts.error(String(result.data?.avatarError ?? ''));
						if (fileInput) fileInput.value = '';
					};
				}}
			>
				<input
					bind:this={fileInput}
					type="file"
					name="file"
					accept="image/jpeg,image/png,image/webp,image/gif"
					class="avatar-file-input"
					onchange={triggerFileUpload}
				/>
			</form>

			{#if hasAvatarImage}
				<form
					method="POST"
					action="?/uploadAvatar"
					use:enhance={() => {
						avatarUploading = true;
						return async ({ update }) => {
							await update();
							avatarUploading = false;
						};
					}}
				>
					<input type="hidden" name="remove" value="true" />
					<button type="submit" class="popover-btn popover-btn--danger" disabled={avatarUploading}>
						{$_('settings.profile.avatarRemove')}
					</button>
				</form>
			{/if}
		</div>
	</div>
{/if}

<style>
	.section-title {
		font-size: var(--text-xl);
		font-weight: 600;
		color: var(--text);
		margin: 0 0 var(--space-2);
		letter-spacing: -0.02em;
	}
	.section-desc {
		font-size: var(--text-sm);
		color: var(--text-muted);
		line-height: var(--leading-base);
		margin: 0;
	}
	.intro {
		margin-bottom: var(--space-5);
	}
	.sub-title {
		font-size: var(--text-lg);
		font-weight: 600;
		color: var(--text);
		margin: 0 0 0.75rem;
	}
	.setting-section {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		margin-bottom: var(--space-6);
	}
	.pref-form {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
	}
	.field-label {
		font-size: var(--text-sm);
		font-weight: 500;
		color: var(--text-muted);
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}
	.optional {
		font-weight: 400;
		color: var(--text-subtle);
	}
	.input {
		padding: 0.5rem 0.75rem;
		border: 1px solid var(--border-input);
		border-radius: 8px;
		background: var(--bg-subtle);
		color: var(--text);
		font-size: max(1rem, 16px);
		width: 100%;
		transition: border-color 0.15s;
		box-sizing: border-box;
	}
	.input:focus {
		outline: 2px solid var(--accent);
		outline-offset: 1px;
		border-color: transparent;
	}
	.toggle-row {
		display: flex;
		border: 1px solid var(--border);
		border-radius: 10px;
		overflow: hidden;
	}
	.toggle-opt {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0.5rem;
		cursor: pointer;
		font-size: var(--text-sm);
		font-weight: 500;
		color: var(--text-muted);
		background: var(--bg-subtle);
		border: none;
		border-radius: 0;
		transition:
			background 0.1s,
			color 0.1s;
	}
	.toggle-opt--active {
		background: var(--accent);
		color: var(--accent-fg);
	}
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border-width: 0;
	}
	.btn-primary {
		align-self: flex-start;
		padding: 0.5rem 1rem;
		background: var(--accent);
		color: var(--accent-fg);
		border: none;
		border-radius: 10px;
		font-size: var(--text-sm);
		font-weight: 500;
		cursor: pointer;
	}
	.btn-primary:hover:not(:disabled) {
		background: var(--accent-hover);
	}
	.btn-primary:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	/* User avatar button; mirrors .vehicle-avatar */
	.user-avatar {
		position: relative;
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
		cursor: pointer;
		border: none;
		padding: 0;
		transition: box-shadow 0.15s;
	}
	.user-avatar:hover {
		box-shadow: 0 0 0 2px var(--accent);
	}
	.user-avatar--image {
		background: transparent;
	}
	.avatar-img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		border-radius: 50%;
	}
	.avatar-initials {
		font-size: 1.25rem;
		font-weight: 600;
		color: var(--text-muted);
		text-transform: uppercase;
		line-height: 1;
	}
	.avatar-edit-icon {
		position: absolute;
		bottom: -2px;
		right: -2px;
		width: 18px;
		height: 18px;
		border-radius: 50%;
		background: var(--bg);
		border: 1px solid var(--border);
		font-size: 0.6875rem;
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--text-subtle);
		opacity: 0;
		transition: opacity 0.15s;
	}
	.user-avatar:hover .avatar-edit-icon {
		opacity: 1;
	}

	/* Avatar popover; mirrors vehicle avatar popover */
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
	.avatar-popover {
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: 12px;
		padding: 1.25rem;
		width: 100%;
		max-width: 280px;
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
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
	.popover-preview-initials {
		font-size: 2.25rem;
		font-weight: 600;
		color: var(--text-muted);
		text-transform: uppercase;
		line-height: 1;
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
	.popover-btn:last-child {
		margin-bottom: 0;
	}
	.popover-btn:hover:not(:disabled) {
		background: var(--bg-muted);
	}
	.popover-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	.popover-btn--danger {
		color: var(--status-overdue);
		border-color: color-mix(in srgb, var(--status-overdue) 25%, var(--border));
	}
	.popover-btn--danger:hover:not(:disabled) {
		background: color-mix(in srgb, var(--status-overdue) 6%, var(--bg));
	}
	.popover-btn--muted {
		color: var(--text-muted);
		font-size: var(--text-sm);
	}
	.popover-divider {
		height: 1px;
		background: var(--border);
		margin: 0.5rem 0;
	}
	.dice-head {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: var(--space-1);
		margin-bottom: 0.5rem;
	}
	.dice-label {
		font-size: var(--text-xs);
		font-weight: 500;
		color: var(--text-muted);
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}
	.dice-info {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 24px;
		height: 24px;
		padding: 0;
		border: none;
		border-radius: 50%;
		background: none;
		color: var(--text-subtle);
		cursor: pointer;
	}
	.dice-info:hover,
	.dice-info[aria-expanded='true'] {
		color: var(--text-muted);
	}
	.dice-credits {
		font-size: var(--text-xs);
		line-height: var(--leading-base);
		color: var(--text-muted);
		text-align: center;
		list-style: none;
		padding: 0;
		margin: 0 0 0.5rem;
	}
	.dice-credits a {
		color: inherit;
		text-decoration: underline;
		text-underline-offset: 2px;
	}
	.dice-grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 0.5rem;
		margin-bottom: 0.5rem;
	}
	.dice-btn {
		width: 100%;
		aspect-ratio: 1;
		border: 1px solid var(--border);
		border-radius: 8px;
		background: var(--bg-subtle);
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		overflow: hidden;
		padding: 0;
		transition:
			background 0.1s,
			border-color 0.1s;
	}
	.dice-btn img {
		width: 100%;
		height: 100%;
		display: block;
	}
	.dice-btn:hover {
		background: var(--bg-muted);
		border-color: var(--border-strong);
	}
	.dice-btn--selected {
		background: var(--accent-subtle);
		border-color: var(--accent);
	}
</style>
