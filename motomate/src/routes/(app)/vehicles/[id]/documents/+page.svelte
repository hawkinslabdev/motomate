<script lang="ts">
	import { untrack } from 'svelte';
	import { enhance } from '$app/forms';
	import { goto, beforeNavigate, afterNavigate } from '$app/navigation';
	import { tick } from 'svelte';
	import { page } from '$app/state';
	import type { PageData } from './$types';
	import ConfirmDialog from '$lib/components/ui/ConfirmDialog.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import ViewToggle from '$lib/components/ui/ViewToggle.svelte';
	import ColumnPicker from '$lib/components/ui/ColumnPicker.svelte';
	import DocumentUploadForm from '$lib/components/documents/DocumentUploadForm.svelte';
	import PaperlessDocumentPicker from '$lib/components/documents/PaperlessDocumentPicker.svelte';
	import DocumentThumbnail from '$lib/components/documents/DocumentThumbnail.svelte';
	import { isBrowserPreviewable } from '$lib/documents/content.js';
	import { toasts } from '$lib/stores/toasts.svelte.js';
	import { _, waitLocale } from '$lib/i18n';
	import { sheet } from '$lib/stores/sheet.svelte.js';

	let {
		data,
		form
	}: {
		data: PageData;
		form: { uploaded?: boolean; deleted?: boolean; renamed?: boolean; error?: string } | null;
	} = $props();

	$effect(() => {
		waitLocale();
	});

	const locale = $derived(data.user?.settings?.locale ?? 'en');
	const totalPages = $derived(Math.max(1, Math.ceil((data.total ?? 0) / data.perPage)));
	type DocumentRow = PageData['docs'][number];

	let isDragging = $state(false);

	let deletingDoc = $state<DocumentRow | null>(null);
	let paperlessAction = $state<{ document: DocumentRow; mode: 'mirror' | 'move' } | null>(null);
	let syncingDocId = $state<string | null>(null);

	let searchQuery = $state(page.url.searchParams.get('search') ?? '');
	let categoryFilter = $state<string>(page.url.searchParams.get('type') ?? 'all');
	let sortBy = $state<'newest' | 'oldest' | 'name'>(
		untrack(
			() =>
				(page.url.searchParams.get('sort') as 'newest' | 'oldest' | 'name') ??
				data.page_prefs?.sortBy ??
				'newest'
		)
	);
	let viewMode = $state<'table' | 'timeline'>(
		untrack(() => {
			const stored = data.page_prefs?.viewMode;
			if (stored === 'list' || stored === 'table') return 'table';
			if (stored === 'timeline') return 'timeline';
			return 'table';
		})
	);

	const defaultDocColVis: Record<string, boolean> = {
		type: true,
		size: true,
		date: true,
		expiry: true
	};
	let docColVis = $state<Record<string, boolean>>(
		untrack(() => data.page_prefs?.columnVisibility ?? defaultDocColVis)
	);

	const docColumns = [
		{ key: 'name', label: $_('documents.col.name'), hideable: false },
		{ key: 'type', label: $_('documents.col.type'), hideable: true },
		{ key: 'size', label: $_('documents.col.size'), hideable: true },
		{ key: 'date', label: $_('documents.col.date'), hideable: true },
		{ key: 'expiry', label: $_('documents.col.expiry'), hideable: true }
	];

	// Persist view preferences
	let _prefTimer: ReturnType<typeof setTimeout>;
	let _pendingPrefs: object | null = null;
	let _firstRun = true;

	function flushPrefs() {
		if (!_pendingPrefs) return;
		const body = JSON.stringify({ page_prefs: { documents: _pendingPrefs } });
		_pendingPrefs = null;
		clearTimeout(_prefTimer);
		fetch('/api/prefs', {
			method: 'PATCH',
			keepalive: true,
			headers: { 'content-type': 'application/json' },
			body
		});
	}

	beforeNavigate(() => flushPrefs());

	$effect(() => {
		const s = sortBy;
		const v = viewMode;
		const c = docColVis;
		if (_firstRun) {
			_firstRun = false;
			return;
		}
		_pendingPrefs = { sortBy: s, viewMode: v, columnVisibility: c };
		clearTimeout(_prefTimer);
		_prefTimer = setTimeout(flushPrefs, 600);
	});

	let _restoreFocusEl: HTMLElement | null = null;
	let _restoreCursorPos: number | null = null;

	afterNavigate(() => {
		if (_restoreFocusEl) {
			(_restoreFocusEl as HTMLInputElement).focus();
			if (_restoreCursorPos !== null) {
				(_restoreFocusEl as HTMLInputElement).setSelectionRange?.(
					_restoreCursorPos,
					_restoreCursorPos
				);
			}
			_restoreFocusEl = null;
			_restoreCursorPos = null;
		}
	});

	function applyFilters() {
		const focused = document.activeElement as HTMLInputElement | null;
		if (focused) {
			_restoreFocusEl = focused;
			_restoreCursorPos = focused.selectionStart ?? null;
		}
		const u = new URL(page.url);
		u.searchParams.set('page', '1');
		if (searchQuery.trim()) u.searchParams.set('search', searchQuery.trim());
		else u.searchParams.delete('search');
		if (categoryFilter !== 'all') u.searchParams.set('type', categoryFilter);
		else u.searchParams.delete('type');
		u.searchParams.set('sort', sortBy);
		goto(u.toString(), { replaceState: true, noScroll: true });
	}

	let _searchTimer: ReturnType<typeof setTimeout>;
	function onSearchInput() {
		clearTimeout(_searchTimer);
		_searchTimer = setTimeout(applyFilters, 300);
	}

	let editingDocId = $state<string | null>(null);
	let editingName = $state('');

	const docTypeLabels = $derived({
		service: $_('documents.types.service'),
		quotation: $_('documents.types.quotation'),
		papers: $_('documents.types.papers'),
		photo: $_('documents.types.photo'),
		notes: $_('documents.types.notes'),
		other: $_('documents.types.other'),
		route: $_('documents.types.route')
	});

	function formatSize(bytes: number) {
		if (bytes < 1024) return `${bytes} B`;
		if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
		return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	}

	function formatDate(dateStr: string) {
		return new Date(dateStr).toLocaleDateString(locale, {
			day: 'numeric',
			month: 'short',
			year: 'numeric'
		});
	}

	function formatYearMonth(dateStr: string) {
		return new Date(dateStr).toLocaleDateString(locale, {
			month: 'long',
			year: 'numeric'
		});
	}

	function isExpiringSoon(dateStr: string | null) {
		if (!dateStr) return false;
		const days = Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000);
		return days >= 0 && days <= 30;
	}

	function isExpired(dateStr: string | null) {
		if (!dateStr) return false;
		return new Date(dateStr) < new Date();
	}

	function openUploadSheet(file?: File) {
		sheet.openSheet(DocumentUploadForm, $_('documents.upload'), {
			vehicleId: data.vehicle.id,
			file
		});
	}

	function openPaperlessPicker() {
		sheet.openSheet(
			PaperlessDocumentPicker,
			'Add from Paperless-ngx',
			{ vehicleId: data.vehicle.id, integrations: data.paperlessIntegrations },
			true
		);
	}

	function documentStorageState(document: DocumentRow): {
		label: string;
		detail?: string;
		tone: 'local' | 'paperless' | 'both' | 'progress' | 'error';
	} {
		if (document.sync_status === 'queued' || document.sync_status === 'processing') {
			return {
				label:
					document.sync_status === 'queued'
						? 'Waiting to send to Paperless-ngx'
						: 'Sending to Paperless-ngx',
				tone: 'progress'
			};
		}
		if (document.sync_status === 'failed') {
			return {
				label: 'Paperless-ngx copy failed',
				detail: document.sync_error ?? 'Try copying or moving the document again.',
				tone: 'error'
			};
		}
		if (document.paperless_document_id != null && document.storage_key) {
			return { label: 'Stored in MotoMate + Paperless-ngx', tone: 'both' };
		}
		if (document.paperless_document_id != null) {
			return { label: 'Stored in Paperless-ngx · linked to MotoMate', tone: 'paperless' };
		}
		return { label: 'Stored in MotoMate only', tone: 'local' };
	}

	function requestPaperlessAction(document: DocumentRow, mode: 'mirror' | 'move') {
		paperlessAction = { document, mode };
	}

	async function confirmPaperlessAction() {
		if (!paperlessAction) return;
		const integration = data.paperlessIntegrations[0];
		if (!integration) return;
		const { document, mode } = paperlessAction;
		syncingDocId = document.id;
		try {
			const response = await fetch(`/api/documents/${document.id}/paperless-sync`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ integration_id: integration.id, mode })
			});
			if (!response.ok) throw new Error(await response.text());
			toasts.success(
				mode === 'mirror'
					? 'Copy queued. The original will stay in MotoMate.'
					: 'Move queued. MotoMate will remove its local file only after Paperless confirms the upload.'
			);
			paperlessAction = null;
			await goto(page.url.toString(), { invalidateAll: true, noScroll: true });
		} catch (cause) {
			toasts.error(cause instanceof Error ? cause.message : 'Paperless transfer failed');
		} finally {
			syncingDocId = null;
		}
	}

	function deleteDescription(document: DocumentRow): string {
		if (document.paperless_document_id != null && document.storage_key) {
			return 'MotoMate will remove this record and its local copy. The copy already stored in Paperless-ngx will not be deleted.';
		}
		if (document.paperless_document_id != null) {
			return 'MotoMate will remove this link. The original document in Paperless-ngx will not be deleted.';
		}
		return 'This file is stored only in MotoMate. Deleting it will permanently remove the file and cannot be undone.';
	}

	function handleDrop(e: DragEvent) {
		const file = e.dataTransfer?.files[0];
		if (file) openUploadSheet(file);
	}

	function handleFileSelect(e: Event) {
		const file = (e.target as HTMLInputElement).files?.[0];
		if (file) openUploadSheet(file);
	}

	function startEditName(docId: string, currentName: string) {
		editingDocId = docId;
		editingName = currentName;
	}

	function cancelEditName() {
		editingDocId = null;
		editingName = '';
	}

	function navTo(p: number) {
		const u = new URL(page.url);
		u.searchParams.set('page', String(p));
		goto(u.toString(), { replaceState: false });
	}

	const highlightId = $derived(page.url.searchParams.get('highlight') ?? null);

	// Display name: user-facing title if set, otherwise original filename
	function displayName(doc: PageData['docs'][number]): string {
		return doc.title || doc.name;
	}

	$effect(() => {
		if (highlightId) {
			const doc = data.docs.find((d) => d.id === highlightId);
			if (doc) searchQuery = displayName(doc);
			tick().then(() => {
				const el = document.getElementById(`doc-${highlightId}`);
				if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
			});
		}
	});

	const timelineDocs = $derived(() => {
		const grouped: Record<string, typeof data.docs> = {};
		for (const doc of data.docs) {
			const month = formatYearMonth(doc.created_at);
			if (!grouped[month]) grouped[month] = [];
			grouped[month].push(doc);
		}
		return grouped;
	});

	$effect(() => {
		const f = form;
		untrack(() => {
			if (f?.uploaded) {
				toasts.success($_('documents.toasts.uploaded'));
			}
			if (f?.renamed) {
				editingDocId = null;
				editingName = '';
				toasts.success($_('documents.toasts.renamed'));
			}
			if (f?.deleted) {
				toasts.success($_('documents.toasts.deleted'));
			}
			if (f?.error) {
				toasts.error(String(f.error));
			}
		});
	});
</script>

<svelte:head><title>{$_('documents.title')} · {data.vehicle.name}</title></svelte:head>

<div class="page-header">
	<div class="page-header-text">
		<h2 class="section-title">{$_('documents.title')}</h2>
		<p class="page-sub">{$_('documents.subtitle')}</p>
	</div>
	<div class="page-actions">
		<button type="button" class="btn-primary" onclick={() => openUploadSheet()}>
			{$_('documents.upload')}
		</button>
		{#if data.paperlessIntegrations.length > 0}
			<button type="button" class="btn-primary" onclick={openPaperlessPicker}
				>Add from Paperless-ngx</button
			>
		{/if}
	</div>
</div>

<!-- Upload zone -->
<label
	class="upload-zone"
	class:upload-zone--dragging={isDragging}
	for="file-input"
	aria-label="Upload a file"
	ondragover={(e) => {
		e.preventDefault();
		isDragging = true;
	}}
	ondragleave={() => (isDragging = false)}
	ondrop={(e) => {
		e.preventDefault();
		isDragging = false;
		handleDrop(e);
	}}
>
	<div class="upload-zone-content">
		<span class="upload-zone-icon"
			>{@html `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>`}</span
		>
		<p class="upload-zone-title upload-zone-title--desktop">
			{$_('documents.dropHintDesktop')}
		</p>
		<p class="upload-zone-title upload-zone-title--mobile">{$_('documents.dropHintMobile')}</p>
		<p class="upload-zone-hint">{$_('documents.uploadHint')}</p>
	</div>
	<input
		id="file-input"
		type="file"
		name="file"
		accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
		class="upload-zone-input"
		onchange={handleFileSelect}
	/>
</label>

<!-- Filters -->
<div class="filters">
	<div class="search-box">
		<input
			type="text"
			placeholder={$_('documents.searchPlaceholder')}
			bind:value={searchQuery}
			oninput={onSearchInput}
			class="search-input"
		/>
	</div>
	<div class="filter-controls">
		{#snippet optionItem(val: string, label: string)}
			<option value={val}>{label}</option>
		{/snippet}

		<select bind:value={categoryFilter} onchange={applyFilters} class="filter-select">
			{@render optionItem('all', $_('documents.allTypes'))}

			<optgroup label="──────────"></optgroup>

			{#each Object.entries(docTypeLabels) as [val, label]}
				{@render optionItem(val, label)}
			{/each}
		</select>

		<select bind:value={sortBy} onchange={applyFilters} class="filter-select">
			<option value="newest">{$_('documents.sort.newest')}</option>
			<option value="oldest">{$_('documents.sort.oldest')}</option>
			<option value="name">{$_('documents.sort.name')}</option>
		</select>
		<div class="view-controls">
			<ViewToggle
				options={[
					{ value: 'timeline', label: $_('common.timeline') },
					{ value: 'table', label: $_('common.table') }
				]}
				value={viewMode}
				onchange={(v) => (viewMode = v as 'table' | 'timeline')}
			/>
			{#if viewMode === 'table'}
				<ColumnPicker columns={docColumns} visible={docColVis} onchange={(v) => (docColVis = v)} />
			{/if}
		</div>
	</div>
</div>

<!-- Document list -->
{#if data.docs.length === 0}
	<div class="empty">
		<span class="empty-icon"
			>{@html `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="32" height="32"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>`}</span
		>
		<p class="empty-title">{$_('documents.empty.title')}</p>
		<p class="empty-desc">{$_('documents.empty.description')}</p>
	</div>
{:else if viewMode === 'table'}
	<div class="doc-list">
		{#each data.docs as doc}
			{@const storageState = documentStorageState(doc)}
			<div
				id="doc-{doc.id}"
				class="doc-row"
				class:doc-row--expiring={isExpiringSoon(doc.expires_at)}
				class:doc-row--expired={isExpired(doc.expires_at)}
				class:doc-row--highlight={highlightId === doc.id}
			>
				<DocumentThumbnail
					documentId={doc.id}
					name={displayName(doc)}
					previewable={isBrowserPreviewable(doc.mime_type)}
				/>
				<div class="doc-info">
					{#if editingDocId === doc.id}
						<form method="POST" action="?/rename" use:enhance class="edit-name-form">
							<input type="hidden" name="id" value={doc.id} />
							<input type="text" name="name" bind:value={editingName} class="edit-name-input" />
							<button type="submit" class="edit-name-btn">Save</button>
							<button
								type="button"
								class="edit-name-btn edit-name-btn--cancel"
								onclick={cancelEditName}>Cancel</button
							>
						</form>
					{:else}
						<!-- svelte-ignore a11y_no_static_element_interactions -->
						<div class="doc-name" ondblclick={() => startEditName(doc.id, displayName(doc))}>
							{displayName(doc)}
						</div>
					{/if}
					<div class="doc-meta">
						{#if docColVis.type !== false}
							<span class="doc-type-tag">{docTypeLabels[doc.doc_type] ?? doc.doc_type}</span>
						{/if}
						{#if docColVis.size !== false}
							{#if docColVis.type !== false}<span class="sep">·</span>{/if}
							<span class="doc-meta-fixed">{formatSize(doc.size_bytes)}</span>
						{/if}
						{#if docColVis.date !== false}
							{#if docColVis.type !== false || docColVis.size !== false}<span class="sep">·</span
								>{/if}
							<span class="doc-meta-fixed">{formatDate(doc.created_at)}</span>
						{/if}
						{#if data.serviceLogMap?.[doc.id]}
							<span class="sep">·</span>
							<span class="doc-linked-badge"
								>{$_('documents.linkedBadge', {
									values: { date: formatDate(data.serviceLogMap[doc.id].performed_at) }
								})}</span
							>
						{/if}
						{#if data.travelMap?.[doc.id]}
							<span class="sep">·</span>
							<span class="doc-linked-badge"
								>{$_('documents.linkedTravelBadge', {
									values: { title: data.travelMap[doc.id].title }
								})}</span
							>
						{/if}
					</div>
					{#if doc.expires_at && docColVis.expiry !== false}
						<div class="doc-expiry">
							{isExpired(doc.expires_at)
								? $_('documents.expiryExpired')
								: isExpiringSoon(doc.expires_at)
									? $_('documents.expiryExpiringSoon')
									: $_('documents.expiryValid')} · {formatDate(doc.expires_at)}
						</div>
					{/if}
					<div class="doc-storage-state doc-storage-state--{storageState.tone}">
						<span>{storageState.label}</span>
						{#if storageState.detail}<small>{storageState.detail}</small>{/if}
					</div>
				</div>
				<div class="doc-actions">
					{#if isBrowserPreviewable(doc.mime_type)}
						<a
							href="/api/documents/{doc.id}/content"
							target="_blank"
							rel="noopener"
							aria-label="Preview {displayName(doc)} in a new browser tab"
							class="action-btn">Preview</a
						>
					{/if}
					<a
						href="/api/documents/{doc.id}/content?download=1"
						aria-label="Download {displayName(doc)}"
						class="action-btn">Download</a
					>
					{#if data.paperlessIntegrations.length > 0 && doc.storage_key && (doc.sync_status === 'none' || doc.sync_status === 'failed')}
						<button
							type="button"
							class="action-btn"
							disabled={syncingDocId === doc.id}
							onclick={() => requestPaperlessAction(doc, 'mirror')}>Copy to Paperless</button
						>
						<button
							type="button"
							class="action-btn"
							disabled={syncingDocId === doc.id}
							onclick={() => requestPaperlessAction(doc, 'move')}>Move to Paperless</button
						>
					{/if}
					<button
						type="button"
						class="action-btn"
						onclick={() => startEditName(doc.id, displayName(doc))}
						>{$_('documents.actions.rename')}</button
					>
					<button
						type="button"
						class="action-btn action-btn--danger"
						disabled={doc.sync_status === 'queued' || doc.sync_status === 'processing'}
						title={doc.sync_status === 'queued' || doc.sync_status === 'processing'
							? 'Wait for the Paperless transfer to finish before removing this document.'
							: 'Remove this document from MotoMate. Paperless files are never deleted.'}
						onclick={() => {
							deletingDoc = doc;
						}}>Remove from MotoMate</button
					>
				</div>
			</div>
		{/each}
	</div>
{:else}
	<div class="timeline">
		{#each Object.entries(timelineDocs()) as [month, docs]}
			<div class="timeline-month">
				<div class="month-label">{month}</div>
				<div class="month-divider"></div>
				{#each docs as doc}
					{@const storageState = documentStorageState(doc)}
					<div
						class="timeline-entry"
						class:timeline-entry--expiring={isExpiringSoon(doc.expires_at)}
						class:timeline-entry--expired={isExpired(doc.expires_at)}
					>
						<span class="entry-dot"></span>
						<DocumentThumbnail
							documentId={doc.id}
							name={displayName(doc)}
							previewable={isBrowserPreviewable(doc.mime_type)}
							compact
						/>
						<div class="entry-content">
							<div class="entry-title">{displayName(doc)}</div>
							<div class="entry-meta">
								{docTypeLabels[doc.doc_type] ?? doc.doc_type} · {formatSize(doc.size_bytes)} · {formatDate(
									doc.created_at
								)}
							</div>
							<div class="doc-storage-state doc-storage-state--{storageState.tone}">
								<span>{storageState.label}</span>
								{#if storageState.detail}<small>{storageState.detail}</small>{/if}
							</div>
						</div>
						<div class="entry-actions">
							{#if isBrowserPreviewable(doc.mime_type)}
								<a
									href="/api/documents/{doc.id}/content"
									target="_blank"
									rel="noopener"
									aria-label="Preview {displayName(doc)} in a new browser tab"
									class="action-btn">Preview</a
								>
							{/if}
							<a
								href="/api/documents/{doc.id}/content?download=1"
								aria-label="Download {displayName(doc)}"
								class="action-btn">Download</a
							>
							{#if data.paperlessIntegrations.length > 0 && doc.storage_key && (doc.sync_status === 'none' || doc.sync_status === 'failed')}
								<button
									type="button"
									class="action-btn"
									disabled={syncingDocId === doc.id}
									onclick={() => requestPaperlessAction(doc, 'mirror')}>Copy to Paperless</button
								>
								<button
									type="button"
									class="action-btn"
									disabled={syncingDocId === doc.id}
									onclick={() => requestPaperlessAction(doc, 'move')}>Move to Paperless</button
								>
							{/if}
							<button
								type="button"
								class="action-btn"
								onclick={() => startEditName(doc.id, displayName(doc))}>Rename</button
							>
							<button
								type="button"
								class="action-btn action-btn--danger"
								disabled={doc.sync_status === 'queued' || doc.sync_status === 'processing'}
								onclick={() => {
									deletingDoc = doc;
								}}>Remove from MotoMate</button
							>
						</div>
					</div>
				{/each}
			</div>
		{/each}
	</div>
{/if}

{#if totalPages > 1}
	<div class="pagination">
		<Button
			variant="secondary"
			size="sm"
			disabled={data.page <= 1}
			onclick={() => navTo(data.page - 1)}
		>
			{$_('documents.prevPage')}
		</Button>
		<span class="page-label">
			{$_('documents.pageOf', {
				values: { page: data.page, total: totalPages }
			})}
		</span>
		<Button
			variant="secondary"
			size="sm"
			disabled={data.page >= totalPages}
			onclick={() => navTo(data.page + 1)}
		>
			{$_('documents.nextPage')}
		</Button>
	</div>
{/if}

{#if deletingDoc}
	<ConfirmDialog
		open={true}
		title={`${deletingDoc.paperless_document_id != null ? 'Remove' : 'Delete'} ${displayName(deletingDoc)} from MotoMate?`}
		description={deleteDescription(deletingDoc)}
		confirmLabel={deletingDoc.paperless_document_id != null
			? 'Remove from MotoMate'
			: 'Delete from MotoMate'}
		cancelLabel="Keep document"
		danger={true}
		loading={false}
		onconfirm={() => {
			const form = document.createElement('form');
			form.method = 'POST';
			form.action = '?/delete';
			const idInput = document.createElement('input');
			idInput.type = 'hidden';
			idInput.name = 'id';
			idInput.value = deletingDoc!.id;
			form.appendChild(idInput);
			document.body.appendChild(form);
			form.submit();
		}}
		onclose={() => (deletingDoc = null)}
	/>
{/if}

{#if paperlessAction}
	<ConfirmDialog
		open={true}
		title={paperlessAction.mode === 'mirror'
			? 'Copy this document to Paperless-ngx?'
			: 'Move this document to Paperless-ngx?'}
		description={paperlessAction.mode === 'mirror'
			? 'MotoMate will upload a one-time copy to Paperless-ngx. The original file will stay in MotoMate; later changes are not automatically synchronized.'
			: 'MotoMate will upload the file to Paperless-ngx. Only after Paperless confirms it was saved will MotoMate delete its local file. The document will stay linked here and can still be opened from Paperless.'}
		confirmLabel={paperlessAction.mode === 'mirror' ? 'Copy to Paperless' : 'Move to Paperless'}
		cancelLabel="Cancel"
		danger={paperlessAction.mode === 'move'}
		loading={syncingDocId === paperlessAction.document.id}
		onconfirm={confirmPaperlessAction}
		onclose={() => (paperlessAction = null)}
	/>
{/if}

<style>
	.page-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--space-4);
		flex-wrap: wrap;
		margin-bottom: var(--space-6);
	}
	.page-header-text {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}
	.section-title {
		font-size: var(--text-lg);
		font-weight: 600;
		color: var(--text);
		margin: 0;
	}
	.page-sub {
		font-size: var(--text-sm);
		color: var(--text-muted);
		margin: 0;
	}

	/* Upload zone */
	.upload-zone {
		display: block;
		border: 2px dashed var(--border);
		border-radius: 10px;
		padding: var(--space-6) var(--space-4);
		text-align: center;
		background: var(--bg-subtle);
		cursor: pointer;
		transition:
			border-color 0.15s,
			background 0.15s;
		margin-bottom: var(--space-5);
	}
	.upload-zone--dragging {
		border-color: var(--accent);
		background: color-mix(in srgb, var(--accent) 8%, var(--bg-subtle));
	}
	.upload-zone-content {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-2);
		width: 100%;
	}
	.upload-zone-icon {
		width: 32px;
		height: 32px;
		color: var(--text-muted);
	}
	.upload-zone-title {
		font-size: var(--text-base);
		color: var(--text-muted);
		margin: 0;
	}
	.upload-zone-title--mobile {
		display: none;
	}
	@media (hover: none) and (pointer: coarse) {
		.upload-zone-title--desktop {
			display: none;
		}
		.upload-zone-title--mobile {
			display: block;
		}
	}
	.upload-zone-hint {
		font-size: var(--text-xs);
		color: var(--text-subtle);
		margin: 0;
	}
	.upload-zone-input {
		display: none;
	}

	.btn-primary {
		padding: 0.5rem 1rem;
		min-height: 44px;
		background: var(--accent);
		color: #fff;
		border: none;
		border-radius: 10px;
		font-size: var(--text-sm);
		font-weight: 500;
		cursor: pointer;
	}
	.btn-primary:hover {
		background: var(--accent-hover);
	}
	.btn-primary:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}
	/* Filters */
	.filters {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-3);
		margin: var(--space-6) 0 var(--space-5);
		align-items: center;
	}
	.search-box {
		flex: 1;
		min-width: 200px;
	}
	.search-input {
		width: 100%;
		padding: 0.5rem 0.75rem;
		border: 1px solid var(--border);
		border-radius: 8px;
		background: var(--bg-subtle);
		color: var(--text);
		font-size: var(--text-sm);
		min-height: 40px;
	}
	.search-input:focus {
		outline: 2px solid var(--accent);
		outline-offset: 1px;
		border-color: transparent;
	}
	.filter-controls {
		display: flex;
		gap: var(--space-2);
		flex-wrap: wrap;
		align-items: center;
	}

	.filter-select {
		padding: 0.375rem 0.625rem;
		border: 1px solid var(--border);
		border-radius: 8px;
		background: var(--bg-subtle);
		color: var(--text);
		font-size: var(--text-sm);
		cursor: pointer;
		min-height: 40px;
		box-sizing: border-box;
	}

	.filter-select:focus {
		outline: 2px solid var(--accent);
		outline-offset: -1px;
	}
	optgroup {
		font-size: 10px;
		color: var(--text-muted);
		text-align: center;
		background: var(--bg-subtle);
	}
	optgroup[label] {
		font-weight: normal;
		font-style: normal;
	}
	.view-controls {
		display: flex;
		gap: var(--space-2);
		align-items: center;
	}

	/* Document list */
	.doc-list {
		display: flex;
		flex-direction: column;
	}
	.doc-row {
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 1rem 0 1rem var(--space-2);
		border-bottom: 1px solid var(--border);
		border-left: 3px solid transparent;
		transition: background 0.15s ease-out-quart;
	}
	.doc-row:first-child {
		border-top: 1px solid var(--border);
	}
	.doc-row:hover {
		background: var(--bg-subtle);
	}
	.doc-row--expiring {
		border-left-color: var(--status-due);
	}
	.doc-row--expired {
		border-left-color: var(--status-overdue);
	}
	.doc-row--highlight {
		background: var(--accent-subtle);
		border-left-color: var(--accent);
		animation: highlight-fade 2.5s ease forwards;
	}
	@keyframes highlight-fade {
		0% {
			background: var(--accent-subtle);
		}
		100% {
			background: var(--bg);
		}
	}

	.doc-info {
		flex: 1;
		min-width: 0;
	}
	.doc-name {
		font-size: var(--text-base);
		font-weight: 500;
		color: var(--text);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		cursor: pointer;
	}
	.doc-meta {
		display: flex;
		flex-wrap: nowrap;
		gap: 0.25rem;
		align-items: center;
		font-size: var(--text-sm);
		color: var(--text-muted);
		margin-top: 0.25rem;
		min-width: 0;
		overflow: hidden;
	}
	.sep {
		color: var(--text-subtle);
		flex-shrink: 0;
	}
	.doc-type-tag {
		background: var(--bg-muted);
		border: 1px solid var(--border);
		border-radius: 4px;
		padding: 0.0625rem 0.375rem;
		font-size: var(--text-xs);
		flex-shrink: 0;
	}
	.doc-meta-fixed {
		flex-shrink: 0;
		white-space: nowrap;
	}
	.doc-linked-badge {
		font-size: var(--text-xs);
		color: var(--text-muted);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		min-width: 0;
	}
	.doc-expiry {
		font-size: var(--text-xs);
		margin-top: 0.25rem;
		color: var(--status-ok);
	}
	.doc-storage-state {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.125rem;
		width: fit-content;
		max-width: 100%;
		margin-top: 0.45rem;
		padding: 0.2rem 0.5rem;
		border: 1px solid var(--border);
		border-radius: 999px;
		font-size: var(--text-xs);
		line-height: 1.35;
		color: var(--text-muted);
		background: var(--bg-subtle);
	}
	.doc-storage-state small {
		font-size: inherit;
		color: inherit;
		white-space: normal;
	}
	.doc-storage-state:has(small) {
		border-radius: 8px;
	}
	.doc-storage-state--both,
	.doc-storage-state--paperless {
		color: var(--status-ok);
		border-color: color-mix(in srgb, var(--status-ok) 35%, var(--border));
	}
	.doc-storage-state--progress {
		color: var(--accent);
		border-color: color-mix(in srgb, var(--accent) 35%, var(--border));
	}
	.doc-storage-state--error {
		color: var(--status-overdue);
		border-color: color-mix(in srgb, var(--status-overdue) 40%, var(--border));
	}
	.doc-row--expiring .doc-expiry {
		color: var(--status-due);
	}
	.doc-row--expired .doc-expiry {
		color: var(--status-overdue);
	}

	.doc-actions {
		display: flex;
		gap: 0.375rem;
		flex-shrink: 0;
		flex-wrap: wrap;
		justify-content: flex-end;
		max-width: 28rem;
	}
	.action-btn {
		font-size: var(--text-xs);
		padding: 0.375rem 0.625rem;
		border-radius: 6px;
		background: none;
		border: 1px solid var(--border);
		cursor: pointer;
		color: var(--text-muted);
		text-decoration: none;
		white-space: nowrap;
		display: inline-flex;
		align-items: center;
		justify-content: center;
	}
	.action-btn:hover {
		background: var(--bg-muted);
	}
	.action-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	.action-btn--danger:hover {
		color: var(--status-overdue);
		border-color: var(--status-overdue);
	}

	/* Timeline view */
	.timeline {
		display: flex;
		flex-direction: column;
		border-left: 2px solid var(--border);
		margin-left: 0.375rem;
		padding-left: 1.25rem;
	}
	.timeline-month {
		padding: var(--space-3) 0;
	}
	.timeline-month:first-child {
		padding-top: 0;
	}
	.month-label {
		font-size: var(--text-xs);
		font-weight: 600;
		color: var(--text-muted);
		text-transform: uppercase;
		letter-spacing: 0.07em;
		margin-bottom: var(--space-2);
	}
	.timeline-entry {
		display: flex;
		align-items: flex-start;
		gap: var(--space-3);
		padding: var(--space-3) 0;
		position: relative;
		transition: background 0.15s ease-out-quart;
	}
	.timeline-entry:hover {
		background: var(--bg-subtle);
	}
	.timeline-entry--expiring .entry-dot {
		background: var(--status-due);
		box-shadow: 0 0 0 3px color-mix(in srgb, var(--status-due) 20%, transparent);
	}
	.timeline-entry--expired .entry-dot {
		background: var(--status-overdue);
		box-shadow: 0 0 0 3px color-mix(in srgb, var(--status-overdue) 20%, transparent);
	}
	.entry-dot {
		position: absolute;
		left: calc(-1.25rem - 5px);
		top: calc(var(--space-3) + 0.375rem);
		width: 10px;
		height: 10px;
		border-radius: 50%;
		background: var(--bg);
		border: 2.5px solid var(--text-subtle);
		flex-shrink: 0;
		z-index: 1;
		transition:
			transform 0.15s,
			border-color 0.15s,
			box-shadow 0.15s;
	}
	.timeline-entry:first-child .entry-dot {
		border-color: var(--accent);
	}
	.timeline-entry:hover .entry-dot {
		transform: scale(1.2);
		border-color: var(--text);
	}
	.entry-content {
		flex: 1;
		min-width: 0;
	}
	.entry-title {
		font-size: var(--text-base);
		font-weight: 500;
		color: var(--text);
	}
	.entry-meta {
		font-size: var(--text-sm);
		color: var(--text-muted);
		margin-top: 0.125rem;
	}
	.entry-actions {
		display: flex;
		gap: 0.25rem;
		flex-shrink: 0;
	}

	/* Empty state */
	.empty {
		display: flex;
		flex-direction: column;
		align-items: center;
		text-align: center;
		padding: 3rem 1.5rem;
	}
	.empty-icon {
		font-size: 2rem;
		margin-bottom: 1rem;
		opacity: 0.5;
	}
	.empty-title {
		font-size: var(--text-lg);
		font-weight: 600;
		color: var(--text);
		margin: 0 0 0.5rem;
	}
	.empty-desc {
		font-size: var(--text-sm);
		color: var(--text-muted);
		margin: 0;
		line-height: var(--leading-base);
	}

	/* Edit name form */
	.edit-name-form {
		display: flex;
		gap: 0.375rem;
		align-items: center;
		min-height: 1.5rem;
		flex-wrap: wrap;
	}
	.edit-name-input {
		padding: 0.375rem 0.5rem;
		border: 1px solid var(--accent);
		border-radius: 4px;
		font-size: max(var(--text-base), 16px);
		font-weight: 500;
		background: var(--bg);
		color: var(--text);
		flex: 1;
		min-width: 120px;
	}
	.edit-name-input:focus {
		outline: 2px solid var(--accent);
		outline-offset: 1px;
	}
	.edit-name-btn {
		padding: 0.125rem 0.375rem;
		border-radius: 4px;
		font-size: var(--text-xs);
		font-weight: 500;
		cursor: pointer;
		background: var(--accent);
		color: #fff;
		border: none;
		white-space: nowrap;
	}
	.edit-name-btn--cancel {
		background: var(--bg-muted);
		color: var(--text-muted);
	}
	.edit-name-btn--cancel:hover {
		background: var(--border);
	}

	.doc-name {
		font-size: var(--text-base);
		font-weight: 500;
		color: var(--text);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		cursor: pointer;
		line-height: 1.5;
	}
	.edit-name-input {
		padding: 0.25rem 0.5rem;
		border: 1px solid var(--accent);
		border-radius: 4px;
		font-size: var(--text-base);
		background: var(--bg);
		color: var(--text);
		width: 200px;
	}
	.edit-name-input:focus {
		outline: 2px solid var(--accent);
		outline-offset: 1px;
	}
	.edit-name-btn {
		padding: 0.25rem 0.5rem;
		border-radius: 4px;
		font-size: var(--text-xs);
		cursor: pointer;
		background: var(--accent);
		color: #fff;
		border: none;
	}
	.edit-name-btn--cancel {
		background: var(--bg-muted);
		color: var(--text-muted);
	}

	.doc-name {
		cursor: text;
	}

	/* Pagination */
	.pagination {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: var(--space-4);
		padding: var(--space-6) 0 var(--space-2);
	}
	.page-label {
		font-size: var(--text-sm);
		color: var(--text-muted);
		font-family: var(--font-mono);
		font-variant-numeric: tabular-nums;
	}

	@media (max-width: 640px) {
		.doc-meta {
			flex-wrap: wrap;
			overflow: visible;
		}
		.filters {
			flex-direction: column;
			align-items: stretch;
		}
		.search-box {
			min-width: 0;
		}
		.filter-controls {
			width: 100%;
			display: grid;
			grid-template-columns: 1fr 1fr auto;
			gap: 0.5rem;
			flex-wrap: nowrap !important;
		}
		.filter-select {
			min-height: 44px;
			width: 100%;
		}
		.view-controls {
			display: flex;
			align-items: center;
			gap: var(--space-2);
		}
		.doc-row {
			align-items: flex-start;
			flex-wrap: wrap;
		}
		.doc-info {
			flex-basis: calc(100% - 3rem);
		}
		.doc-actions {
			flex-basis: 100%;
			margin-top: 0.5rem;
			justify-content: flex-start;
			max-width: none;
		}
		.action-btn {
			padding: 0.5rem 0.75rem;
			min-height: 40px;
		}
	}
</style>
