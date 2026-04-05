<script lang="ts">
	import { enhance } from '$app/forms';
	import type { User } from '$lib/db/schema.js';
	import { _ } from '$lib/i18n';

	let { data, form } = $props<{
		data: { user: User };
		form: {
			savedEmail?: boolean;
			savedPassword?: boolean;
			emailError?: string;
			passwordError?: string;
		} | null;
	}>();

	let savingEmail = $state(false);
	let savingPassword = $state(false);
</script>

<svelte:head><title>{$_('settings.account.title')} · Settings</title></svelte:head>

<h2 class="section-title">{$_('settings.account.title')}</h2>

<!-- ── Email ── -->
<section class="setting-section">
	<h3 class="sub-title">{$_('settings.account.email.title')}</h3>
	<p class="section-desc">
		{$_('settings.account.email.current', { values: { email: data.user.email } })}
	</p>

	{#if form?.savedEmail}
		<div class="banner banner--ok">{$_('settings.account.email.saved')}</div>
	{/if}
	{#if form?.emailError}
		<div class="banner banner--err">{form.emailError}</div>
	{/if}

	<form
		method="POST"
		action="?/changeEmail"
		class="pref-form"
		use:enhance={() => {
			savingEmail = true;
			return async ({ update }) => {
				await update();
				savingEmail = false;
			};
		}}
	>
		<label class="field">
			<span class="field-label">{$_('settings.account.email.new')}</span>
			<input
				name="email"
				type="email"
				autocomplete="email"
				placeholder="you@example.com"
				class="input"
				required
			/>
		</label>
		<button type="submit" class="btn-secondary" disabled={savingEmail}>
			{savingEmail ? $_('settings.profile.saving') : $_('settings.account.email.submit')}
		</button>
	</form>
</section>

<div class="divider"></div>

<!-- ── Password ── -->
<section class="setting-section">
	<h3 class="sub-title">{$_('settings.account.password.title')}</h3>

	{#if form?.savedPassword}
		<div class="banner banner--ok">{$_('settings.account.password.saved')}</div>
	{/if}
	{#if form?.passwordError}
		<div class="banner banner--err">{form.passwordError}</div>
	{/if}

	<form
		method="POST"
		action="?/changePassword"
		class="pref-form"
		use:enhance={({ formElement }) => {
			savingPassword = true;
			return async ({ result, update }) => {
				await update();
				savingPassword = false;
				if (result.type === 'success') formElement.reset();
			};
		}}
	>
		<label class="field">
			<span class="field-label">{$_('settings.account.password.current')}</span>
			<input
				name="current_password"
				type="password"
				autocomplete="current-password"
				class="input"
				required
			/>
		</label>
		<label class="field">
			<span class="field-label">{$_('settings.account.password.new')}</span>
			<input
				name="new_password"
				type="password"
				autocomplete="new-password"
				placeholder={$_('settings.account.password.hint')}
				minlength="8"
				class="input"
				required
			/>
		</label>
		<label class="field">
			<span class="field-label">{$_('settings.account.password.confirm')}</span>
			<input
				name="confirm_password"
				type="password"
				autocomplete="new-password"
				class="input"
				required
			/>
		</label>
		<button type="submit" class="btn-secondary" disabled={savingPassword}>
			{savingPassword ? $_('settings.profile.saving') : $_('settings.account.password.submit')}
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
	.section-desc {
		font-size: var(--text-sm);
		color: var(--text-muted);
		margin: 0 0 1rem;
	}
	.setting-section {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		max-width: 420px;
	}
	.divider {
		border: none;
		border-top: 1px solid var(--border);
		margin: var(--space-6) 0;
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
