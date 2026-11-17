<script lang="ts">
	import { enhance } from '$app/forms';
	import { refreshAll } from '$app/navigation';
	import { _ } from '#lib/i18n/index.js';
	import { formatDateShort } from '#lib/utils/format.js';
	import type { ApiKey } from '#lib/db/schema.js';
	import { toasts } from '#lib/stores/toasts.svelte.js';
	import { untrack } from 'svelte';
	import RowMenu from '#lib/components/ui/RowMenu.svelte';

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
		const date = formatDateShort(key.expires_at, data.locale);
		return status === 'expired'
			? $_('settings.developer.apiKeys.expiredOn', { values: { date } })
			: $_('settings.developer.apiKeys.expiresOn', { values: { date } });
	}

	function lastUsedLabel(key: Omit<ApiKey, 'key_hash'>): string {
		if (!key.last_used_at) return $_('settings.developer.apiKeys.neverUsed');
		return formatDateShort(key.last_used_at.slice(0, 10), data.locale);
	}

	function keyMenu(key: Omit<ApiKey, 'key_hash'>) {
		if (key.revoked_at)
			return [
				{
					label: $_('settings.developer.apiKeys.restoreKey'),
					onclick: () =>
						(
							document.getElementById(`restore-${key.id}`) as HTMLFormElement | null
						)?.requestSubmit()
				},
				{
					label: $_('settings.developer.apiKeys.deleteKey'),
					danger: true,
					onclick: () => (confirmingDelete = key.id)
				}
			];
		return [
			{
				label: $_('settings.developer.apiKeys.rotate'),
				onclick: () => {
					confirmingRotate = key.id;
					confirmingRevoke = null;
				}
			},
			{
				label: $_('settings.developer.apiKeys.revoke'),
				danger: true,
				onclick: () => {
					confirmingRevoke = key.id;
					confirmingRotate = null;
				}
			}
		];
	}

	let formOpen = $state(untrack(() => data.keys.length === 0));

	const activeKeys = $derived(data.keys.filter((k: Omit<ApiKey, 'key_hash'>) => !k.revoked_at));
</script>

<svelte:head><title>{$_('settings.developer.title')} · Settings</title></svelte:head>

<div class="intro">
	<h2 class="section-title">{$_('settings.developer.title')}</h2>
	<p class="section-desc">{$_('settings.developer.subtitle')}</p>
</div>

<section class="dev-card" aria-labelledby="api-keys-title">
	<header class="dev-card-head">
		<div class="dev-card-text">
			<h3 id="api-keys-title" class="dev-card-title">{$_('settings.developer.apiKeys.title')}</h3>
			<p class="dev-card-desc">{$_('settings.developer.apiKeys.description')}</p>
		</div>
		{#if !newToken && !formOpen && activeKeys.length < 20}
			<button type="button" class="btn-primary" onclick={() => (formOpen = true)}>
				+ {$_('settings.developer.apiKeys.newKey')}
			</button>
		{/if}
	</header>

	{#if newToken}
		<div class="token-reveal">
			<p class="token-reveal-title">{$_('settings.developer.apiKeys.tokenRevealTitle')}</p>
			<p class="token-reveal-desc">{$_('settings.developer.apiKeys.tokenRevealDesc')}</p>
			<input
				id="token-display"
				type="text"
				readonly
				value={newToken}
				class="token-input mono"
				aria-label={$_('settings.developer.apiKeys.tokenRevealTitle')}
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
	{:else if formOpen && activeKeys.length < 20}
		<form
			method="POST"
			action="?/createApiKey"
			class="create-form"
			use:enhance={() => {
				creating = true;
				return async ({ result, update }) => {
					await update();
					creating = false;
					if (result.type === 'success') formOpen = false;
					await refreshAll();
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
				<label class="field">
					<span class="field-label">{$_('settings.developer.apiKeys.scopeLabel')}</span>
					<select name="scope" class="input">
						<option value="read_write">{$_('settings.developer.apiKeys.scopeReadWrite')}</option>
						<option value="read">{$_('settings.developer.apiKeys.scopeRead')}</option>
					</select>
				</label>
				<label class="field">
					<span class="field-label">{$_('settings.developer.apiKeys.expiryLabel')}</span>
					<select name="expires_duration_days" class="input">
						<option value="30">{$_('settings.developer.apiKeys.expiry30')}</option>
						<option value="90" selected>{$_('settings.developer.apiKeys.expiry90')}</option>
						<option value="365">{$_('settings.developer.apiKeys.expiry365')}</option>
						<option value="">{$_('settings.developer.apiKeys.expiryNone')}</option>
					</select>
				</label>
			</div>
			<div class="form-actions">
				<button type="submit" class="btn-primary" disabled={creating}>
					{creating
						? $_('settings.developer.apiKeys.creating')
						: $_('settings.developer.apiKeys.create')}
				</button>
				{#if data.keys.length > 0}
					<button type="button" class="btn-ghost" onclick={() => (formOpen = false)}>
						{$_('settings.developer.apiKeys.cancel')}
					</button>
				{/if}
			</div>
		</form>
	{:else if activeKeys.length >= 20}
		<p class="banner banner--warn">{$_('settings.developer.apiKeys.maxKeysError')}</p>
	{/if}

	{#if data.keys.length > 0}
		<ul class="key-list">
			{#each data.keys as key (key.id)}
				{@const status = keyStatus(key)}
				<li
					class="key-entry"
					class:key-entry--due={status === 'due'}
					class:key-entry--overdue={status === 'expired' || status === 'revoked'}
				>
					<div class="key-main">
						<div class="key-row">
							<span class="key-name">{key.name}</span>
							<span class="key-scope"
								>{key.scope === 'read'
									? $_('settings.developer.apiKeys.scopeBadgeRead')
									: $_('settings.developer.apiKeys.scopeBadgeReadWrite')}</span
							>
						</div>
						<p class="key-meta-line">
							<span class="mono">{key.key_prefix}…</span>&nbsp;·
							<span class:key-meta--warn={status !== 'ok'}>{expiryLabel(key)}</span>&nbsp;·
							<span>{$_('settings.developer.apiKeys.lastUsed')} {lastUsedLabel(key)}</span>
						</p>
						{#if confirmingRevoke === key.id || confirmingRotate === key.id || confirmingDelete === key.id}
							<div class="confirm">
								{#if confirmingDelete !== key.id}
									<p class="confirm-warning">
										{confirmingRevoke === key.id
											? $_('settings.developer.apiKeys.revokeConfirm')
											: $_('settings.developer.apiKeys.rotateConfirm')}
									</p>
								{/if}
								<div class="confirm-row">
									<form
										method="POST"
										action={confirmingRevoke === key.id
											? '?/revokeApiKey'
											: confirmingRotate === key.id
												? '?/rotateApiKey'
												: '?/deleteApiKey'}
										use:enhance={() =>
											async ({ update }) => {
												await update();
												await refreshAll();
											}}
									>
										<input type="hidden" name="key_id" value={key.id} />
										<button
											type="submit"
											class={confirmingRotate === key.id ? 'btn-secondary' : 'btn-danger'}
										>
											{confirmingRevoke === key.id
												? $_('settings.developer.apiKeys.revokeConfirmBtn')
												: confirmingRotate === key.id
													? $_('settings.developer.apiKeys.rotateConfirmBtn')
													: $_('settings.developer.apiKeys.deleteKeyConfirm')}
										</button>
									</form>
									<button
										type="button"
										class="btn-ghost"
										onclick={() => {
											confirmingRevoke = null;
											confirmingRotate = null;
											confirmingDelete = null;
										}}>{$_('settings.developer.apiKeys.cancel')}</button
									>
								</div>
							</div>
						{/if}
					</div>
					{#if key.revoked_at}
						<form
							id="restore-{key.id}"
							method="POST"
							action="?/restoreApiKey"
							hidden
							use:enhance={() =>
								async ({ update }) => {
									await update();
									await refreshAll();
								}}
						>
							<input type="hidden" name="key_id" value={key.id} />
						</form>
					{/if}
					<RowMenu items={keyMenu(key)} />
				</li>
			{/each}
		</ul>
	{:else if !newToken && !formOpen}
		<p class="empty-state">{$_('settings.developer.apiKeys.empty')}</p>
	{/if}
</section>

<section class="dev-card" aria-labelledby="api-docs-title">
	<header class="dev-card-head">
		<div class="dev-card-text">
			<h3 id="api-docs-title" class="dev-card-title">{$_('settings.developer.docs.title')}</h3>
			<p class="dev-card-desc">{$_('settings.developer.docs.description')}</p>
		</div>
	</header>
	<div class="docs-links">
		<a href="/api/docs" target="_blank" rel="noopener" class="btn-secondary">
			{$_('settings.developer.docs.link')}
		</a>
		<a href="/api/spec" target="_blank" rel="noopener" class="btn-ghost">
			{$_('settings.developer.docs.specLink')}
		</a>
	</div>
</section>

<style>
	.intro {
		margin-bottom: var(--space-5);
	}
	.section-desc {
		font-size: var(--text-sm);
		color: var(--text-muted);
		line-height: var(--leading-base);
		margin: 0;
	}

	.dev-card {
		border: 1px solid var(--border);
		border-radius: 10px;
		background: var(--bg);
		padding: 1.25rem 1.5rem;
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}
	.dev-card + .dev-card {
		margin-top: var(--space-4);
	}
	.dev-card-head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--space-4);
	}
	.dev-card-text {
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
		min-width: 0;
	}
	.dev-card-title {
		font-size: var(--text-base);
		font-weight: 500;
		color: var(--text);
		margin: 0;
	}
	.dev-card-desc {
		font-size: var(--text-sm);
		color: var(--text-muted);
		line-height: var(--leading-snug);
		margin: 0;
	}

	.empty-state {
		font-size: var(--text-sm);
		color: var(--text-muted);
		margin: 0;
	}

	.key-list {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.key-entry {
		display: flex;
		align-items: flex-start;
		gap: var(--space-3);
		padding: 0.875rem 0 0.875rem 0.875rem;
		margin-left: calc(-0.875rem - 3px);
		border-left: 3px solid transparent;
		position: relative;
	}
	.key-entry::before {
		content: '';
		position: absolute;
		top: 0;
		left: 0.875rem;
		right: 0;
		border-top: 1px solid var(--border);
	}
	.key-entry--due {
		border-left-color: var(--status-due);
	}
	.key-entry--overdue {
		border-left-color: var(--status-overdue);
	}
	.key-main {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}
	.key-row {
		display: flex;
		align-items: baseline;
		gap: var(--space-2);
		flex-wrap: wrap;
	}
	.key-name {
		font-size: var(--text-base);
		font-weight: 500;
		color: var(--text);
		overflow-wrap: anywhere;
	}
	.key-scope {
		font-size: var(--text-xs);
		color: var(--text-muted);
		padding: 0.0625rem 0.4375rem;
		border: 1px solid var(--border);
		border-radius: 999px;
		white-space: nowrap;
	}
	.key-scope::first-letter {
		text-transform: uppercase;
	}
	.key-meta-line {
		font-size: var(--text-sm);
		color: var(--text-muted);
		margin: 0;
	}
	.key-meta-line > span {
		white-space: nowrap;
	}
	.key-meta--warn {
		color: var(--status-due);
	}
	.key-entry--overdue .key-meta--warn {
		color: var(--status-overdue);
	}

	.confirm {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		margin-top: var(--space-2);
	}
	.confirm-warning {
		font-size: var(--text-sm);
		color: var(--text-muted);
		margin: 0;
	}
	.confirm-row {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		flex-wrap: wrap;
	}

	.token-reveal {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		padding: 1rem 1.25rem;
		border: 1px solid var(--border);
		border-radius: 10px;
		background: var(--bg-subtle);
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
		width: 100%;
		box-sizing: border-box;
		padding: 0.5rem 0.75rem;
		border: 1px solid var(--border-input);
		border-radius: 8px;
		background: var(--bg);
		color: var(--text);
		font-size: max(1rem, 16px);
	}
	.token-actions,
	.form-actions,
	.docs-links {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		flex-wrap: wrap;
	}

	.create-form {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		padding: var(--space-4);
		border-radius: 10px;
		background: var(--bg-subtle);
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
		flex: 1;
		min-width: 0;
	}
	.field-row {
		display: flex;
		gap: var(--space-3);
	}
	.field-label {
		font-size: var(--text-sm);
		font-weight: 500;
		color: var(--text-muted);
	}
	.input {
		width: 100%;
		box-sizing: border-box;
		padding: 0.5rem 0.75rem;
		border: 1px solid var(--border-input);
		border-radius: 8px;
		background: var(--bg);
		color: var(--text);
		font-size: max(1rem, 16px);
		transition: border-color 0.15s;
	}
	.input:focus {
		outline: 2px solid var(--accent);
		outline-offset: 1px;
		border-color: transparent;
	}

	.btn-primary,
	.btn-secondary,
	.btn-ghost,
	.btn-danger {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-height: 44px;
		padding: 0.5rem 1rem;
		border-radius: 10px;
		font-size: var(--text-sm);
		font-weight: 500;
		text-decoration: none;
		white-space: nowrap;
		cursor: pointer;
	}
	.btn-primary {
		background: var(--accent);
		color: var(--accent-fg);
		border: none;
	}
	.btn-primary:hover:not(:disabled) {
		background: var(--accent-hover);
	}
	.btn-secondary {
		background: var(--bg);
		color: var(--text);
		border: 1px solid var(--border-strong);
	}
	.btn-secondary:hover {
		background: var(--bg-muted);
	}
	.btn-ghost {
		background: none;
		color: var(--text-muted);
		border: 1px solid transparent;
	}
	.btn-ghost:hover {
		color: var(--text);
		background: var(--bg-muted);
	}
	.btn-danger {
		background: color-mix(in srgb, var(--status-overdue) 10%, var(--bg));
		color: var(--status-overdue);
		border: 1px solid color-mix(in srgb, var(--status-overdue) 30%, var(--border));
	}
	.btn-danger:hover {
		background: color-mix(in srgb, var(--status-overdue) 15%, var(--bg));
	}
	:is(.btn-primary, .btn-secondary, .btn-ghost, .btn-danger):disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	:is(.btn-primary, .btn-secondary, .btn-ghost, .btn-danger):focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}

	.banner {
		margin: 0;
		padding: 0.625rem 0.875rem;
		border: 1px solid color-mix(in srgb, var(--status-due) 25%, transparent);
		border-radius: 10px;
		background: color-mix(in srgb, var(--status-due) 8%, transparent);
		color: var(--status-due);
		font-size: var(--text-sm);
	}
	.mono {
		font-family: var(--font-mono);
		font-variant-numeric: tabular-nums;
	}

	@media (max-width: 640px) {
		.dev-card {
			padding: 1rem;
		}
		.dev-card-head {
			flex-direction: column;
		}
		.field-row {
			flex-direction: column;
		}
	}
</style>
