<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import { sheet } from '$lib/stores/sheet.svelte.js';
	import { toasts } from '$lib/stores/toasts.svelte.js';
	import type { SafePaperlessIntegration } from '$lib/db/repositories/paperless-integrations.js';
	import type { PaperlessDocumentSummary } from '$lib/server/paperless/client.js';

	let { vehicleId, integrations }: { vehicleId: string; integrations: SafePaperlessIntegration[] } =
		$props();

	let integrationId = $state(untrack(() => integrations[0]?.id ?? ''));
	let query = $state('');
	let documents = $state<PaperlessDocumentSummary[]>([]);
	let loading = $state(false);
	let importing = $state<{ id: number; mode: 'link' | 'copy' } | null>(null);
	let error = $state<string | null>(null);

	async function search() {
		if (!integrationId) return;
		loading = true;
		error = null;
		try {
			const params = new URLSearchParams({ page_size: '25' });
			if (query.trim()) params.set('query', query.trim());
			const response = await fetch(
				`/api/integrations/paperless/${integrationId}/documents?${params}`
			);
			if (!response.ok) throw new Error(await response.text());
			const payload = (await response.json()) as { results: PaperlessDocumentSummary[] };
			documents = payload.results;
		} catch (cause) {
			error = cause instanceof Error ? cause.message : 'Paperless search failed';
		} finally {
			loading = false;
		}
	}

	async function importDocument(document: PaperlessDocumentSummary, mode: 'link' | 'copy') {
		importing = { id: document.id, mode };
		error = null;
		try {
			const response = await fetch(`/api/integrations/paperless/${integrationId}/documents`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					vehicle_id: vehicleId,
					paperless_document_id: document.id,
					import_mode: mode
				})
			});
			if (!response.ok) throw new Error(await response.text());
			toasts.success(
				mode === 'link'
					? 'Linked from Paperless-ngx. The original stays in Paperless.'
					: 'Saved a MotoMate copy. The original stays in Paperless too.'
			);
			await invalidateAll();
			sheet.closeSheet();
		} catch (cause) {
			error = cause instanceof Error ? cause.message : 'Unable to import document';
		} finally {
			importing = null;
		}
	}

	onMount(search);
</script>

<form
	class="search-row"
	onsubmit={(event) => {
		event.preventDefault();
		search();
	}}
>
	{#if integrations.length > 1}
		<select
			class="input integration-select"
			bind:value={integrationId}
			onchange={search}
			aria-label="Paperless connection"
		>
			{#each integrations as integration}
				<option value={integration.id}>{integration.name}</option>
			{/each}
		</select>
	{/if}
	<input class="input search-input" bind:value={query} placeholder="Search Paperless documents" />
	<button class="btn" type="submit" disabled={loading}>{loading ? 'Searching…' : 'Search'}</button>
</form>

<p class="import-help">
	Choose where the document should be stored. Neither option changes or deletes the original in
	Paperless-ngx.
</p>

{#if error}<p class="error">{error}</p>{/if}

{#if !loading && documents.length === 0}
	<p class="empty">No Paperless documents found.</p>
{:else}
	<div class="results">
		{#each documents as document (document.id)}
			<article class="result">
				<div class="result-copy">
					<strong
						>{document.title || document.original_file_name || `Document ${document.id}`}</strong
					>
					<span
						>{document.created}{document.original_file_name
							? ` · ${document.original_file_name}`
							: ''}</span
					>
				</div>
				<div class="result-actions">
					<button
						class="btn action-option"
						type="button"
						disabled={importing !== null}
						onclick={() => importDocument(document, 'link')}
					>
						<strong
							>{importing?.id === document.id && importing.mode === 'link'
								? 'Linking…'
								: 'Link from Paperless'}</strong
						>
						<small>Open it through MotoMate without using MotoMate file storage.</small>
					</button>
					<button
						class="btn action-option"
						type="button"
						disabled={importing !== null}
						onclick={() => importDocument(document, 'copy')}
					>
						<strong
							>{importing?.id === document.id && importing.mode === 'copy'
								? 'Saving copy…'
								: 'Keep a MotoMate copy'}</strong
						>
						<small>Store a copy in MotoMate as well as the original in Paperless.</small>
					</button>
				</div>
			</article>
		{/each}
	</div>
{/if}

<style>
	.search-row {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		gap: 0.5rem;
	}
	.integration-select {
		grid-column: 1 / -1;
	}
	.input {
		padding: 0.55rem 0.75rem;
		border: 1px solid var(--border-strong);
		border-radius: 8px;
		background: var(--bg-subtle);
		color: var(--text);
	}
	.search-input {
		min-width: 0;
	}
	.btn {
		padding: 0.5rem 0.8rem;
		border: 1px solid var(--border-strong);
		border-radius: 8px;
		background: var(--bg);
		color: var(--text);
		cursor: pointer;
	}
	.btn:disabled {
		opacity: 0.55;
		cursor: default;
	}
	.results {
		display: flex;
		flex-direction: column;
		margin-top: 1rem;
		max-height: 60vh;
		overflow: auto;
	}
	.result {
		display: flex;
		flex-direction: column;
		align-items: stretch;
		gap: 0.75rem;
		padding: 1rem 0;
		border-top: 1px solid var(--border);
	}
	.result-copy {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		min-width: 0;
	}
	.result-actions {
		display: grid;
		grid-template-columns: 1fr;
		gap: 0.5rem;
	}
	.action-option {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.15rem;
		width: 100%;
		text-align: left;
		line-height: 1.35;
	}
	.action-option small {
		font-size: var(--text-xs);
		color: var(--text-muted);
		font-weight: 400;
	}
	.action-option:hover small {
		color: var(--text);
	}
	.import-help {
		margin: 0.75rem 0 0;
		font-size: var(--text-sm);
		color: var(--text-muted);
	}
	.result-copy strong {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.result-copy span,
	.empty {
		font-size: var(--text-sm);
		color: var(--text-muted);
	}
	.error {
		color: var(--danger);
		font-size: var(--text-sm);
	}
	@media (max-width: 420px) {
		.search-row {
			grid-template-columns: 1fr;
		}
		.integration-select {
			grid-column: auto;
		}
	}
</style>
