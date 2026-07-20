<script lang="ts">
	let {
		documentId,
		name,
		previewable,
		compact = false
	}: { documentId: string; name: string; previewable: boolean; compact?: boolean } = $props();

	let failed = $state(false);
</script>

{#snippet thumbnail()}
	{#if failed}
		<span class="thumbnail-placeholder" aria-hidden="true">
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7">
				<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
				<path d="M14 2v6h6" />
			</svg>
		</span>
	{:else}
		<img
			src="/api/documents/{documentId}/thumbnail"
			alt=""
			loading="lazy"
			decoding="async"
			onerror={() => (failed = true)}
		/>
	{/if}
{/snippet}

{#if previewable}
	<a
		class="document-thumbnail"
		class:document-thumbnail--compact={compact}
		href="/api/documents/{documentId}/content"
		target="_blank"
		rel="noopener"
		aria-label="Preview {name} in a new browser tab"
		title="Preview in browser"
	>
		{@render thumbnail()}
	</a>
{:else}
	<div class="document-thumbnail" class:document-thumbnail--compact={compact}>
		{@render thumbnail()}
	</div>
{/if}

<style>
	.document-thumbnail {
		width: 52px;
		height: 66px;
		border: 1px solid var(--border);
		border-radius: 7px;
		background: var(--bg-muted);
		overflow: hidden;
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--text-subtle);
		text-decoration: none;
		box-shadow: 0 1px 2px color-mix(in srgb, var(--text) 8%, transparent);
	}
	.document-thumbnail--compact {
		width: 44px;
		height: 56px;
	}
	a.document-thumbnail:hover {
		border-color: var(--accent);
		box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 16%, transparent);
	}
	a.document-thumbnail:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
	img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	.thumbnail-placeholder {
		width: 25px;
		height: 25px;
		display: block;
	}
	.thumbnail-placeholder svg {
		width: 100%;
		height: 100%;
	}
</style>
