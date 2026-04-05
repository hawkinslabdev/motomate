<script lang="ts">
	import { enhance } from '$app/forms';
	import { _ } from '$lib/i18n';

	let { data, form } = $props<{
		data: Record<string, never>;
		form: {
			error?: string;
			email?: string;
			magic?: boolean;
			fieldErrors?: Record<string, string>;
		} | null;
	}>();

	let mode = $state<'password' | 'magic'>('password');
	let remember = $state(true);
	let loading = $state(false);

	// Persist remember preference
	$effect(() => {
		if (typeof window !== 'undefined') {
			const stored = localStorage.getItem('remember');
			if (stored !== null) remember = stored === 'true';
		}
	});
</script>

<svelte:head><title>Log in &middot; MotoMate</title></svelte:head>

<div class="page-header">
	<h1 class="page-title">{$_('auth.login.title')}</h1>
	<p class="page-subtitle">{$_('auth.login.subtitle')}</p>
</div>

{#if form?.magic}
	<div class="notice">{$_('auth.login.magicLinkSent')}</div>
{:else}
	{#if form?.error}
		<div class="form-error">{form.error}</div>
	{/if}

	<div class="mode-tabs">
		<button
			type="button"
			class="mode-btn"
			class:mode-btn--active={mode === 'password'}
			onclick={() => (mode = 'password')}>{$_('auth.login.tabs.password')}</button
		>
		<button
			type="button"
			class="mode-btn"
			class:mode-btn--active={mode === 'magic'}
			onclick={() => (mode = 'magic')}>{$_('auth.login.tabs.magicLink')}</button
		>
	</div>

	{#if mode === 'password'}
		<form
			method="POST"
			action="?/login"
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
				<span class="field-label select-none">{$_('auth.login.email')}</span>
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
				<span class="field-label select-none">{$_('auth.login.password')}</span>
				<input
					name="password"
					type="password"
					autocomplete="current-password"
					required
					class="input"
					class:input--err={form?.fieldErrors?.password}
				/>
				{#if form?.fieldErrors?.password}
					<span class="field-err">{form.fieldErrors.password}</span>
				{/if}
			</label>
			<div class="form-row">
				<label class="checkbox-label select-none">
					<input
						type="checkbox"
						name="remember"
						value="on"
						class="checkbox"
						checked={remember}
						onchange={(e) => {
							remember = e.currentTarget.checked;
							localStorage.setItem('remember', String(remember));
						}}
					/>
					<span>{$_('auth.login.rememberMe')}</span>
				</label>
				<button type="button" class="link-btn" onclick={() => (mode = 'magic')}
					>{$_('auth.login.forgotPassword')}</button
				>
			</div>
			<button type="submit" class="btn-primary" disabled={loading}>
				{#if loading}<span class="spinner" aria-hidden="true"></span>{/if}
				{$_('auth.login.submit')}
			</button>
		</form>
	{:else}
		<form
			method="POST"
			action="?/magic"
			use:enhance={() => {
				loading = true;
				return async ({ update }) => {
					await update();
					loading = false;
				};
			}}
			class="auth-form"
		>
			<label class="field">
				<span class="field-label">{$_('auth.login.email')}</span>
				<input name="email" type="email" autocomplete="email" required class="input" />
			</label>
			<button type="submit" class="btn-primary" disabled={loading}>
				{#if loading}<span class="spinner" aria-hidden="true"></span>{/if}
				{$_('auth.login.magicSubmit')}
			</button>
		</form>
	{/if}

	<p class="footer-link">
		{$_('auth.login.noAccount')} <a href="/register">{$_('auth.login.signUp')}</a>
	</p>
{/if}

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
	.input--err {
		border-color: var(--status-overdue);
	}
	.field-err {
		font-size: var(--text-xs);
		color: var(--status-overdue);
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
			background 0.15s cubic-bezier(0.25, 1, 0.5, 1),
			transform 0.12s cubic-bezier(0.25, 1, 0.5, 1);
	}
	.btn-primary:hover {
		background: var(--accent-hover);
		transform: translateY(-1px);
	}
	.btn-primary:active {
		transform: scale(0.97);
		transition-duration: 0.06s;
	}
	.btn-primary:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
	@media (prefers-reduced-motion: reduce) {
		.btn-primary:hover,
		.btn-primary:active {
			transform: none;
		}
	}

	.notice {
		padding: 0.625rem 0.875rem;
		background: color-mix(in srgb, var(--status-ok) 8%, transparent);
		border: 1px solid color-mix(in srgb, var(--status-ok) 25%, transparent);
		border-radius: 10px;
		font-size: var(--text-sm);
		color: var(--status-ok);
	}

	.mode-tabs {
		display: flex;
		border: 1px solid var(--border);
		border-radius: 10px;
		overflow: hidden;
		margin-bottom: 1.25rem;
	}
	.mode-btn {
		flex: 1;
		padding: 0.5rem;
		background: var(--bg-subtle);
		border: none;
		cursor: pointer;
		font-size: var(--text-sm);
		color: var(--text-muted);
		transition:
			background 150ms cubic-bezier(0.25, 1, 0.5, 1),
			color 150ms cubic-bezier(0.25, 1, 0.5, 1),
			transform 0.1s cubic-bezier(0.25, 1, 0.5, 1);
	}
	.mode-btn:hover {
		background: var(--bg-muted);
	}
	.mode-btn:active {
		transform: scale(0.97);
		transition-duration: 0.06s;
	}
	.mode-btn:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: -2px;
	}
	@media (prefers-reduced-motion: reduce) {
		.mode-btn {
			transition:
				background 150ms,
				color 150ms;
		}
		.mode-btn:active {
			transform: none;
		}
	}
	.mode-btn--active {
		background: var(--bg);
		color: var(--text);
		font-weight: 500;
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
	.form-error {
		padding: 0.625rem 0.875rem;
		background: color-mix(in srgb, var(--status-overdue) 8%, transparent);
		border: 1px solid color-mix(in srgb, var(--status-overdue) 25%, transparent);
		border-radius: 10px;
		font-size: var(--text-sm);
		color: var(--status-overdue);
		margin-bottom: 1rem;
	}

	.form-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin: -0.25rem 0 0.5rem;
	}
	.checkbox-label {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: var(--text-sm);
		color: var(--text-muted);
		cursor: pointer;
	}
	.checkbox {
		width: 1rem;
		height: 1rem;
		accent-color: var(--accent);
	}
	.link-btn {
		background: none;
		border: none;
		padding: 0;
		font-size: var(--text-sm);
		color: var(--text-muted);
		cursor: pointer;
		text-decoration: none;
		transition: color 150ms ease;
	}
	.link-btn:hover {
		color: var(--accent);
	}
	.link-btn:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}

	.btn-primary {
		display: inline-flex;
		align-items: center;
		justify-content: center;
	}
	.btn-primary:disabled {
		opacity: 0.65;
		cursor: not-allowed;
		transform: none;
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
