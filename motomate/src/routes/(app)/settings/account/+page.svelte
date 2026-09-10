<script lang="ts">
	import { enhance } from '$app/forms';
	import type { User } from '$lib/db/schema.js';
	import { _ } from '$lib/i18n';
	import ConfirmDialog from '$lib/components/ui/ConfirmDialog.svelte';
	import { toasts } from '$lib/stores/toasts.svelte.js';

	let { data, form } = $props<{
		data: {
			user: User;
			hasPassword: boolean;
			reauthActive: boolean;
			stepUpProvider: string | null;
			reauthFailed: boolean;
		};
		form?: { deleteError?: string } | null;
	}>();

	const needsProof = $derived(!data.hasPassword && !data.reauthActive);
	const stepUpHref = $derived(
		`/oidc/login?reauth=1&return=${encodeURIComponent('/settings/account')}`
	);

	let deleteForm = $state<HTMLFormElement | null>(null);
	let savingEmail = $state(false);
	let savingPassword = $state(false);
	let showDeleteDialog = $state(false);
	let deleteLoading = $state(false);

	$effect(() => {
		if (form?.deleteError) {
			deleteLoading = false;
			toasts.error(form.deleteError);
		}
	});

	let exportOpen = $state(false);
	let exportLoading = $state<'json' | 'zip' | null>(null);

	async function triggerExport(format: 'json' | 'zip') {
		exportOpen = false;
		exportLoading = format;
		try {
			const res = await fetch(`/api/export?format=${format}`);
			if (!res.ok) return;
			const blob = await res.blob();
			const filename =
				res.headers.get('Content-Disposition')?.match(/filename="(.+)"/)?.[1] ??
				`motomate-export.${format}`;
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = filename;
			a.click();
			URL.revokeObjectURL(url);
		} finally {
			exportLoading = null;
		}
	}
</script>

{#snippet currentPassword(extraClass = '')}
	<div class="field {extraClass}">
		<label class="field">
			<span class="field-label">{$_('settings.account.password.current')}</span>
			<input
				name="current_password"
				type="password"
				autocomplete="current-password"
				placeholder={$_('settings.account.password.current')}
				class="input"
				required
			/>
		</label>
		{#if data.stepUpProvider}
			<a class="stepup-link" href={stepUpHref} data-sveltekit-reload>
				{$_('settings.account.reauth.verify', { values: { provider: data.stepUpProvider } })}
			</a>
		{/if}
	</div>
{/snippet}

{#snippet proofNotice()}
	{#if needsProof}
		<div class="proof">
			{#if data.reauthFailed}
				<p class="proof-failed">{$_('settings.account.reauth.failed')}</p>
			{/if}
			{#if data.stepUpProvider}
				<p class="proof-text">
					{$_('settings.account.reauth.hintProvider', {
						values: { provider: data.stepUpProvider }
					})}
				</p>
				<a class="btn-secondary" href={stepUpHref} data-sveltekit-reload>
					{$_('settings.account.reauth.verify', { values: { provider: data.stepUpProvider } })}
				</a>
			{:else}
				<p class="proof-text">{$_('settings.account.reauth.hintMagic')}</p>
			{/if}
		</div>
	{:else if data.reauthActive}
		<p class="proof-active">{$_('settings.account.reauth.active')}</p>
	{/if}
{/snippet}

<svelte:head><title>{$_('settings.account.title')} · Settings</title></svelte:head>

<div class="intro">
	<h2 class="section-title">{$_('settings.account.title')}</h2>
	<p class="section-desc">{$_('settings.account.subtitle')}</p>
</div>

{@render proofNotice()}

<!-- Email -->
<section class="setting-section">
	<h3 class="sub-title">{$_('settings.account.email.title')}</h3>
	<p class="sub-desc">
		{$_('settings.account.email.current', { values: { email: data.user.email } })}
	</p>

	<form
		method="POST"
		action="?/changeEmail"
		class="pref-form"
		use:enhance={() => {
			savingEmail = true;
			return async ({ result, update }) => {
				await update();
				savingEmail = false;
				if (result.type === 'success') toasts.success($_('settings.account.email.saved'));
				else if (result.type === 'failure') toasts.error(String(result.data?.emailError ?? ''));
			};
		}}
	>
		<label class="field">
			<span class="field-label">{$_('settings.account.email.new')}</span>
			<input
				name="email"
				type="email"
				autocomplete="email"
				placeholder="example@email.com"
				class="input"
				required
			/>
		</label>
		{#if data.hasPassword && !data.reauthActive}
			{@render currentPassword()}
		{/if}
		<button type="submit" class="btn-secondary" disabled={savingEmail || needsProof}>
			{savingEmail ? $_('settings.profile.saving') : $_('settings.account.email.submit')}
		</button>
	</form>
</section>

{#if data.hasPassword || data.reauthActive}
	<div class="divider"></div>

	<section class="setting-section">
		<h3 class="sub-title">{$_('settings.account.password.title')}</h3>
		{#if !data.hasPassword}
			<p class="sub-desc">{$_('settings.account.password.setupHint')}</p>
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
					if (result.type === 'success') {
						formElement.reset();
						toasts.success($_('settings.account.password.saved'));
					} else if (result.type === 'failure') {
						toasts.error(String(result.data?.passwordError ?? ''));
					}
				};
			}}
		>
			{#if data.hasPassword && !data.reauthActive}
				{@render currentPassword()}
			{/if}
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
					placeholder={$_('settings.account.password.hint')}
					class="input"
					required
				/>
			</label>
			<button type="submit" class="btn-secondary" disabled={savingPassword}>
				{savingPassword
					? $_('settings.profile.saving')
					: data.hasPassword
						? $_('settings.account.password.submit')
						: $_('settings.account.password.setSubmit')}
			</button>
		</form>
	</section>
{/if}

<div class="divider"></div>

<!-- Export data -->
<section class="setting-section">
	<h3 class="sub-title">{$_('settings.account.export.title')}</h3>
	<p class="sub-desc">{$_('settings.account.export.desc')}</p>
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="export-wrap"
		onfocusout={(e) => {
			if (!e.currentTarget.contains(e.relatedTarget as Node)) exportOpen = false;
		}}
	>
		<button
			type="button"
			class="btn-secondary export-trigger"
			disabled={exportLoading !== null}
			onclick={() => (exportOpen = !exportOpen)}
			aria-haspopup="true"
			aria-expanded={exportOpen}
		>
			{exportLoading !== null ? $_('common.loading') : $_('settings.account.export.btn')}
			{#if exportLoading === null}
				<svg
					class="caret"
					class:caret--open={exportOpen}
					viewBox="0 0 12 12"
					fill="currentColor"
					aria-hidden="true"
				>
					<path d="M6 8L1 3h10z" />
				</svg>
			{/if}
		</button>
		{#if exportOpen}
			<div class="export-menu" role="menu">
				<button
					type="button"
					class="export-option"
					role="menuitem"
					onclick={() => triggerExport('json')}
				>
					<span class="export-option-label">{$_('settings.account.export.json')}</span>
					<span class="export-option-hint">{$_('settings.account.export.jsonHint')}</span>
				</button>
				<button
					type="button"
					class="export-option"
					role="menuitem"
					onclick={() => triggerExport('zip')}
				>
					<span class="export-option-label">{$_('settings.account.export.zip')}</span>
					<span class="export-option-hint">{$_('settings.account.export.zipHint')}</span>
				</button>
			</div>
		{/if}
	</div>
</section>

<div class="divider"></div>

<!-- Danger zone -->
<section class="setting-section">
	<h3 class="section-label section-label--danger">{$_('settings.account.dangerZone')}</h3>
	<form method="POST" action="?/deleteAccount" class="danger-box" bind:this={deleteForm}>
		<div>
			<div class="danger-title">{$_('settings.account.delete.title')}</div>
			<div class="danger-desc">{$_('settings.account.delete.desc')}</div>
			{#if data.hasPassword && !data.reauthActive}
				{@render currentPassword('danger-field')}
			{/if}
		</div>
		<button
			type="button"
			class="btn-danger"
			disabled={needsProof}
			onclick={() => {
				if (deleteForm?.reportValidity()) showDeleteDialog = true;
			}}
		>
			{$_('settings.account.delete.btn')}
		</button>
	</form>
</section>

<ConfirmDialog
	open={showDeleteDialog}
	title={$_('settings.account.delete.dialog.title')}
	description={$_('settings.account.delete.dialog.desc')}
	confirmLabel={$_('settings.account.delete.dialog.confirm')}
	cancelLabel={$_('settings.account.delete.dialog.cancel')}
	danger={true}
	loading={deleteLoading}
	onconfirm={() => {
		if (!deleteForm?.reportValidity()) {
			showDeleteDialog = false;
			return;
		}
		deleteLoading = true;
		deleteForm.requestSubmit();
	}}
	onclose={() => (showDeleteDialog = false)}
/>

<style>
	.section-title {
		font-size: var(--text-2xl);
		font-weight: 600;
		color: var(--text);
		margin: 0 0 var(--space-2);
		letter-spacing: -0.02em;
	}
	.intro {
		margin-bottom: var(--space-5);
	}
	.section-desc {
		font-size: var(--text-sm);
		color: var(--text-muted);
		line-height: var(--leading-base);
		margin: 0;
	}
	.sub-title {
		font-size: var(--text-lg);
		font-weight: 600;
		color: var(--text);
		margin: 0 0 0.25rem;
	}
	.sub-desc {
		font-size: var(--text-sm);
		color: var(--text-muted);
		margin: 0 0 var(--space-4);
	}
	.setting-section {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}
	.divider {
		border: none;
		border-top: 1px solid var(--border);
		margin: var(--space-6) 0;
	}
	.pref-form {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		max-width: 360px;
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
		border: 1px solid var(--border);
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
	.section-label {
		font-size: var(--text-xs);
		font-weight: 600;
		color: var(--text-muted);
		text-transform: uppercase;
		letter-spacing: 0.07em;
		margin: 0 0 var(--space-4);
	}
	.section-label--danger {
		color: var(--status-overdue);
	}
	.danger-box {
		border: 1px solid color-mix(in srgb, var(--status-overdue) 25%, transparent);
		border-radius: 10px;
		padding: var(--space-4);
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: var(--space-4);
	}
	.proof {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: var(--space-3);
		padding: var(--space-4);
		margin-bottom: var(--space-4);
		border-left: 3px solid var(--status-due);
		background: color-mix(in srgb, var(--status-due) 6%, var(--bg));
		border-radius: 0 8px 8px 0;
	}
	.proof-text {
		margin: 0;
		font-size: var(--text-sm);
		line-height: var(--leading-base);
		color: var(--text);
	}
	.proof-failed {
		margin: 0;
		font-size: var(--text-sm);
		font-weight: 500;
		color: var(--status-overdue);
	}
	.proof-active {
		margin: 0 0 var(--space-4);
		font-size: var(--text-sm);
		color: var(--text-muted);
	}
	.stepup-link {
		align-self: flex-start;
		font-size: var(--text-sm);
		color: var(--accent);
		text-decoration: none;
	}
	.stepup-link:hover {
		text-decoration: underline;
	}
	.danger-field {
		margin-top: var(--space-3);
		max-width: 20rem;
	}
	.danger-title {
		font-size: var(--text-sm);
		font-weight: 500;
		color: var(--text);
	}
	.danger-desc {
		font-size: var(--text-sm);
		color: var(--text-muted);
		margin-top: var(--space-1);
	}
	.btn-danger {
		padding: 0.75rem 1rem;
		background: none;
		border: 1px solid var(--status-overdue);
		color: var(--status-overdue);
		border-radius: 10px;
		font-size: var(--text-sm);
		font-weight: 500;
		cursor: pointer;
		white-space: nowrap;
		min-height: 48px;
	}
	.btn-danger:hover {
		background: color-mix(in srgb, var(--status-overdue) 8%, transparent);
	}

	/* Export dropdown */
	.export-wrap {
		position: relative;
		display: inline-block;
	}
	.export-trigger {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}
	.caret {
		width: 10px;
		height: 10px;
		opacity: 0.5;
		transition: transform 0.15s ease;
		flex-shrink: 0;
	}
	.caret--open {
		transform: rotate(180deg);
	}
	.export-menu {
		position: absolute;
		top: calc(100% + 4px);
		left: 0;
		z-index: 50;
		background: var(--bg);
		border: 1px solid var(--border-strong);
		border-radius: 10px;
		overflow: hidden;
		min-width: 220px;
		box-shadow: 0 4px 16px color-mix(in srgb, var(--text) 8%, transparent);
	}
	.export-option {
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
		width: 100%;
		padding: 0.625rem 1rem;
		text-align: left;
		background: none;
		border: none;
		cursor: pointer;
		transition: background 0.1s;
	}
	.export-option:hover {
		background: var(--bg-muted);
	}
	.export-option + .export-option {
		border-top: 1px solid var(--border);
	}
	.export-option-label {
		font-size: var(--text-sm);
		font-weight: 500;
		color: var(--text);
	}
	.export-option-hint {
		font-size: var(--text-xs);
		color: var(--text-subtle);
	}
	@media (max-width: 640px) {
		.pref-form {
			max-width: 100%;
		}
		.danger-box {
			width: 100%;
		}
	}
</style>
