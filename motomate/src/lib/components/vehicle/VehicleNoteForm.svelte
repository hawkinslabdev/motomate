<script lang="ts">
	import { untrack } from 'svelte';
	import { enhance } from '$app/forms';
	import { renderMarkdown } from '$lib/utils/markdown.js';
	import { sheet } from '$lib/stores/sheet.svelte.js';
	import { drafts } from '$lib/stores/drafts.svelte.js';
	import { _, waitLocale } from '$lib/i18n';
	import DraftBanner from '$lib/components/ui/DraftBanner.svelte';
	import RichEditor from '$lib/components/ui/RichEditor.svelte';

	interface DocRecord {
		id: string;
		name: string;
		title?: string | null;
		doc_type: string;
		storage_key: string;
	}

	let {
		vehicleId,
		allDocs = [],
		viewMode = false,
		editData
	}: {
		vehicleId: string;
		allDocs?: DocRecord[];
		viewMode?: boolean;
		editData?: {
			id: string;
			title?: string | null;
			content: string;
			doc_refs: string[];
		};
	} = $props();

	$effect(() => {
		waitLocale();
	});

	const isEdit = $derived(!!editData);
	const draftKey = 'note-draft';

	const _initDraft = untrack(() => (!editData ? drafts.get(vehicleId, draftKey) : null));

	let titleValue = $state(
		untrack(() => (_initDraft?.fields.title as string) ?? editData?.title ?? '')
	);
	let contentValue = $state(
		untrack(() => (_initDraft?.fields.content as string) ?? editData?.content ?? '')
	);

	// Opened as a preview, so cancelling an edit goes back to it rather than closing the sheet
	const openedAsPreview = untrack(() => viewMode && !!editData);
	let isViewMode = $state(openedAsPreview);
	const renderedHtml = $derived(isViewMode ? renderMarkdown(contentValue) : '');

	let selectedDocIds = $state<Set<string>>(
		untrack(() => {
			const saved = _initDraft?.fields.doc_refs as string | undefined;
			const initial = saved ? (JSON.parse(saved) as string[]) : (editData?.doc_refs ?? []);
			return new Set(initial);
		})
	);
	let showDraftBanner = $state(untrack(() => !!_initDraft && !editData));
	let submitting = $state(false);

	function saveDraft() {
		if (isEdit) return;
		drafts.save(vehicleId, draftKey, {
			title: titleValue,
			content: contentValue,
			doc_refs: JSON.stringify([...selectedDocIds])
		});
		sheet.hint = $_('draft.autosaved');
	}

	function discardDraft() {
		drafts.clear(vehicleId, draftKey);
		showDraftBanner = false;
		titleValue = '';
		contentValue = '';
		selectedDocIds = new Set();
	}

	function cancelEdit() {
		if (!openedAsPreview) {
			sheet.closeSheet();
			return;
		}
		// Drop the unsaved edits so the preview shows what is actually stored
		titleValue = editData!.title ?? '';
		contentValue = editData!.content;
		selectedDocIds = new Set(editData!.doc_refs);
		isViewMode = true;
	}

	function handleContentChange(markdown: string) {
		contentValue = markdown;
		saveDraft();
	}

	function handleDocRef(docId: string) {
		const next = new Set(selectedDocIds);
		next.add(docId);
		selectedDocIds = next;
		saveDraft();
	}

	function downloadMarkdown() {
		const filename = `${titleValue.trim() || 'note'}.md`;
		const blob = new Blob([contentValue], { type: 'text/markdown' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = filename;
		a.click();
		URL.revokeObjectURL(url);
	}
</script>

{#if isViewMode}
	<div class="view-layout">
		<div class="note-view">
			<div class="note-view-content">{@html renderedHtml}</div>
		</div>
		<div class="form-actions">
			<button type="button" class="btn-primary" onclick={() => (isViewMode = false)}>
				{$_('common.edit')}
			</button>
			<button type="button" class="btn-ghost" onclick={() => sheet.closeSheet()}>
				{$_('common.close')}
			</button>
		</div>
		<div class="form-download">
			<button type="button" class="btn-download" onclick={downloadMarkdown}>
				{$_('vehicle.notes.form.download')}
			</button>
		</div>
	</div>
{:else}
	<form
		method="POST"
		action={isEdit ? '?/update' : '?/create'}
		class="note-form"
		use:enhance={() => {
			submitting = true;
			return async ({ result, update }) => {
				await update();
				submitting = false;
				if (result.type === 'success') {
					if (!isEdit) drafts.clear(vehicleId, draftKey);
					sheet.closeSheet();
				}
			};
		}}
	>
		{#if isEdit}
			<input type="hidden" name="id" value={editData!.id} />
		{/if}

		{#each [...selectedDocIds] as docId}
			<input type="hidden" name="doc_refs" value={docId} />
		{/each}

		{#if showDraftBanner}
			<DraftBanner savedAt={_initDraft!.savedAt} onDiscard={discardDraft} />
		{/if}

		<label class="field">
			<span class="field-label">{$_('vehicle.notes.form.title')}</span>
			<input
				type="text"
				name="title"
				bind:value={titleValue}
				oninput={saveDraft}
				placeholder={$_('vehicle.notes.form.titlePlaceholder')}
				maxlength="200"
				class="input"
			/>
		</label>

		<div class="field">
			<span class="field-label">{$_('vehicle.notes.form.content')}</span>
			<RichEditor
				content={contentValue}
				placeholder={$_('vehicle.notes.form.contentPlaceholder')}
				docs={allDocs}
				name="content"
				docSearchPlaceholder={$_('vehicle.notes.form.docSearch')}
				docSearchEmpty={$_('vehicle.notes.form.docSearchEmpty')}
				onchange={handleContentChange}
				ondocref={handleDocRef}
			/>
		</div>

		<div class="form-actions">
			<button type="submit" class="btn-primary" disabled={submitting || !contentValue.trim()}>
				{submitting ? $_('common.saving') : $_('common.save')}
			</button>
			<button type="button" class="btn-ghost" onclick={cancelEdit}>
				{openedAsPreview ? $_('common.back') : $_('common.cancel')}
			</button>
		</div>
		<div class="form-download">
			<button type="button" class="btn-download" onclick={downloadMarkdown}>
				{$_('vehicle.notes.form.download')}
			</button>
		</div>
	</form>
{/if}

<style>
	.view-layout {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}

	.note-view {
		flex: 1;
		overflow-y: auto;
	}

	.note-view-content {
		font-size: var(--text-base);
		line-height: var(--leading-base);
		color: var(--text);
	}

	.note-view-content :global(h1),
	.note-view-content :global(h2),
	.note-view-content :global(h3) {
		font-size: var(--text-lg);
		font-weight: 600;
		color: var(--text);
		margin: 1.25rem 0 0.4rem;
		line-height: var(--leading-tight);
	}

	.note-view-content :global(h1:first-child),
	.note-view-content :global(h2:first-child),
	.note-view-content :global(h3:first-child) {
		margin-top: 0;
	}

	.note-view-content :global(p) {
		margin: 0.5rem 0;
	}

	.note-view-content :global(p:first-child) {
		margin-top: 0;
	}

	.note-view-content :global(a) {
		color: var(--accent);
		text-decoration: underline;
	}

	.note-view-content :global(strong) {
		font-weight: 600;
	}

	.note-view-content :global(em) {
		font-style: italic;
	}

	.note-view-content :global(ul) {
		padding-left: 1.5rem;
		margin: 0.5rem 0;
	}

	.note-view-content :global(ol) {
		padding-left: 1.5rem;
		margin: 0.5rem 0;
	}

	.note-view-content :global(ul > li) {
		display: list-item;
		list-style-type: disc;
		margin: 0.2rem 0;
	}

	.note-view-content :global(ol > li) {
		display: list-item;
		list-style-type: decimal;
		margin: 0.2rem 0;
	}

	.note-view-content :global(blockquote) {
		border-left: 3px solid var(--border-strong);
		padding-left: 0.75rem;
		color: var(--text-muted);
		margin: 0.75rem 0;
	}

	.note-view-content :global(code) {
		font-family: var(--font-mono);
		font-size: 0.875em;
		background: var(--bg-muted);
		padding: 0.125rem 0.3rem;
		border-radius: 3px;
	}

	.note-view-content :global(pre) {
		background: var(--bg-muted);
		padding: 0.75rem;
		border-radius: 6px;
		overflow-x: auto;
		margin: 0.75rem 0;
	}

	.note-view-content :global(pre code) {
		background: none;
		padding: 0;
		font-size: var(--text-sm);
	}

	.note-view-content :global(hr) {
		border: none;
		border-top: 1px solid var(--border);
		margin: 1rem 0;
	}

	.note-form {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
	}

	.field-label {
		font-size: var(--text-sm);
		font-weight: 500;
		color: var(--text-muted);
	}

	.input {
		padding: 0.75rem;
		border: 1px solid var(--border);
		border-radius: 10px;
		background: var(--bg);
		color: var(--text);
		font-size: var(--text-md);
		width: 100%;
		min-height: 48px;
		box-sizing: border-box;
		font-family: var(--font-sans);
	}

	.input:hover {
		border-color: var(--border-strong);
	}

	.input:focus {
		outline: 2px solid var(--accent);
		outline-offset: 1px;
		border-color: var(--accent);
	}

	.form-actions {
		display: flex;
		gap: var(--space-3);
		padding-top: var(--space-2);
	}

	.form-actions > * {
		flex: 1;
	}

	.btn-primary {
		padding: 0.75rem 1.25rem;
		background: var(--accent);
		color: #fff;
		border: none;
		border-radius: 10px;
		font-size: var(--text-sm);
		font-weight: 500;
		cursor: pointer;
		min-height: 48px;
	}

	.btn-primary:hover:not(:disabled) {
		background: var(--accent-hover);
	}

	.btn-primary:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.btn-ghost {
		padding: 0.75rem 1.25rem;
		background: transparent;
		border: 1px solid var(--border);
		border-radius: 10px;
		font-size: var(--text-sm);
		font-weight: 500;
		cursor: pointer;
		color: var(--text-muted);
		min-height: 48px;
	}

	.btn-ghost:hover {
		background: var(--bg-muted);
		color: var(--text);
	}

	.form-download {
		display: flex;
		justify-content: center;
	}

	.btn-download {
		font-size: var(--text-xs);
		font-weight: 500;
		color: var(--text-subtle);
		background: none;
		border: none;
		cursor: pointer;
		padding: 0.25rem 0.5rem;
		text-decoration: underline;
		text-underline-offset: 2px;
	}

	.btn-download:hover {
		color: var(--text-muted);
	}
</style>
