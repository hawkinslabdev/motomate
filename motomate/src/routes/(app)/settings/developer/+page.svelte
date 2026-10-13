<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { _ } from '$lib/i18n';
	import { formatDateShort } from '$lib/utils/format.js';
	import type { ApiKey } from '$lib/db/schema.js';
	import { toasts } from '$lib/stores/toasts.svelte.js';

	let { data, form } = $props<{
		data: { keys: Omit<ApiKey, 'key_hash'>[]; locale: string };
		form: {
			created?: boolean;
			revoked?: boolean;
			rotated?: boolean;
			deleted?: boolean;
			restored?: boolean;
			newToken?: string;
			error?: string;
			errorKey?: string;
		} | null;
	}>();

	let creating = $state(false);
	let newToken = $state<string | null>(null);
	let copied = $state(false);
	let confirmingRevoke = $state<string | null>(null);
	let confirmingRotate = $state<string | null>(null);
	let confirmingDelete = $state<string | null>(null);

	$effect(() => {
		if (form?.errorKey) toasts.error($_(form.errorKey));
		else if (form?.error) toasts.error(form.error);
		if (form?.newToken) {
			newToken = form.newToken;
			copied = false;
		}
		if (form?.revoked || form?.rotated || form?.deleted || form?.restored) {
			confirmingRevoke = null;
			confirmingRotate = null;
			confirmingDelete = null;
		}
	});

	function dismissToken() {
		newToken = null;
		copied = false;
	}

	async function copyToken() {
		if (!newToken) return;
		if (navigator.clipboard?.writeText) {
			await navigator.clipboard.writeText(newToken);
		} else {
			const el = document.getElementById('token-display') as HTMLInputElement | null;
			el?.select();
			document.execCommand('copy');
		}
		copied = true;
	}

	function keyStatus(key: Omit<ApiKey, 'key_hash'>): 'revoked' | 'expired' | 'due' | 'ok' {
		if (key.revoked_at) return 'revoked';
		if (!key.expires_at) return 'ok';
		const diff = new Date(key.expires_at + 'T00:00:00').getTime() - Date.now();
		if (diff < 0) return 'expired';
		if (diff < 14 * 86_400_000) return 'due';
		return 'ok';
	}

	function expiryLabel(key: Omit<ApiKey, 'key_hash'>): string {
		const status = keyStatus(key);
		if (status === 'revoked') return $_('settings.developer.apiKeys.revoked');
		if (!key.expires_at) return $_('settings.developer.apiKeys.neverExpires');
		if (status === 'expired') return $_('settings.developer.apiKeys.expired');
		if (status === 'due') return $_('settings.developer.apiKeys.expiringSoon');
		return formatDateShort(key.expires_at, data.locale);
	}

	function lastUsedLabel(key: Omit<ApiKey, 'key_hash'>): string {
		if (!key.last_used_at) return $_('settings.developer.apiKeys.neverUsed');
		return formatDateShort(key.last_used_at.slice(0, 10), data.locale);
	}

	function keyMetaLine(key: Omit<ApiKey, 'key_hash'>): string {
		return `${expiryLabel(key)} · ${$_('settings.developer.apiKeys.lastUsed')} ${lastUsedLabel(key)}`;
	}

	const activeKeys = $derived(data.keys.filter((k: Omit<ApiKey, 'key_hash'>) => !k.revoked_at));
</script>

<svelte:head><title>{$_('settings.developer.title')} · Settings</title></svelte:head>

<div class="intro">
	<h2 class="section-title">{$_('settings.developer.title')}</h2>
	<p class="section-desc">{$_('settings.developer.subtitle')}</p>
</div>

<section class="setting-section">
	<h3 class="sub-title">{$_('settings.developer.apiKeys.title')}</h3>
	<p class="desc">{$_('settings.developer.apiKeys.description')}</p>

	{#if data.keys.length > 0}
		<div class="key-list">
			{#each data.keys as key (key.id)}
				{@const status = keyStatus(key)}
				<div
					class="key-entry"
					class:key-entry--due={status === 'due'}
					class:key-entry--overdue={status === 'expired' || status === 'revoked'}
				>
					<div class="key-row">
						<span class="key-name">{key.name}</span>
						<span class="key-prefix mono">{key.key_prefix}…</span>
						<span class="key-scope"
							>{key.scope === 'read'
								? $_('settings.developer.apiKeys.scopeBadgeRead')
								: $_('settings.developer.apiKeys.scopeBadgeReadWrite')}</span
						>
					</div>
					<p class="key-meta-line">{keyMetaLine(key)}</p>

					{#if status !== 'revoked'}
						<div class="key-actions">
							{#if confirmingRevoke === key.id}
								<p class="confirm-warning">{$_('settings.developer.apiKeys.revokeConfirm')}</p>
								<div class="confirm-row">
									<form
										method="POST"
										action="?/revokeApiKey"
										use:enhance={() =>
											async ({ update }) => {
												await update();
												await invalidateAll();
											}}
									>
										<input type="hidden" name="key_id" value={key.id} />
										<button type="submit" class="btn-danger"
											>{$_('settings.developer.apiKeys.revokeConfirmBtn')}</button
										>
									</form>
									<button type="button" class="btn-ghost" onclick={() => (confirmingRevoke = null)}
										>{$_('settings.developer.apiKeys.cancel')}</button
									>
								</div>
							{:else if confirmingRotate === key.id}
								<p class="confirm-warning">{$_('settings.developer.apiKeys.rotateConfirm')}</p>
								<div class="confirm-row">
									<form
										method="POST"
										action="?/rotateApiKey"
										use:enhance={() =>
											async ({ update }) => {
												await update();
												await invalidateAll();
											}}
									>
										<input type="hidden" name="key_id" value={key.id} />
										<button type="submit" class="btn-secondary"
											>{$_('settings.developer.apiKeys.rotateConfirmBtn')}</button
										>
									</form>
									<button type="button" class="btn-ghost" onclick={() => (confirmingRotate = null)}
										>{$_('settings.developer.apiKeys.cancel')}</button
									>
								</div>
							{:else}
								<button
									type="button"
									class="btn-ghost"
									onclick={() => {
										confirmingRotate = key.id;
										confirmingRevoke = null;
									}}>{$_('settings.developer.apiKeys.rotate')}</button
								>
								<button
									type="button"
									class="btn-ghost btn-ghost--danger"
									onclick={() => {
										confirmingRevoke = key.id;
										confirmingRotate = null;
									}}>{$_('settings.developer.apiKeys.revoke')}</button
								>
							{/if}
						</div>
					{:else}
						<div class="key-actions">
							<form
								method="POST"
								action="?/restoreApiKey"
								use:enhance={() =>
									async ({ update }) => {
										await update();
										await invalidateAll();
									}}
							>
								<input type="hidden" name="key_id" value={key.id} />
								<button type="submit" class="btn-ghost"
									>{$_('settings.developer.apiKeys.restoreKey')}</button
								>
							</form>
							{#if confirmingDelete === key.id}
								<div class="confirm-row">
									<form
										method="POST"
										action="?/deleteApiKey"
										use:enhance={() =>
											async ({ update }) => {
												await update();
												await invalidateAll();
											}}
									>
										<input type="hidden" name="key_id" value={key.id} />
										<button type="submit" class="btn-danger"
											>{$_('settings.developer.apiKeys.deleteKeyConfirm')}</button
										>
									</form>
									<button type="button" class="btn-ghost" onclick={() => (confirmingDelete = null)}
										>{$_('settings.developer.apiKeys.cancel')}</button
									>
								</div>
							{:else}
								<button
									type="button"
									class="btn-ghost btn-ghost--danger"
									onclick={() => (confirmingDelete = key.id)}
									>{$_('settings.developer.apiKeys.deleteKey')}</button
								>
							{/if}
						</div>
					{/if}
				</div>
			{/each}
		</div>
	{:else if !newToken}
		<p class="empty-state">{$_('settings.developer.apiKeys.empty')}</p>
	{/if}

	{#if newToken}
		<div class="token-reveal">
			<p class="token-reveal-title">{$_('settings.developer.apiKeys.tokenRevealTitle')}</p>
			<p class="token-reveal-desc">{$_('settings.developer.apiKeys.tokenRevealDesc')}</p>
			<input
				id="token-display"
				type="text"
				readonly
				value={newToken}
				class="token-input"
				onclick={(e) => (e.target as HTMLInputElement).select()}
			/>
			<div class="token-actions">
				<button type="button" class="btn-secondary" onclick={copyToken}>
					{copied
						? $_('settings.developer.apiKeys.tokenCopied')
						: $_('settings.developer.apiKeys.tokenCopyBtn')}
				</button>
				<button type="button" class="btn-ghost" onclick={dismissToken}>
					{$_('settings.developer.apiKeys.tokenDoneBtn')}
				</button>
			</div>
		</div>
	{:else if activeKeys.length < 20}
		<form
			method="POST"
			action="?/createApiKey"
			class="pref-form"
			use:enhance={() => {
				creating = true;
				return async ({ update }) => {
					await update();
					creating = false;
					await invalidateAll();
				};
			}}
		>
			<label class="field">
				<span class="field-label">{$_('settings.developer.apiKeys.nameLabel')}</span>
				<input
					type="text"
					name="name"
					class="input"
					placeholder={$_('settings.developer.apiKeys.namePlaceholder')}
					required
					maxlength="80"
				/>
			</label>

			<div class="field-row">
				<label class="field field--half">
					<span class="field-label">{$_('settings.developer.apiKeys.scopeLabel')}</span>
					<select name="scope" class="input">
						<option value="read_write">{$_('settings.developer.apiKeys.scopeReadWrite')}</option>
						<option value="read">{$_('settings.developer.apiKeys.scopeRead')}</option>
					</select>
				</label>

				<label class="field field--half">
					<span class="field-label">{$_('settings.developer.apiKeys.expiryLabel')}</span>
					<select name="expires_duration_days" class="input">
						<option value="30">{$_('settings.developer.apiKeys.expiry30')}</option>
						<option value="90" selected>{$_('settings.developer.apiKeys.expiry90')}</option>
						<option value="365">{$_('settings.developer.apiKeys.expiry365')}</option>
						<option value="">{$_('settings.developer.apiKeys.expiryNone')}</option>
					</select>
				</label>
			</div>

			<button type="submit" class="btn-primary" disabled={creating}>
				{creating
					? $_('settings.developer.apiKeys.creating')
					: $_('settings.developer.apiKeys.create')}
			</button>
		</form>
	{:else}
		<p class="banner banner--warn">{$_('settings.developer.apiKeys.maxKeysError')}</p>
	{/if}
</section>

<div class="action-card">
	<span class="action-title">{$_('settings.developer.docs.title')}</span>
	<span class="action-desc">{$_('settings.developer.docs.description')}</span>
	<div class="action-row">
		<a href="/api/docs" target="_blank" rel="noopener" class="btn-secondary">
			{$_('settings.developer.docs.link')}
		</a>
		<a href="/api/spec" target="_blank" rel="noopener" class="btn-ghost">
			{$_('settings.developer.docs.specLink')}
		</a>
	</div>
</div>

<style>
	.section-title {
		font-size: var(--text-xl);
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
		margin: 0 0 0.375rem;
	}
	.desc {
		font-size: var(--text-sm);
		color: var(--text-muted);
		margin: 0 0 var(--space-4);
		line-height: var(--leading-base);
	}
	.setting-section {
		margin-bottom: var(--space-6);
	}
	.empty-state {
		font-size: var(--text-sm);
		color: var(--text-subtle);
		margin: 0 0 var(--space-4);
	}
	.key-list {
		margin-bottom: var(--space-4);
	}
	.key-entry {
		border-top: 1px solid var(--border);
		border-left: 3px solid transparent;
		padding: 0.875rem 0 0.875rem 0.875rem;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}
	.key-entry:last-child {
		border-bottom: 1px solid var(--border);
	}
	.key-entry--due {
		border-left-color: var(--status-due);
	}
	.key-entry--overdue {
		border-left-color: var(--status-overdue);
		opacity: 0.5;
		transition: opacity 0.15s;
	}
	.key-entry--overdue:hover {
		opacity: 0.85;
	}
	.key-row {
		display: flex;
		align-items: baseline;
		gap: 0.5rem;
		flex-wrap: wrap;
	}
	.key-name {
		font-size: var(--text-base);
		font-weight: 500;
		color: var(--text);
	}
	.key-prefix {
		font-size: var(--text-xs);
		color: var(--text-subtle);
		font-family: 'JetBrains Mono', monospace;
		font-variant-numeric: tabular-nums;
	}
	.key-scope {
		font-size: var(--text-xs);
		font-weight: 500;
		color: var(--accent);
		margin-left: auto;
	}
	.key-meta-line {
		font-size: var(--text-sm);
		color: var(--text-muted);
		margin: 0;
	}
	.key-actions {
		display: flex;
		gap: 0.125rem;
		align-items: center;
		flex-wrap: wrap;
		margin-top: 0.25rem;
	}
	.confirm-warning {
		font-size: var(--text-sm);
		color: var(--text-muted);
		margin: 0.25rem 0 0.5rem;
		width: 100%;
	}
	.confirm-row {
		display: flex;
		gap: 0.5rem;
		align-items: center;
	}
	.token-reveal {
		border: 1px solid var(--border);
		border-radius: 10px;
		padding: 1rem 1.25rem;
		background: var(--bg-subtle);
		margin-bottom: var(--space-4);
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.token-reveal-title {
		font-size: var(--text-base);
		font-weight: 600;
		color: var(--text);
		margin: 0;
	}
	.token-reveal-desc {
		font-size: var(--text-sm);
		color: var(--text-muted);
		margin: 0;
	}
	.token-input {
		font-family: 'JetBrains Mono', monospace;
		font-size: var(--text-sm);
		padding: 0.5rem 0.75rem;
		border: 1px solid var(--border-input);
		border-radius: 8px;
		background: var(--bg);
		color: var(--text);
		width: 100%;
		font-variant-numeric: tabular-nums;
	}
	.token-actions {
		display: flex;
		gap: 0.5rem;
		align-items: center;
	}
	.pref-form {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		margin-top: var(--space-3);
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
	}
	.field-row {
		display: flex;
		gap: 0.75rem;
	}
	.field--half {
		flex: 1;
	}
	.field-label {
		font-size: var(--text-sm);
		font-weight: 500;
		color: var(--text-muted);
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
	.action-card {
		border-radius: 10px;
		padding: 1.25rem 1.5rem;
		border: 1px solid var(--border);
		background: var(--bg);
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
		transition: border-color 0.15s;
	}
	.action-card:hover {
		border-color: var(--border-strong);
	}
	.action-title {
		font-size: var(--text-base);
		font-weight: 500;
		color: var(--text);
	}
	.action-desc {
		font-size: var(--text-sm);
		color: var(--text-muted);
		line-height: var(--leading-snug);
	}
	.action-row {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		margin-top: var(--space-4);
		padding-top: var(--space-4);
		border-top: 1px solid var(--border);
		flex-wrap: wrap;
	}

	/* Buttons */
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
		text-decoration: none;
		display: inline-flex;
		align-items: center;
	}
	.btn-secondary:hover:not(:disabled) {
		background: var(--bg-muted);
	}
	.btn-secondary:disabled {
		opacity: 0.5;
		cursor: not-allowed;
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
	.btn-ghost {
		padding: 0.375rem 0.625rem;
		background: none;
		color: var(--text-muted);
		border: none;
		border-radius: 8px;
		font-size: var(--text-sm);
		cursor: pointer;
		text-decoration: none;
		display: inline-flex;
		align-items: center;
	}
	.btn-ghost:hover {
		color: var(--text);
		background: var(--bg-muted);
	}
	.btn-ghost--danger {
		color: var(--status-overdue);
		opacity: 0.7;
	}
	.btn-ghost--danger:hover {
		opacity: 1;
		background: color-mix(in srgb, var(--status-overdue) 6%, var(--bg));
	}
	.btn-danger {
		padding: 0.5rem 1rem;
		background: color-mix(in srgb, var(--status-overdue) 10%, var(--bg));
		color: var(--status-overdue);
		border: 1px solid color-mix(in srgb, var(--status-overdue) 30%, var(--border));
		border-radius: 8px;
		font-size: var(--text-sm);
		font-weight: 500;
		cursor: pointer;
	}
	.btn-danger:hover {
		background: color-mix(in srgb, var(--status-overdue) 15%, var(--bg));
	}
	.banner {
		padding: 0.625rem 0.875rem;
		border-radius: 10px;
		font-size: var(--text-sm);
		border: 1px solid;
		margin-bottom: var(--space-4);
	}
	.banner--warn {
		background: color-mix(in srgb, var(--status-due) 8%, transparent);
		border-color: color-mix(in srgb, var(--status-due) 25%, transparent);
		color: var(--status-due);
	}
	.mono {
		font-family: 'JetBrains Mono', monospace;
		font-variant-numeric: tabular-nums;
	}

	@media (max-width: 480px) {
		.field-row {
			flex-direction: column;
		}
	}
</style>
