<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageData } from './$types';
	import { untrack } from 'svelte';
	import { _, waitLocale } from '$lib/i18n';
	import { formatDateTime } from '$lib/utils/format';

	let { data } = $props<{ data: PageData }>();

	$effect(() => {
		waitLocale();
	});

	// Channel toggles — intentionally snapshot initial values from props
	const initialChannels = untrack(() => data.channels ?? {});
	let pushEnabled = $state(initialChannels.push?.enabled ?? false);
	let emailEnabled = $state(initialChannels.email?.enabled ?? false);
	let emailAddress = $state(initialChannels.email?.address ?? '');
	let webhookEnabled = $state(initialChannels.webhook?.enabled ?? false);
	let webhookUrl = $state(initialChannels.webhook?.url ?? '');
	let webhookAuth = $state(initialChannels.webhook?.auth_header ?? '');
	let haEnabled = $state(initialChannels.home_assistant?.enabled ?? false);
	let haUrl = $state(initialChannels.home_assistant?.webhook_url ?? '');

	// Derived values for display (reactive)
	let initVapid = $derived(data.vapidPublicKey);
	let initSmtp = $derived(data.smtpConfigured);

	function extractHaWebhookId(url: string): string | null {
		try {
			const parsed = new URL(url);
			const parts = parsed.pathname.split('/');
			const webhookIndex = parts.indexOf('webhook');
			if (webhookIndex !== -1 && parts[webhookIndex + 1]) {
				return parts[webhookIndex + 1];
			}
			return null;
		} catch {
			return null;
		}
	}

	let haWebhookId = $derived(extractHaWebhookId(haUrl));
	let haConfigValid = $derived(haWebhookId !== null);

	let haYamlConfig = $derived.by(() => {
		const webhookId = extractHaWebhookId(haUrl) ?? 'motomate';
		return `alias: "MotoMate: Send notification"
description: "Forwarding notifications received from MotoMate"
mode: queued
max: 10
triggers:
  - trigger: webhook
    allowed_methods:
      - POST
    local_only: true
    webhook_id: ${webhookId}
conditions: []
actions:
  - action: notify.mobile_app_iphone_android
    metadata: {}
    data:
      title: "{{ trigger.json.title | default('Notification') }}"
      message: >-
        {{ trigger.json.message | default('Whoops. Something went wrong, no message provided..') }}
  - delay:
      hours: 0
      minutes: 0
      seconds: 3
      milliseconds: 0`;
	});

	let saveStatus = $state<'idle' | 'saving' | 'saved'>('idle');

	// Per-channel test state
	type TestStatus = 'idle' | 'sending' | 'sent' | 'error';
	let testStatus = $state<Record<string, TestStatus>>({
		push: 'idle',
		email: 'idle',
		webhook: 'idle',
		home_assistant: 'idle'
	});
	let testError = $state<Record<string, string>>({});

	async function sendTest(channel: string) {
		testStatus[channel] = 'sending';
		testError[channel] = '';
		try {
			const payload: Record<string, string> = { channel };
			if (channel === 'email') payload.address = emailAddress;
			if (channel === 'webhook') {
				payload.webhookUrl = webhookUrl;
				payload.webhookAuthHeader = webhookAuth;
			}
			if (channel === 'home_assistant') payload.haWebhookUrl = haUrl;
			const res = await fetch('/api/notifications/test', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload)
			});
			const json = await res.json();
			if (json.ok) {
				testStatus[channel] = 'sent';
			} else {
				testStatus[channel] = 'error';
				testError[channel] = json.error ?? '';
				console.error(`[notifications] ${channel} test failed:`, json.error);
			}
		} catch (e) {
			testStatus[channel] = 'error';
			const msg = e instanceof Error ? e.message : String(e);
			testError[channel] = msg;
			console.error(`[notifications] ${channel} test failed:`, msg);
		}
		setTimeout(() => (testStatus[channel] = 'idle'), 3000);
	}

	// Browser push subscription
	let pushSubStatus = $state<'idle' | 'subscribing' | 'subscribed' | 'error'>('idle');

	async function subscribePush() {
		if (!initVapid) return;
		pushSubStatus = 'subscribing';
		try {
			const reg = await navigator.serviceWorker.ready;
			const sub = await reg.pushManager.subscribe({
				userVisibleOnly: true,
				applicationServerKey: initVapid
			});
			const { endpoint, keys } = sub.toJSON() as {
				endpoint: string;
				keys: { p256dh: string; auth: string };
			};
			await fetch('/api/push/subscribe', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ endpoint, keys })
			});
			pushSubStatus = 'subscribed';
		} catch {
			pushSubStatus = 'error';
		}
	}

	// Inbox
	const hasUnread = $derived(
		data.notifications.some((n: { read_at: string | null }) => !n.read_at)
	);

	function formatNotifDate(dateStr: string) {
		return formatDateTime(dateStr, data.user?.settings?.locale ?? 'en', data.user?.timezone);
	}
</script>

<svelte:head>
	<title>{$_('settings.notifications.title')} · {$_('layout.nav.settings')}</title>
</svelte:head>

<div class="section-header">
	<h2 class="section-title">{$_('settings.notifications.channels.title')}</h2>
</div>

<form
	method="POST"
	action="?/saveChannels"
	use:enhance={() => {
		saveStatus = 'saving';
		return async ({ update }) => {
			await update({ reset: false });
			saveStatus = 'saved';
			setTimeout(() => (saveStatus = 'idle'), 2500);
		};
	}}
>
	<!-- Hidden inputs carry the actual values -->
	<input type="hidden" name="push_enabled" value={String(pushEnabled)} />
	<input type="hidden" name="email_enabled" value={String(emailEnabled)} />
	<input type="hidden" name="email_address" value={emailAddress} />
	<input type="hidden" name="webhook_enabled" value={String(webhookEnabled)} />
	<input type="hidden" name="webhook_url" value={webhookUrl} />
	<input type="hidden" name="webhook_auth_header" value={webhookAuth} />
	<input type="hidden" name="ha_enabled" value={String(haEnabled)} />
	<input type="hidden" name="ha_webhook_url" value={haUrl} />

	<div class="channel-cards">
		<!-- Push -->
		<div class="channel-card" class:channel-card--warn={pushEnabled && !initVapid}>
			<div class="channel-top">
				<div class="channel-label">
					<span class="channel-name">{$_('settings.notifications.channels.push.label')}</span>
					<span class="channel-desc">{$_('settings.notifications.channels.push.description')}</span>
				</div>
				<button
					type="button"
					class="toggle-btn"
					class:toggle-btn--on={pushEnabled}
					onclick={() => (pushEnabled = !pushEnabled)}
					aria-label={pushEnabled ? 'Disable push' : 'Enable push'}
				>
					<span class="toggle-thumb"></span>
				</button>
			</div>
			{#if pushEnabled}
				<div class="channel-fields">
					{#if !initVapid}
						<p class="channel-hint channel-hint--warn">
							{$_('settings.notifications.channels.push.noVapid')}
						</p>
					{:else}
						<button
							type="button"
							class="sub-btn"
							onclick={subscribePush}
							disabled={pushSubStatus === 'subscribing' || pushSubStatus === 'subscribed'}
						>
							{#if pushSubStatus === 'subscribing'}
								{$_('common.loading')}
							{:else if pushSubStatus === 'subscribed'}
								{$_('settings.notifications.channels.push.subscribed')}
							{:else if pushSubStatus === 'error'}
								{$_('settings.notifications.channels.push.subError')}
							{:else}
								{$_('settings.notifications.channels.push.subscribe')}
							{/if}
						</button>
					{/if}
					<button
						type="button"
						class="test-btn"
						onclick={() => sendTest('push')}
						disabled={testStatus.push === 'sending' || !initVapid}
					>
						{testStatus.push === 'sending'
							? $_('common.loading')
							: testStatus.push === 'sent'
								? $_('settings.notifications.channels.testSent')
								: testStatus.push === 'error'
									? $_('settings.notifications.channels.testError')
									: $_('settings.notifications.channels.testBtn')}
					</button>
				</div>
			{/if}
		</div>

		<!-- Email -->
		<div class="channel-card" class:channel-card--warn={emailEnabled && !initSmtp}>
			<div class="channel-top">
				<div class="channel-label">
					<span class="channel-name">{$_('settings.notifications.channels.email.label')}</span>
					<span class="channel-desc">{$_('settings.notifications.channels.email.description')}</span
					>
				</div>
				<button
					type="button"
					class="toggle-btn"
					class:toggle-btn--on={emailEnabled}
					onclick={() => (emailEnabled = !emailEnabled)}
					aria-label={emailEnabled ? 'Disable email' : 'Enable email'}
				>
					<span class="toggle-thumb"></span>
				</button>
			</div>
			{#if emailEnabled}
				<div class="channel-fields">
					{#if !initSmtp}
						<p class="channel-hint channel-hint--warn">
							{$_('settings.notifications.channels.email.noSmtp')}
						</p>
					{/if}
					<label class="field-label" for="email-address">
						{$_('settings.notifications.channels.email.addressLabel')}
					</label>
					<input
						id="email-address"
						type="email"
						class="field-input"
						placeholder={$_('settings.notifications.channels.email.addressPlaceholder')}
						bind:value={emailAddress}
					/>
					<p class="channel-hint">{$_('settings.notifications.channels.email.hint')}</p>
					<button
						type="button"
						class="test-btn"
						onclick={() => sendTest('email')}
						disabled={testStatus.email === 'sending' || !emailAddress}
					>
						{testStatus.email === 'sending'
							? $_('common.loading')
							: testStatus.email === 'sent'
								? $_('settings.notifications.channels.testSent')
								: testStatus.email === 'error'
									? $_('settings.notifications.channels.testError')
									: $_('settings.notifications.channels.testBtn')}
					</button>
					{#if testStatus.email === 'error' && testError.email}
						<p class="channel-hint channel-hint--warn">{testError.email}</p>
					{/if}
				</div>
			{/if}
		</div>

		<!-- Webhook -->
		<div class="channel-card">
			<div class="channel-top">
				<div class="channel-label">
					<span class="channel-name">{$_('settings.notifications.channels.webhook.label')}</span>
					<span class="channel-desc"
						>{$_('settings.notifications.channels.webhook.description')}</span
					>
				</div>
				<button
					type="button"
					class="toggle-btn"
					class:toggle-btn--on={webhookEnabled}
					onclick={() => (webhookEnabled = !webhookEnabled)}
					aria-label={webhookEnabled ? 'Disable webhook' : 'Enable webhook'}
				>
					<span class="toggle-thumb"></span>
				</button>
			</div>
			{#if webhookEnabled}
				<div class="channel-fields">
					<label class="field-label" for="webhook-url">
						{$_('settings.notifications.channels.webhook.urlLabel')}
					</label>
					<input
						id="webhook-url"
						type="url"
						class="field-input"
						placeholder={$_('settings.notifications.channels.webhook.urlPlaceholder')}
						bind:value={webhookUrl}
					/>
					<label class="field-label" for="webhook-auth">
						{$_('settings.notifications.channels.webhook.authLabel')}
						<span class="optional">{$_('common.optional')}</span>
					</label>
					<input
						id="webhook-auth"
						type="text"
						class="field-input"
						placeholder={$_('settings.notifications.channels.webhook.authPlaceholder')}
						bind:value={webhookAuth}
					/>
					<p class="channel-hint">{$_('settings.notifications.channels.webhook.hint')}</p>
					<button
						type="button"
						class="test-btn"
						onclick={() => sendTest('webhook')}
						disabled={testStatus.webhook === 'sending' || !webhookUrl}
					>
						{testStatus.webhook === 'sending'
							? $_('common.loading')
							: testStatus.webhook === 'sent'
								? $_('settings.notifications.channels.testSent')
								: testStatus.webhook === 'error'
									? $_('settings.notifications.channels.testError')
									: $_('settings.notifications.channels.testBtn')}
					</button>
				</div>
			{/if}
		</div>

		<!-- Home Assistant -->
		<div class="channel-card">
			<div class="channel-top">
				<div class="channel-label">
					<span class="channel-name">{$_('settings.notifications.channels.ha.label')}</span>
					<span class="channel-desc">{$_('settings.notifications.channels.ha.description')}</span>
				</div>
				<button
					type="button"
					class="toggle-btn"
					class:toggle-btn--on={haEnabled}
					onclick={() => (haEnabled = !haEnabled)}
					aria-label={haEnabled ? 'Disable Home Assistant' : 'Enable Home Assistant'}
				>
					<span class="toggle-thumb"></span>
				</button>
			</div>
			{#if haEnabled}
				<div class="channel-fields">
					<label class="field-label" for="ha-url">
						{$_('settings.notifications.channels.ha.urlLabel')}
					</label>
					<input
						id="ha-url"
						type="url"
						class="field-input"
						placeholder={$_('settings.notifications.channels.ha.urlPlaceholder')}
						bind:value={haUrl}
					/>
					<p class="channel-hint">{$_('settings.notifications.channels.ha.hint')}</p>
					{#if haUrl}
						{#if haConfigValid}
							<div class="ha-config">
								<div class="ha-config-header">
									<span class="ha-config-label"
										>{$_('settings.notifications.channels.ha.configLabel')}</span
									>
									<button
										type="button"
										class="copy-btn"
										onclick={() => navigator.clipboard.writeText(haYamlConfig)}
									>
										{$_('settings.notifications.channels.ha.copy')}
									</button>
								</div>
								<pre class="ha-config-code">{haYamlConfig}</pre>
							</div>
							<p class="channel-hint">{$_('settings.notifications.channels.ha.tip')}</p>
						{:else}
							<p class="channel-hint channel-hint--warn">
								{$_('settings.notifications.channels.ha.invalidUrl')}
							</p>
						{/if}
					{/if}
					<button
						type="button"
						class="test-btn"
						onclick={() => sendTest('home_assistant')}
						disabled={testStatus.home_assistant === 'sending' || !haUrl}
					>
						{testStatus.home_assistant === 'sending'
							? $_('common.loading')
							: testStatus.home_assistant === 'sent'
								? $_('settings.notifications.channels.testSent')
								: testStatus.home_assistant === 'error'
									? $_('settings.notifications.channels.testError')
									: $_('settings.notifications.channels.testBtn')}
					</button>
				</div>
			{/if}
		</div>
	</div>

	<div class="save-row">
		<button type="submit" class="save-btn" disabled={saveStatus === 'saving'}>
			{saveStatus === 'saving'
				? $_('common.saving')
				: saveStatus === 'saved'
					? $_('settings.notifications.channels.saved')
					: $_('settings.notifications.channels.saveBtn')}
		</button>
	</div>
</form>

<div class="inbox-divider" role="separator"></div>
<div class="inbox-header">
	<h3 class="inbox-title">{$_('settings.notifications.inbox.title')}</h3>
	{#if hasUnread}
		<form method="POST" action="?/markAllRead" use:enhance>
			<button type="submit" class="mark-all-btn">{$_('settings.notifications.markAllRead')}</button>
		</form>
	{/if}
</div>

{#if data.notifications.length === 0}
	<p class="empty-msg">{$_('settings.notifications.empty')}</p>
{:else}
	<div class="notif-list">
		{#each data.notifications as n}
			<div class="notif-row" class:notif-row--unread={!n.read_at}>
				<div class="notif-dot" class:notif-dot--unread={!n.read_at}></div>
				<div class="notif-body">
					<div class="notif-title">{n.title}</div>
					<div class="notif-text">{n.body}</div>
					<div class="notif-time">{formatNotifDate(n.created_at)}</div>
				</div>
				{#if !n.read_at}
					<form
						method="POST"
						action="?/markRead"
						use:enhance={({ formData: _fd }) => {
							return async ({ update }) => {
								await update({ reset: false });
							};
						}}
					>
						<input type="hidden" name="id" value={n.id} />
						<button type="submit" class="mark-read-btn"
							>{$_('settings.notifications.markRead')}</button
						>
					</form>
				{/if}
			</div>
		{/each}
	</div>
	<div class="see-more-row">
		<a href="/settings/notifications/all" class="see-more-link">
			{data.totalNotifications > data.notifications.length
				? $_('settings.notifications.seeMore', { values: { total: data.totalNotifications } })
				: $_('settings.notifications.viewAll')}
		</a>
	</div>
{/if}

<style>
	/* Page sections */
	.section-header {
		margin-bottom: var(--space-4);
	}
	.section-title {
		font-size: var(--text-2xl);
		font-weight: 600;
		color: var(--text);
		margin: 0;
		letter-spacing: -0.02em;
	}

	/* Channel cards */
	.channel-cards {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		margin-bottom: var(--space-5);
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
	.channel-card {
		border-left-width: 3px;
	}
	.channel-card--warn {
		border-left-color: var(--status-due);
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

	/* Channel fields (expand below toggle) */
	.channel-fields {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		margin-top: var(--space-4);
		padding-top: var(--space-4);
		border-top: 1px solid var(--border);
	}
	.field-label {
		font-size: var(--text-sm);
		font-weight: 500;
		color: var(--text-muted);
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}
	.optional {
		font-weight: 400;
		color: var(--text-subtle);
	}
	.field-input {
		width: 100%;
		font-size: var(--text-md);
		padding: 0.5rem 0.75rem;
		border: 1px solid var(--border);
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
	.channel-hint {
		font-size: var(--text-xs);
		color: var(--text-subtle);
		margin: 0;
		line-height: var(--leading-base);
	}
	.channel-hint--warn {
		color: var(--status-due);
	}

	/* Home Assistant config preview */
	.ha-config {
		margin-top: var(--space-2);
		background: var(--bg-muted);
		border: 1px solid var(--border);
		border-radius: 8px;
		overflow: hidden;
	}
	.ha-config-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.5rem 0.75rem;
		background: var(--bg-subtle);
		border-bottom: 1px solid var(--border);
	}
	.ha-config-label {
		font-size: var(--text-xs);
		font-weight: 500;
		color: var(--text-muted);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}
	.copy-btn {
		font-size: var(--text-xs);
		font-weight: 500;
		color: var(--accent);
		background: none;
		border: none;
		cursor: pointer;
		padding: 0;
	}
	.copy-btn:hover {
		text-decoration: underline;
	}
	.ha-config-code {
		font-family: var(--font-mono, ui-monospace, monospace);
		font-size: 0.75rem;
		line-height: 1.5;
		color: var(--text);
		margin: 0;
		padding: 0.75rem;
		overflow-x: auto;
		white-space: pre;
	}

	/* Subscribe / Test buttons */
	.sub-btn,
	.test-btn {
		align-self: flex-start;
		padding: 0.375rem 0.75rem;
		font-size: var(--text-sm);
		font-weight: 500;
		border-radius: 6px;
		cursor: pointer;
		transition:
			background 0.15s,
			border-color 0.15s;
	}
	.sub-btn {
		background: var(--accent-subtle);
		border: 1px solid var(--accent);
		color: var(--accent);
	}
	.sub-btn:hover:not(:disabled) {
		background: var(--accent);
		color: #fff;
	}
	.sub-btn:disabled {
		opacity: 0.6;
		cursor: default;
	}
	.test-btn {
		background: none;
		border: 1px solid var(--border);
		color: var(--text-muted);
	}
	.test-btn:hover:not(:disabled) {
		border-color: var(--border-strong);
		color: var(--text);
	}
	.test-btn:disabled {
		opacity: 0.5;
		cursor: default;
	}

	/* Save row */
	.save-row {
		margin-bottom: 0;
	}
	.save-btn {
		padding: 0.5rem 1rem;
		background: var(--accent);
		color: #fff;
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

	/* Toggle pill (reused from workflows page) */
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
	.toggle-btn--on .toggle-thumb {
		transform: translateX(1rem);
	}

	/* Inbox section */
	.inbox-divider {
		border: none;
		border-top: 1px solid var(--border);
		margin: var(--space-6) 0;
	}
	.inbox-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: var(--space-4);
		flex-wrap: wrap;
		gap: var(--space-3);
	}
	.inbox-title {
		font-size: var(--text-lg);
		font-weight: 600;
		color: var(--text);
		margin: 0;
	}
	.mark-all-btn {
		font-size: var(--text-sm);
		color: var(--accent);
		background: none;
		border: none;
		cursor: pointer;
		padding: 0;
		font-weight: 500;
	}
	.mark-all-btn:hover {
		text-decoration: underline;
	}

	.empty-msg {
		color: var(--text-muted);
		font-size: var(--text-sm);
	}

	.notif-list {
		display: flex;
		flex-direction: column;
	}
	.notif-row {
		display: flex;
		gap: var(--space-4);
		padding: 0.875rem 0;
		border-bottom: 1px solid var(--border);
		align-items: flex-start;
		opacity: 0.6;
		transition: opacity 0.1s;
	}
	.notif-row:first-child {
		border-top: 1px solid var(--border);
	}
	.notif-row--unread {
		opacity: 1;
	}

	.notif-dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		margin-top: 0.4rem;
		flex-shrink: 0;
		background: var(--border-strong);
	}
	.notif-dot--unread {
		background: var(--accent);
	}

	.notif-body {
		flex: 1;
		min-width: 0;
	}
	.notif-title {
		font-size: var(--text-sm);
		font-weight: 500;
		color: var(--text);
	}
	.notif-row--unread .notif-title {
		font-weight: 600;
	}
	.notif-text {
		font-size: var(--text-sm);
		color: var(--text-muted);
		margin-top: 0.125rem;
		line-height: var(--leading-snug);
	}
	.notif-time {
		font-size: var(--text-xs);
		color: var(--text-subtle);
		margin-top: 0.25rem;
		font-family: var(--font-mono);
		font-variant-numeric: tabular-nums;
	}

	.see-more-row {
		padding: 0.75rem 0;
		border-bottom: 1px solid var(--border);
	}
	.see-more-link {
		font-size: var(--text-sm);
		color: var(--accent);
		text-decoration: none;
		font-weight: 500;
	}
	.see-more-link:hover {
		text-decoration: underline;
	}

	.mark-read-btn {
		font-size: var(--text-xs);
		color: var(--text-subtle);
		background: none;
		border: 1px solid var(--border);
		border-radius: 4px;
		padding: 0.25rem 0.5rem;
		cursor: pointer;
		white-space: nowrap;
		flex-shrink: 0;
	}
	.mark-read-btn:hover {
		color: var(--text-muted);
		background: var(--bg-muted);
	}
</style>
