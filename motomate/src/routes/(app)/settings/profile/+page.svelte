<script lang="ts">
	import { enhance } from '$app/forms';
	import type { User } from '$lib/db/schema.js';
	import { _ } from '$lib/i18n';

	let { data, form } = $props<{
		data: { user: User };
		form: { savedPrefs?: boolean; error?: string } | null;
	}>();

	let saving = $state(false);
</script>

<svelte:head><title>{$_('settings.profile.title')} &middot; Settings</title></svelte:head>

<h2 class="section-title">{$_('settings.profile.title')}</h2>

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
		margin: 0 0 0.25rem;
	}
	.setting-section {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		max-width: 420px;
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
</style>
