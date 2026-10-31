<script lang="ts">
	import { enhance } from '$app/forms';
	import { untrack } from 'svelte';
	import { _, waitLocale } from '#lib/i18n/index.js';
	import { formatDateTime } from '#lib/utils/format.js';
	import { toasts } from '#lib/stores/toasts.svelte.js';
	import type { ActionData, PageData } from './$types';

	let { data, form } = $props<{ data: PageData; form: ActionData }>();

	$effect(() => {
		waitLocale();
	});

	const initial = untrack(() => data);

	let s3Enabled = $state(initial.s3.enabled);
	let s3Endpoint = $state(initial.s3.endpoint);
	let s3Region = $state(initial.s3.region);
	let s3Bucket = $state(initial.s3.bucket);
	let s3AccessKey = $state(initial.s3.access_key);
	let s3Secret = $state('');

	let paperlessEnabled = $state(initial.paperless.enabled);
	let paperlessUrl = $state(initial.paperless.url);
	let paperlessToken = $state('');
	let paperlessReports = $state(initial.paperless.include_reports);

	let savingS3 = $state(false);
	let savingPaperless = $state(false);
	let syncing = $state(false);

	// Save is blocked while these differ from the last successful test.
	function s3Fingerprint(): string {
		return JSON.stringify([s3Endpoint, s3Region, s3Bucket, s3AccessKey, s3Secret]);
	}
	function paperlessFingerprint(): string {
		return JSON.stringify([paperlessUrl, paperlessToken]);
	}
	let s3Tested = $state(s3Fingerprint());
	let paperlessTested = $state(paperlessFingerprint());
	const s3Dirty = $derived(s3Fingerprint() !== s3Tested);
	const paperlessDirty = $derived(paperlessFingerprint() !== paperlessTested);

	const locale = $derived(data.user?.settings?.locale ?? 'en');

	function lastSync(value: string | null): string {
		return value
			? formatDateTime(value, locale, data.user?.timezone)
			: $_('settings.integrations.never');
	}

	function announce(result: { type: string; data?: Record<string, unknown> }) {
		if (result.type === 'failure') {
			const data = result.data ?? {};
			toasts.error(String(data.testError ?? $_('settings.integrations.saveFailed')));
			return;
		}
		if (result.type !== 'success') return;
		const data = result.data ?? {};
		if (data.testOk) toasts.success($_('settings.integrations.testOk'));
		else if (data.savedS3 || data.savedPaperless) toasts.success($_('settings.integrations.saved'));
	}
</script>

<svelte:head>
	<title>{$_('settings.integrations.title')} · {$_('layout.nav.settings')}</title>
</svelte:head>

<div class="intro">
	<h2 class="section-title">{$_('settings.integrations.title')}</h2>
	<p class="section-desc">{$_('settings.integrations.description')}</p>
</div>

<div class="channel-cards">
	<form
		method="POST"
		action="?/saveS3"
		class="channel-card"
		use:enhance={({ action }) => {
			const isTest = action.search === '?/test';
			savingS3 = true;
			return async ({ result, update }) => {
				announce(result);
				await update({ reset: false });
				if (result.type === 'success') {
					if (!isTest) s3Secret = '';
					s3Tested = s3Fingerprint();
				}
				savingS3 = false;
			};
		}}
	>
		<input type="hidden" name="enabled" value={String(s3Enabled)} />

		<div class="channel-top">
			<div class="channel-label">
				<span class="channel-name">{$_('settings.integrations.s3.label')}</span>
				<span class="channel-desc">{$_('settings.integrations.s3.description')}</span>
			</div>
			<button
				type="button"
				class="toggle-btn"
				class:toggle-btn--on={s3Enabled}
				onclick={() => (s3Enabled = !s3Enabled)}
				aria-label={$_('settings.integrations.s3.label')}
				aria-pressed={s3Enabled}
			>
				<span class="toggle-thumb"></span>
			</button>
		</div>

		{#if s3Enabled}
			<div class="channel-fields">
				<label class="field-label" for="s3-endpoint">
					{$_('settings.integrations.s3.endpointLabel')}
					<span class="optional">{$_('common.optional')}</span>
				</label>
				<input
					id="s3-endpoint"
					name="endpoint"
					type="url"
					class="field-input"
					placeholder="https://minio.local:9000"
					bind:value={s3Endpoint}
				/>
				<p class="channel-hint">{$_('settings.integrations.s3.endpointHint')}</p>

				<div class="field-row">
					<div class="field-col">
						<label class="field-label" for="s3-bucket"
							>{$_('settings.integrations.s3.bucketLabel')}</label
						>
						<input
							id="s3-bucket"
							name="bucket"
							type="text"
							class="field-input"
							bind:value={s3Bucket}
						/>
					</div>
					<div class="field-col">
						<label class="field-label" for="s3-region"
							>{$_('settings.integrations.s3.regionLabel')}</label
						>
						<input
							id="s3-region"
							name="region"
							type="text"
							class="field-input"
							placeholder="eu-west-1"
							bind:value={s3Region}
						/>
					</div>
				</div>

				<label class="field-label" for="s3-access"
					>{$_('settings.integrations.s3.accessKeyLabel')}</label
				>
				<input
					id="s3-access"
					name="access_key"
					type="text"
					class="field-input"
					autocomplete="off"
					bind:value={s3AccessKey}
				/>

				<label class="field-label" for="s3-secret"
					>{$_('settings.integrations.s3.secretKeyLabel')}</label
				>
				<input
					id="s3-secret"
					name="secret_key"
					type="password"
					class="field-input"
					autocomplete="new-password"
					placeholder={data.s3.secret_set ? $_('settings.integrations.storedPlaceholder') : ''}
					bind:value={s3Secret}
				/>

				<div class="action-row">
					<button
						type="submit"
						class="save-btn"
						disabled={savingS3 || s3Dirty}
						data-tooltip={s3Dirty ? $_('settings.integrations.testFirst') : undefined}
					>
						{savingS3 ? $_('common.saving') : $_('common.save')}
					</button>
					<button
						type="submit"
						class="test-btn"
						formaction="?/test"
						name="target"
						value="s3"
						disabled={!s3Bucket || !s3AccessKey || !(s3Secret || data.s3.secret_set)}
					>
						{$_('settings.integrations.test')}
					</button>
				</div>
				<p class="channel-hint">
					{$_('settings.integrations.lastSync', {
						values: { date: lastSync(data.s3.last_sync_at) }
					})}
				</p>
			</div>
		{/if}
	</form>

	<form
		method="POST"
		action="?/savePaperless"
		class="channel-card"
		use:enhance={({ action }) => {
			const isTest = action.search === '?/test';
			savingPaperless = true;
			return async ({ result, update }) => {
				announce(result);
				await update({ reset: false });
				if (result.type === 'success') {
					if (!isTest) paperlessToken = '';
					paperlessTested = paperlessFingerprint();
				}
				savingPaperless = false;
			};
		}}
	>
		<input type="hidden" name="enabled" value={String(paperlessEnabled)} />

		<div class="channel-top">
			<div class="channel-label">
				<span class="channel-name">{$_('settings.integrations.paperless.label')}</span>
				<span class="channel-desc">{$_('settings.integrations.paperless.description')}</span>
			</div>
			<button
				type="button"
				class="toggle-btn"
				class:toggle-btn--on={paperlessEnabled}
				onclick={() => (paperlessEnabled = !paperlessEnabled)}
				aria-label={$_('settings.integrations.paperless.label')}
				aria-pressed={paperlessEnabled}
			>
				<span class="toggle-thumb"></span>
			</button>
		</div>

		{#if paperlessEnabled}
			<div class="channel-fields">
				<label class="field-label" for="pl-url"
					>{$_('settings.integrations.paperless.urlLabel')}</label
				>
				<input
					id="pl-url"
					name="url"
					type="url"
					class="field-input"
					placeholder="https://paperless.local"
					bind:value={paperlessUrl}
				/>

				<label class="field-label" for="pl-token"
					>{$_('settings.integrations.paperless.tokenLabel')}</label
				>
				<input
					id="pl-token"
					name="token"
					type="password"
					class="field-input"
					autocomplete="new-password"
					placeholder={data.paperless.token_set
						? $_('settings.integrations.storedPlaceholder')
						: ''}
					bind:value={paperlessToken}
				/>
				<p class="channel-hint">{$_('settings.integrations.paperless.tokenHint')}</p>

				<label
					class="checkbox-row"
					data-tooltip={$_('settings.integrations.paperless.includeReportsHint')}
				>
					<input type="checkbox" name="include_reports" bind:checked={paperlessReports} />
					<span>{$_('settings.integrations.paperless.includeReportsLabel')}</span>
				</label>

				<div class="action-row">
					<button
						type="submit"
						class="save-btn"
						disabled={savingPaperless || paperlessDirty}
						data-tooltip={paperlessDirty ? $_('settings.integrations.testFirst') : undefined}
					>
						{savingPaperless ? $_('common.saving') : $_('common.save')}
					</button>
					<button
						type="submit"
						class="test-btn"
						formaction="?/test"
						name="target"
						value="paperless"
						disabled={!paperlessUrl || !(paperlessToken || data.paperless.token_set)}
					>
						{$_('settings.integrations.test')}
					</button>
				</div>
				<p class="channel-hint">
					{$_('settings.integrations.lastSync', {
						values: { date: lastSync(data.paperless.last_sync_at) }
					})}
				</p>
			</div>
		{/if}
	</form>
</div>

<div class="channel-card">
	<div class="channel-label">
		<span class="channel-name">{$_('settings.integrations.sync.title')}</span>
		<span class="channel-desc">{$_('settings.integrations.sync.description')}</span>
	</div>
	<div class="channel-fields">
		<form
			method="POST"
			action="?/sync"
			use:enhance={() => {
				syncing = true;
				return async ({ update }) => {
					await update({ reset: false });
					syncing = false;
				};
			}}
		>
			<div class="action-row">
				<button
					type="submit"
					class="save-btn"
					disabled={syncing || (!data.s3.enabled && !data.paperless.enabled)}
				>
					{syncing
						? $_('settings.integrations.sync.running')
						: $_('settings.integrations.sync.button')}
				</button>
				{#if data.paperless.enabled}
					<button
						type="submit"
						class="test-btn"
						name="resend"
						value="true"
						disabled={syncing}
						data-tooltip={$_('settings.integrations.sync.resendHint')}
					>
						{$_('settings.integrations.sync.resend')}
					</button>
				{/if}
			</div>
		</form>

		{#if form?.summary}
			{#if data.s3.enabled}
				<p class="channel-hint">
					{$_('settings.integrations.sync.resultS3', {
						values: {
							uploaded: form.summary.filesUploaded,
							skipped: form.summary.filesSkipped
						}
					})}
				</p>
			{/if}
			{#if data.paperless.enabled}
				<p class="channel-hint">
					{$_('settings.integrations.sync.resultPaperless', {
						values: {
							pushed: form.summary.docsPushed,
							already: form.summary.docsAlreadySent
						}
					})}
				</p>
			{/if}
			{#if form.summary.docsSkipped > 0}
				<p class="channel-hint">
					{$_('settings.integrations.sync.skipped', {
						values: { count: form.summary.docsSkipped }
					})}
				</p>
				<div class="error-list">
					{#each form.summary.skipped as name}
						<div class="error-row">{name}</div>
					{/each}
				</div>
			{/if}
			{#if form.summary.filesFailed + form.summary.docsFailed > 0}
				<p class="channel-hint channel-hint--warn">
					{$_('settings.integrations.sync.failed', {
						values: { count: form.summary.filesFailed + form.summary.docsFailed }
					})}
				</p>
				<div class="error-list">
					{#each form.summary.errors as err}
						<div class="error-row">{err}</div>
					{/each}
				</div>
			{/if}
		{/if}
	</div>
</div>

<style>
	.intro {
		margin-bottom: var(--space-5);
	}

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

	.channel-cards {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		margin-bottom: var(--space-4);
	}

	.channel-card {
		border-radius: 10px;
		padding: 1.25rem 1.5rem;
		border: 1px solid var(--border);
		background: var(--bg);
		transition: border-color 0.15s;
	}

	.channel-card:hover {
		border-color: var(--border-strong);
	}

	.channel-top {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--space-4);
	}

	.channel-label {
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
		min-width: 0;
	}

	.channel-name {
		font-size: var(--text-base);
		font-weight: 500;
		color: var(--text);
	}

	.channel-desc {
		font-size: var(--text-sm);
		color: var(--text-muted);
		line-height: var(--leading-snug);
	}

	.toggle-btn {
		width: 2.25rem;
		height: 1.25rem;
		border-radius: 999px;
		border: none;
		cursor: pointer;
		background: var(--border-strong);
		position: relative;
		flex-shrink: 0;
		margin-top: 0.125rem;
		transition: background 0.15s;
	}

	.toggle-btn--on {
		background: var(--accent);
	}

	.toggle-btn--on .toggle-thumb {
		transform: translateX(1rem);
	}

	.toggle-thumb {
		position: absolute;
		top: 2px;
		left: 2px;
		width: calc(1.25rem - 4px);
		height: calc(1.25rem - 4px);
		border-radius: 50%;
		background: #fff;
		transition: transform 0.15s;
	}

	.channel-fields {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		margin-top: var(--space-4);
		padding-top: var(--space-4);
		border-top: 1px solid var(--border);
	}

	.field-row {
		display: flex;
		gap: var(--space-3);
	}

	.field-col {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		flex: 1;
		min-width: 0;
	}

	.field-label {
		font-size: var(--text-sm);
		font-weight: 500;
		color: var(--text-muted);
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}

	.field-input {
		width: 100%;
		font-size: max(1rem, 16px);
		padding: 0.5rem 0.75rem;
		border: 1px solid var(--border-input);
		border-radius: 8px;
		background: var(--bg-subtle);
		color: var(--text);
		transition: border-color 0.15s;
		box-sizing: border-box;
	}

	.field-input:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 1px;
		border-color: transparent;
	}

	.checkbox-row {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		font-size: var(--text-sm);
		color: var(--text);
		margin-top: var(--space-1);
	}

	.channel-hint {
		font-size: var(--text-xs);
		color: var(--text-subtle);
		margin: 0;
		line-height: var(--leading-base);
	}

	.channel-hint--warn {
		color: var(--status-due);
	}

	.action-row {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		margin-top: var(--space-2);
		flex-wrap: wrap;
	}

	.save-btn {
		padding: 0.5rem 1rem;
		background: var(--accent);
		color: var(--accent-fg);
		border: none;
		border-radius: 10px;
		font-size: var(--text-sm);
		font-weight: 500;
		cursor: pointer;
		transition: background 0.15s;
	}

	.save-btn:hover:not(:disabled) {
		background: var(--accent-hover);
	}

	.save-btn:disabled {
		opacity: 0.7;
		cursor: default;
	}

	.test-btn {
		padding: 0.375rem 0.75rem;
		font-size: var(--text-sm);
		font-weight: 500;
		border-radius: 6px;
		cursor: pointer;
		background: none;
		border: 1px solid var(--border);
		color: var(--text-muted);
		transition:
			background 0.15s,
			border-color 0.15s;
	}

	.test-btn:hover:not(:disabled) {
		border-color: var(--border-strong);
		color: var(--text);
	}

	.test-btn:disabled {
		opacity: 0.5;
		cursor: default;
	}

	[data-tooltip] {
		position: relative;
	}

	[data-tooltip]::after {
		content: attr(data-tooltip);
		position: absolute;
		bottom: calc(100% + 6px);
		left: 50%;
		transform: translateX(-50%);
		width: max-content;
		max-width: 16rem;
		background: var(--text);
		color: var(--bg);
		padding: 0.375rem 0.5rem;
		border-radius: 6px;
		font-size: var(--text-xs);
		font-weight: 400;
		line-height: var(--leading-snug);
		text-align: left;
		opacity: 0;
		pointer-events: none;
		transition: opacity 0.15s ease;
		z-index: 100;
	}

	[data-tooltip]:hover::after,
	[data-tooltip]:focus-visible::after {
		opacity: 1;
	}

	@media (prefers-reduced-motion: reduce) {
		[data-tooltip]::after {
			transition: none;
		}
	}

	.error-list {
		display: flex;
		flex-direction: column;
		margin-top: var(--space-2);
		border-top: 1px solid var(--border);
	}

	.error-row {
		padding: 0.625rem 0;
		border-bottom: 1px solid var(--border);
		font-size: var(--text-sm);
		color: var(--text-muted);
		line-height: var(--leading-snug);
		word-break: break-word;
	}

	.error-row:last-child {
		border-bottom: none;
	}

	.optional {
		font-weight: 400;
		color: var(--text-subtle);
	}

	@media (max-width: 640px) {
		.field-row {
			flex-direction: column;
		}
	}
</style>
