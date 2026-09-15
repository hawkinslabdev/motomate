<script lang="ts">
	import { _ } from '$lib/i18n';
	import Banner from './Banner.svelte';

	let { vapidPublicKey, onDone }: { vapidPublicKey: string; onDone: () => void } = $props();

	let status = $state<'idle' | 'enabling' | 'error'>('idle');

	async function dismiss() {
		onDone();
		fetch('/api/prefs', {
			method: 'PATCH',
			keepalive: true,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ page_prefs: { global: { pushBannerDismissed: true } } })
		});
	}

	async function enable() {
		status = 'enabling';
		try {
			const reg = await navigator.serviceWorker.ready;
			const sub = await reg.pushManager.subscribe({
				userVisibleOnly: true,
				applicationServerKey: vapidPublicKey
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
			await dismiss();
		} catch {
			status = 'error';
		}
	}
</script>

<Banner variant="info">
	{#snippet children()}
		<span class="banner-title">{$_('dashboard.pushBanner.title')}</span>
		<span class="banner-desc">{$_('dashboard.pushBanner.description')}</span>
		{#if status === 'error'}
			<span class="banner-hint--warn">{$_('dashboard.pushBanner.error')}</span>
		{/if}
	{/snippet}
	{#snippet actions()}
		<button type="button" class="banner-btn banner-btn--secondary" onclick={dismiss}>
			{$_('dashboard.pushBanner.dismiss')}
		</button>
		<button
			type="button"
			class="banner-btn banner-btn--primary"
			onclick={enable}
			disabled={status === 'enabling'}
		>
			{$_('dashboard.pushBanner.enable')}
		</button>
	{/snippet}
</Banner>
