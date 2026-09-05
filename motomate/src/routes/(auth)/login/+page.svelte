<script lang="ts">
	import { enhance } from '$app/forms';
	import { getContext, onMount, untrack } from 'svelte';
	import { browser } from '$app/environment';
	import { _ } from '$lib/i18n';

	const altchaCtx = getContext<{ locale: string }>('altcha-locale');

	let { data, form } = $props<{
		data: {
			registrationEnabled: boolean;
			demoMode?: boolean;
			smtpEnabled: boolean;
			altchaEnabled: boolean;
			initialMode: 'password' | 'magic';
			oidcName: string | null;
		};
		form: {
			error?: string;
			email?: string;
			magic?: boolean;
			fieldErrors?: Record<string, string>;
		} | null;
	}>();

	let mode = $state<'password' | 'magic'>(untrack(() => data.initialMode));
	let remember = $state(true);
	let emailValue = $state('');
	let loading = $state(false);
	let showPassword = $state(false);
	let altchaReady = $state(false);
	let altchaVerified = $state(false);
	onMount(() => {
		const storedRemember = localStorage.getItem('remember');
		if (storedRemember !== null) remember = storedRemember === 'true';

		if (remember && !emailValue) {
			const storedEmail = localStorage.getItem('remembered_email');
			if (storedEmail) emailValue = storedEmail;
		}
	});
</script>

<svelte:head><title>Log in &middot; MotoMate</title></svelte:head>

<div class="page-header">
	<h1 class="page-title">{$_('auth.login.title')}</h1>
	<p class="page-subtitle">{$_('auth.login.subtitle')}</p>
</div>

{#if form?.magic}
	<div class="notice">
		<svg
			class="notice-icon"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="1.75"
			stroke-linecap="round"
			stroke-linejoin="round"
			aria-hidden="true"
		>
			<rect width="20" height="16" x="2" y="4" rx="2" />
			<path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
		</svg>
		<div class="notice-content">
			<p class="notice-text">{$_('auth.login.magicLinkSent')}</p>
			<a href="?" class="back-link">{$_('common.back')}</a>
		</div>
	</div>
{:else}
	{#if form?.error}
		<div class="form-error" role="alert">{form.error}</div>
	{/if}

	{#if !data.demoMode && data.smtpEnabled}
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
	{/if}

	{#if mode === 'password'}
		<form
			method="POST"
			action="?/login"
			use:enhance={({ formData }) => {
				formData.set('theme', localStorage.getItem('theme') ?? 'system');
				formData.set('locale', localStorage.getItem('locale') ?? 'en');
				if (remember) {
					localStorage.setItem('remembered_email', emailValue);
				} else {
					localStorage.removeItem('remembered_email');
				}
				loading = true;
				return async ({ update }) => {
					await update({ reset: false });
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
					bind:value={emailValue}
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
				<div class="input-wrap">
					<input
						name="password"
						type={showPassword ? 'text' : 'password'}
						autocomplete="current-password"
						required
						class="input"
						class:input--err={form?.fieldErrors?.password}
					/>
					<button
						type="button"
						class="input-suffix-btn"
						aria-label={showPassword
							? $_('auth.login.hidePassword')
							: $_('auth.login.showPassword')}
						aria-pressed={showPassword}
						onclick={() => (showPassword = !showPassword)}
					>
						{#if showPassword}
							<svg
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="1.75"
								stroke-linecap="round"
								stroke-linejoin="round"
								aria-hidden="true"
							>
								<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
								<circle cx="12" cy="12" r="3" />
							</svg>
						{:else}
							<svg
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="1.75"
								stroke-linecap="round"
								stroke-linejoin="round"
								aria-hidden="true"
							>
								<path
									d="M9.9 4.24A9.94 9.94 0 0 1 12 4c6.5 0 10 7 10 7a17.6 17.6 0 0 1-2.94 3.94M6.5 6.5C3.6 8.28 2 12 2 12s3.5 7 10 7a9.9 9.9 0 0 0 4.15-.9M9.9 14.1a3 3 0 1 0 4.2-4.2"
								/>
								<path d="M2 2l20 20" />
							</svg>
						{/if}
					</button>
				</div>
				{#if form?.fieldErrors?.password}
					<span class="field-err">{form.fieldErrors.password}</span>
				{/if}
			</label>
			<div class="form-row">
				<label class="toggle-label select-none">
					<input
						type="checkbox"
						name="remember"
						value="on"
						class="toggle-input"
						bind:checked={remember}
						onchange={() => {
							localStorage.setItem('remember', String(remember));
						}}
					/>
					<span class="toggle-track" aria-hidden="true">
						<span class="toggle-thumb"></span>
					</span>
					<span>{$_('auth.login.rememberMe')}</span>
				</label>
				{#if !data.demoMode && data.smtpEnabled}
					<button type="button" class="link-btn" onclick={() => (mode = 'magic')}
						>{$_('auth.login.forgotPassword')}</button
					>
				{/if}
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
			novalidate
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
				<input
					name="email"
					type="email"
					autocomplete="email"
					bind:value={emailValue}
					required
					class="input"
				/>
			</label>
			{#if data.altchaEnabled}
				{#if browser}
					<div class="altcha-wrap">
						{#if !altchaReady}
							<div class="altcha-skeleton" aria-hidden="true"></div>
						{/if}
						<altcha-widget
							challenge="/api/altcha"
							language={altchaCtx?.locale}
							style={altchaReady ? '' : 'position:absolute;opacity:0;pointer-events:none'}
							onload={() => (altchaReady = true)}
							onstatechange={(e) => (altchaVerified = e.detail.state === 'verified')}
						></altcha-widget>
					</div>
				{:else}
					<div class="altcha-skeleton" aria-hidden="true"></div>
				{/if}
			{/if}
			<button type="submit" class="btn-primary" disabled={loading || !altchaVerified}>
				{#if loading}<span class="spinner" aria-hidden="true"></span>{/if}
				{$_('auth.login.magicSubmit')}
			</button>
		</form>
	{/if}

	{#if data.oidcName}
		<div class="oidc-divider"><span>{$_('auth.login.orSignInWith')}</span></div>
		<a href="/oidc/login" class="btn-oidc">
			<svg
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="1.75"
				stroke-linecap="round"
				stroke-linejoin="round"
				aria-hidden="true"
			>
				<circle cx="8" cy="15" r="4" />
				<path d="M10.5 12.5 19 4M17 6l2 2M14 9l2 2" />
			</svg>
			{data.oidcName}
		</a>
	{/if}

	{#if data.registrationEnabled && !data.demoMode}
		<p class="footer-link">
			{$_('auth.login.noAccount')} <a href="/register">{$_('auth.login.signUp')}</a>
		</p>
	{/if}
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
	.input-wrap {
		position: relative;
		display: flex;
	}
	.input-wrap .input {
		padding-right: 2.5rem;
	}
	.input-suffix-btn {
		position: absolute;
		top: 0;
		right: 0;
		bottom: 0;
		width: 2.5rem;
		display: flex;
		align-items: center;
		justify-content: center;
		background: none;
		border: none;
		padding: 0;
		color: var(--text-subtle);
		cursor: pointer;
		transition: color 150ms ease;
	}
	.input-suffix-btn svg {
		width: 18px;
		height: 18px;
	}
	.input-suffix-btn:hover {
		color: var(--text-muted);
	}
	.input-suffix-btn:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: -2px;
		border-radius: 6px;
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
		display: flex;
		align-items: flex-start;
		gap: 0.75rem;
		padding: 1rem 1.125rem;
		background: var(--bg-muted);
		border: 1px solid var(--border);
		border-radius: 10px;
	}
	.notice-icon {
		width: 18px;
		height: 18px;
		color: var(--text-subtle);
		flex-shrink: 0;
		margin-top: 0.1rem;
	}
	.notice-text {
		font-size: var(--text-sm);
		color: var(--text-muted);
		line-height: var(--leading-base);
		margin: 0;
	}

	.notice-content {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.back-link {
		font-size: var(--text-sm);
		color: var(--accent);
		text-decoration: none;
		font-weight: 500;
		width: max-content;
	}

	.back-link:hover {
		text-decoration: underline;
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

	.oidc-divider {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		margin: 1.25rem 0 1rem;
		font-size: var(--text-xs);
		color: var(--text-subtle);
	}
	.oidc-divider::before,
	.oidc-divider::after {
		content: '';
		flex: 1;
		height: 1px;
		background: var(--border);
	}
	.btn-oidc {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		padding: 0.625rem 1rem;
		border: 1px solid var(--border-strong);
		border-radius: 10px;
		background: var(--bg-subtle);
		color: var(--text);
		font-size: var(--text-sm);
		font-weight: 500;
		text-decoration: none;
		transition:
			background 150ms cubic-bezier(0.25, 1, 0.5, 1),
			transform 0.12s cubic-bezier(0.25, 1, 0.5, 1);
	}
	.btn-oidc svg {
		width: 17px;
		height: 17px;
		color: var(--text-muted);
		flex-shrink: 0;
	}
	.btn-oidc:hover {
		background: var(--bg-muted);
		transform: translateY(-1px);
	}
	.btn-oidc:active {
		transform: scale(0.97);
		transition-duration: 0.06s;
	}
	.btn-oidc:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
	@media (prefers-reduced-motion: reduce) {
		.btn-oidc:hover,
		.btn-oidc:active {
			transform: none;
		}
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
	.toggle-label {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: var(--text-sm);
		color: var(--text-muted);
		cursor: pointer;
	}
	.toggle-input {
		position: absolute;
		opacity: 0;
		width: 0;
		height: 0;
	}
	.toggle-track {
		position: relative;
		display: inline-flex;
		align-items: center;
		width: 2rem;
		height: 1.125rem;
		background: var(--border-strong);
		border-radius: 9999px;
		transition: background 0.18s ease;
		flex-shrink: 0;
	}
	.toggle-input:checked ~ .toggle-track {
		background: var(--accent);
	}
	.toggle-input:focus-visible ~ .toggle-track {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
	.toggle-thumb {
		position: absolute;
		left: 2px;
		width: 0.875rem;
		height: 0.875rem;
		background: white;
		border-radius: 50%;
		transition: transform 0.18s ease;
		box-shadow: 0 1px 2px rgba(0, 0, 0, 0.15);
	}
	.toggle-input:checked ~ .toggle-track .toggle-thumb {
		transform: translateX(0.875rem);
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
