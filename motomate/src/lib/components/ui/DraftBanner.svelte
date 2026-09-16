<script lang="ts">
	import { _ } from '$lib/i18n';
	import Banner from './Banner.svelte';

	let {
		savedAt,
		hasUnsavedFile = false,
		onDiscard
	}: {
		savedAt: string;
		hasUnsavedFile?: boolean;
		onDiscard: () => void;
	} = $props();

	const ago = $derived.by(() => {
		const ms = Date.now() - new Date(savedAt).getTime();
		if (ms < 60_000) return $_('draft.justNow');
		if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}${$_('draft.unitMin')}`;
		if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}${$_('draft.unitHour')}`;
		return `${Math.floor(ms / 86_400_000)}${$_('draft.unitDay')}`;
	});
</script>

<Banner variant="info">
	<span class="banner-title">{$_('draft.resuming', { values: { ago } })}</span>
	{#if hasUnsavedFile}
		<span class="banner-hint--warn">{$_('draft.fileHint')}</span>
	{/if}
	{#snippet actions()}
		<button type="button" class="banner-btn banner-btn--primary" onclick={onDiscard}>
			{$_('draft.discard')}
		</button>
	{/snippet}
</Banner>
