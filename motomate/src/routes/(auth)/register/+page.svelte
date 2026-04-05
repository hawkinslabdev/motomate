<script lang="ts">
	import { enhance } from '$app/forms';
	import { _ } from '$lib/i18n';
	let { form } = $props<{
		form: { error?: string; email?: string; fieldErrors?: Record<string, string> } | null;
	}>();

	let passwordValue = $state('');
	let confirmValue = $state('');
	let loading = $state(false);
	const mismatch = $derived(confirmValue.length > 0 && confirmValue !== passwordValue);
</script>

<svelte:head><title>{$_('auth.register.title')} &middot; MotoMate</title></svelte:head>

<div class="page-header">
	<h1 class="page-title">{$_('auth.register.title')}</h1>
	<p class="page-subtitle">{$_('auth.register.subtitle')}</p>
</div>

{#if form?.error}
	<div class="form-error">{form.error}</div>
{/if}

<form
	method="POST"
	use:enhance={({ formData }) => {
		formData.set('theme', localStorage.getItem('theme') ?? 'system');
		formData.set('locale', localStorage.getItem('locale') ?? 'en');
		loading = true;
		return async ({ update }) => {
			await update();
			loading = false;
		};
	}}
	class="auth-form"
>
	<label class="field">
		<span class="field-label">{$_('auth.register.email')}</span>
		<input
			name="email"
			type="email"
			autocomplete="email"
			value={form?.email ?? ''}
			required
			class="input"
			class:input--err={form?.fieldErrors?.email}
		/>
		{#if form?.fieldErrors?.email}
			<span class="field-err">{form.fieldErrors.email}</span>
		{/if}
	</label>
	<label class="field">
		<span class="field-label">{$_('auth.register.password')}</span>
		<input
			name="password"
			type="password"
			autocomplete="new-password"
			minlength="8"
			required
			class="input"
			class:input--err={form?.fieldErrors?.password}
			bind:value={passwordValue}
		/>
		{#if form?.fieldErrors?.password}
			<span class="field-err">{form.fieldErrors.password}</span>
		{:else}
			<span class="field-hint">{$_('auth.register.passwordHint')}</span>
		{/if}
	</label>
	<label class="field">
		<span class="field-label">{$_('auth.register.confirmPassword')}</span>
		<input
			name="confirm_password"
			type="password"
			autocomplete="new-password"
			minlength="8"
			required
			class="input"
			class:input--err={mismatch || !!form?.fieldErrors?.confirm_password}
			bind:value={confirmValue}
		/>
		{#if form?.fieldErrors?.confirm_password}
			<span class="field-err">{form.fieldErrors.confirm_password}</span>
		{:else if mismatch}
			<span class="field-err">{$_('auth.register.passwordMismatch')}</span>
		{/if}
	</label>
	<button type="submit" class="btn-primary" disabled={mismatch || loading}>
		{#if loading}<span class="spinner" aria-hidden="true"></span>{/if}
		{$_('auth.register.submit')}</button
	>
</form>

<p class="footer-link">
	{$_('auth.register.hasAccount')} <a href="/login">{$_('auth.register.login')}</a>
</p>

<style>
	.page-header {
		margin-bottom: var(--space-5);
	}
	.page-title {
		font-size: var(--text-xl);
		font-weight: 600;
		color: var(--text);
		margin: 0 0 0.25rem;
		letter-spacing: -0.01em;
	}
	.page-subtitle {
		font-size: var(--text-sm);
		color: var(--text-muted);
		margin: 0;
	}

	.auth-form {
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
	.field-hint {
		font-size: var(--text-xs);
		color: var(--text-subtle);
	}
	.field-err {
		font-size: var(--text-xs);
		color: var(--status-overdue);
	}

	.input {
		padding: 0.5rem 0.75rem;
		border: 1px solid var(--border-strong);
		border-radius: 10px;
		background: var(--bg-subtle);
		color: var(--text);
		font-size: var(--text-md);
		transition:
			border-color 150ms ease,
			outline 150ms ease;
	}
	.input:focus {
		outline: 2px solid var(--accent);
		outline-offset: 1px;
		border-color: transparent;
	}
	.input--err {
		border-color: var(--status-overdue);
	}

	.btn-primary {
		padding: 0.625rem 1rem;
		background: var(--accent);
		color: #fff;
		border: none;
		border-radius: 10px;
		font-weight: 500;
		cursor: pointer;
		font-size: var(--text-sm);
		transition:
			background 150ms ease,
			transform 50ms ease;
	}
	.btn-primary:hover {
		background: var(--accent-hover);
	}
	.btn-primary:active {
		transform: scale(0.98);
	}
	.btn-primary:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
	.btn-primary:disabled {
		opacity: 0.65;
		cursor: not-allowed;
		transform: none;
	}

	.form-error {
		padding: 0.625rem 0.875rem;
		background: color-mix(in srgb, var(--status-overdue) 8%, transparent);
		border: 1px solid color-mix(in srgb, var(--status-overdue) 25%, transparent);
		border-radius: 10px;
		font-size: var(--text-sm);
		color: var(--status-overdue);
		margin-bottom: 1rem;
	}

	.footer-link {
		margin-top: 1.25rem;
		font-size: var(--text-sm);
		text-align: center;
		color: var(--text-muted);
	}
	.footer-link a {
		color: var(--accent);
		text-decoration: none;
		transition: color 150ms ease;
	}
	.footer-link a:hover {
		text-decoration: underline;
	}
	.footer-link a:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}

	.btn-primary {
		display: inline-flex;
		align-items: center;
		justify-content: center;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
	.spinner {
		width: 0.875rem;
		height: 0.875rem;
		border: 2px solid rgba(255, 255, 255, 0.35);
		border-top-color: #fff;
		border-radius: 50%;
		animation: spin 0.65s linear infinite;
		flex-shrink: 0;
		margin-right: 0.375rem;
	}
	@media (prefers-reduced-motion: reduce) {
		.spinner {
			animation: none;
		}
	}
</style>
