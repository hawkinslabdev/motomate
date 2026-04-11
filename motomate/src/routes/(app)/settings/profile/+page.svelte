<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import type { User } from '$lib/db/schema.js';
	import { _ } from '$lib/i18n';
	import { dicebearUri, randomSeed } from '$lib/utils/dicebear.js';

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

	// 9 seeds: index 0 = currently selected, 1-8 = alternatives
	function buildGrid(): string[] {
		const current = data.user.settings.avatar_seed ?? randomSeed();
		return [current, ...Array.from({ length: 8 }, randomSeed)];
	}

	let gridSeeds = $state<string[]>(buildGrid());
	let selectedSeed = $state(data.user.settings.avatar_seed ?? gridSeeds[0]);

	// Data URIs — recompute when seeds change
	const gridUris = $derived(gridSeeds.map(dicebearUri));

	$effect(() => {
		if (form?.avatarUpdated) {
			avatarCacheBuster = Date.now();
			showAvatarPopover = false;
			if (data.user.settings.avatar_seed) {
				selectedSeed = data.user.settings.avatar_seed;
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
	const previewUri = $derived(!hasAvatarImage ? dicebearUri(selectedSeed) : null);

	function triggerFileUpload() {
		if (fileInput?.files?.length) {
			uploadForm?.requestSubmit();
		}
	}

	function shuffle() {
		gridSeeds = [gridSeeds[0], ...Array.from({ length: 8 }, randomSeed)];
	}
</script>

<svelte:head><title>{$_('settings.profile.title')} &middot; Settings</title></svelte:head>

<h2 class="section-title">{$_('settings.profile.title')}</h2>

<section class="setting-section">
	<h3 class="sub-title">{$_('settings.profile.avatar')}</h3>

	{#if form?.avatarError}
		<div class="banner banner--err">{form.avatarError}</div>
	{/if}

	<button
		type="button"
		class="user-avatar"
		class:user-avatar--image={hasAvatarImage || previewUri}
		onclick={() => (showAvatarPopover = true)}
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

	{#if form?.savedPrefs}
		<div class="banner banner--ok">{$_('settings.profile.saved')}</div>
	{/if}
	{#if form?.error}
		<div class="banner banner--err">{form.error}</div>
	{/if}

	<form
		method="POST"
		action="?/savePrefs"
		class="pref-form"
		use:enhance={() => {
			saving = true;
			return async ({ update }) => {
				await update();
				saving = false;
			};
		}}
	>
		<label class="field">
			<span class="field-label">{$_('settings.profile.language')}</span>
			<select name="locale" class="input">
				{#each [['en', 'English'], ['de', 'Deutsch'], ['fr', 'Français'], ['it', 'Italiano'], ['es', 'Español'], ['nl', 'Nederlands'], ['pt', 'Português']] as [val, label]}
					<option value={val} selected={data.user.settings.locale === val}>{label}</option>
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
				{#each [['km', $_('units.km')], ['mi', $_('units.mi')]] as [val, label]}
					<label
						class="toggle-opt"
						class:toggle-opt--active={data.user.settings.odometer_unit === val}
					>
						<input
							type="radio"
							name="odometer_unit"
							value={val}
							checked={data.user.settings.odometer_unit === val}
							class="sr-only"
						/>
						{label}
					</label>
				{/each}
			</div>
		</label>

		<button type="submit" class="btn-secondary" disabled={saving}>
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

			{#if form?.avatarError}
				<div class="banner banner--err" style="margin-bottom: 0.75rem">{form.avatarError}</div>
			{/if}

			<!-- DiceBear grid (3×3) -->
			<div class="dice-label">{$_('settings.profile.avatarDicebear')}</div>
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
							<img src={gridUris[i]} alt="" />
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
					return async ({ update }) => {
						await update();
						avatarUploading = false;
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
		font-size: var(--text-2xl);
		font-weight: 600;
		color: var(--text);
		margin: 0 0 var(--space-6);
		letter-spacing: -0.02em;
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
		max-width: 420px;
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
	}
	.input {
		padding: 0.5rem 0.75rem;
		border: 1px solid var(--border-strong);
		border-radius: 10px;
		background: var(--bg-subtle);
		color: var(--text);
		font-size: var(--text-md);
		width: 100%;
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
	}
	.toggle-opt--active {
		background: var(--accent);
		color: #fff;
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
	.banner {
		padding: 0.625rem 0.875rem;
		border-radius: 10px;
		font-size: var(--text-sm);
		border: 1px solid;
	}
	.banner--ok {
		background: color-mix(in srgb, var(--status-ok) 8%, transparent);
		border-color: color-mix(in srgb, var(--status-ok) 25%, transparent);
		color: var(--status-ok);
	}
	.banner--err {
		background: color-mix(in srgb, var(--status-overdue) 8%, transparent);
		border-color: color-mix(in srgb, var(--status-overdue) 25%, transparent);
		color: var(--status-overdue);
	}
	.btn-secondary {
		align-self: flex-start;
		padding: 0.5rem 1rem;
		background: none;
		color: var(--text);
		border: 1px solid var(--border-strong);
		border-radius: 10px;
		font-size: var(--text-sm);
		font-weight: 500;
		cursor: pointer;
	}
	.btn-secondary:hover:not(:disabled) {
		background: var(--bg-muted);
	}

	/* User avatar button — mirrors .vehicle-avatar */
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

	/* Avatar popover — mirrors vehicle avatar popover */
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
	.dice-label {
		font-size: var(--text-xs);
		font-weight: 500;
		color: var(--text-muted);
		text-align: center;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		margin-bottom: 0.5rem;
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
