<script lang="ts">
	import { untrack } from 'svelte';
	import { enhance } from '$app/forms';
	import { goto, beforeNavigate } from '$app/navigation';
	import { tick } from 'svelte';
	import { page } from '$app/stores';
	import type { PageData } from './$types';
	import ConfirmDialog from '$lib/components/ui/ConfirmDialog.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { toasts } from '$lib/stores/toasts.js';
	import { _, waitLocale } from '$lib/i18n';

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

	let isDragging = $state(false);
	let selectedFile = $state<File | null>(null);
	let showForm = $state(false);
	let uploading = $state(false);

	let deletingDoc = $state<{ id: string; name: string; storage_key: string } | null>(null);

	let searchQuery = $state('');
	let categoryFilter = $state<string>('all');
	let sortBy = $state<'newest' | 'oldest' | 'name'>(
		untrack(() => data.page_prefs?.sortBy ?? 'newest')
	);
	let viewMode = $state<'list' | 'timeline'>(untrack(() => data.page_prefs?.viewMode ?? 'list'));

	// Persist sort + view preferences
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
		if (_firstRun) {
			_firstRun = false;
			return;
		}
		_pendingPrefs = { sortBy: s, viewMode: v };
		clearTimeout(_prefTimer);
		_prefTimer = setTimeout(flushPrefs, 600);
	});
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

	const fileIconSvg = (mimeType: string) => {
		if (mimeType.startsWith('image/'))
			return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>`;
		if (mimeType === 'application/pdf')
			return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M10 12h4"/><path d="M10 16h4"/></svg>`;
		return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>`;
	};

	function handleDrop(e: DragEvent) {
		const file = e.dataTransfer?.files[0];
		if (file) {
			selectedFile = file;
			showForm = true;
		}
	}

	function handleFileSelect(e: Event) {
		const file = (e.target as HTMLInputElement).files?.[0];
		if (file) {
			selectedFile = file;
			showForm = true;
		}
	}

	function cancelUpload() {
		showForm = false;
		selectedFile = null;
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
		const u = new URL($page.url);
		u.searchParams.set('page', String(p));
		goto(u.toString(), { replaceState: false });
	}

	const highlightId = $derived($page.url.searchParams.get('highlight') ?? null);

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

	const filteredDocs = $derived(() => {
		let docs = [...data.docs];

		if (searchQuery) {
			const q = searchQuery.toLowerCase();
			docs = docs.filter((d) => d.name.toLowerCase().includes(q));
		}

		if (categoryFilter !== 'all') {
			docs = docs.filter((d) => d.doc_type === categoryFilter);
		}

		docs.sort((a, b) => {
			if (sortBy === 'newest')
				return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
			if (sortBy === 'oldest')
				return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
			return a.name.localeCompare(b.name);
		});

		return docs;
	});

	const timelineDocs = $derived(() => {
		const docs = filteredDocs();
		const grouped: Record<string, typeof docs> = {};
		for (const doc of docs) {
			const month = formatYearMonth(doc.created_at);
			if (!grouped[month]) grouped[month] = [];
			grouped[month].push(doc);
		}
		return grouped;
	});

	$effect(() => {
		if (form?.uploaded) {
			showForm = false;
			selectedFile = null;
			toasts.success($_('documents.toasts.uploaded'));
		}
		if (form?.renamed) {
			editingDocId = null;
			editingName = '';
			toasts.success($_('documents.toasts.renamed'));
		}
		if (form?.deleted) {
			toasts.success($_('documents.toasts.deleted'));
		}
		if (form?.error) {
			toasts.error(String(form.error));
		}
	});
</script>

<svelte:head><title>{$_('documents.title')} · {data.vehicle.name}</title></svelte:head>

<div class="page-header">
	<div class="page-header-text">
		<h2 class="section-title">{$_('documents.title')}</h2>
		<p class="page-sub">{$_('documents.subtitle')}</p>
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

<!-- Upload form -->
{#if showForm}
	<form
		method="POST"
		action="?/upload"
		enctype="multipart/form-data"
		class="upload-form"
		use:enhance={({ formData, cancel }) => {
			if (!selectedFile) {
				cancel();
				return;
			}
			formData.set('file', selectedFile);
			uploading = true;
			return async ({ update }) => {
				await update();
				uploading = false;
			};
		}}
	>
		<div class="file-chip">
			<span class="file-chip-name">{selectedFile?.name ?? $_('documents.selectedFile')}</span>
			<button
				type="button"
				class="file-chip-remove"
				onclick={cancelUpload}
				aria-label="Remove file"
			>
				<svg
					width="16"
					height="16"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"><path d="M18 6L6 18M6 6l12 12" /></svg
				>
			</button>
		</div>

		<div class="form-group">
			<label for="doc-name" class="field-label">{$_('documents.summary')}</label>
			<input
				type="text"
				id="doc-name"
				name="name"
				placeholder={$_('documents.summaryPlaceholder')}
				maxlength="200"
				class="input"
				required
			/>
		</div>

		<div class="form-row">
			<div class="field">
				<label for="doc-type" class="field-label">{$_('documents.category')}</label>
				<select id="doc-type" name="doc_type" class="input">
					<option value="service" selected>{$_('documents.types.service')}</option>
					<option value="quotation">{$_('documents.types.quotation')}</option>
					<option value="papers">{$_('documents.types.papers')}</option>
					<option value="photo">{$_('documents.types.photo')}</option>
					<option value="notes">{$_('documents.types.notes')}</option>
					<option value="other">{$_('documents.types.other')}</option>
				</select>
			</div>

			<div class="field">
				<label for="expires-at" class="field-label">
					{$_('documents.expiry')} <span class="label-hint">{$_('documents.expiryOptional')}</span>
				</label>
				<input type="date" id="expires-at" name="expires_at" class="input" />
			</div>
		</div>

		<div class="form-actions">
			<button type="submit" class="btn-primary" disabled={uploading}
				>{uploading ? $_('documents.saving') : $_('documents.saveDocument')}</button
			>
			<button type="button" class="btn-cancel" disabled={uploading} onclick={cancelUpload}
				>{$_('documents.cancel')}</button
			>
		</div>
	</form>
{/if}

<!-- Filters -->
<div class="filters">
	<div class="search-box">
		<input
			type="text"
			placeholder={$_('documents.searchPlaceholder')}
			bind:value={searchQuery}
			class="search-input"
		/>
	</div>
	<div class="filter-controls">
		{#snippet optionItem(val: string, label: string)}
			<option value={val}>{label}</option>
		{/snippet}

		<select bind:value={categoryFilter} class="filter-select">
			{@render optionItem('all', $_('documents.allTypes'))}

			<optgroup label="──────────"></optgroup>

			{#each Object.entries(docTypeLabels) as [val, label]}
				{@render optionItem(val, label)}
			{/each}
		</select>

		<select bind:value={sortBy} class="filter-select">
			<option value="newest">{$_('documents.sort.newest')}</option>
			<option value="oldest">{$_('documents.sort.oldest')}</option>
			<option value="name">{$_('documents.sort.name')}</option>
		</select>
		<div class="view-toggle">
			<button
				class="view-btn"
				class:view-btn--active={viewMode === 'list'}
				onclick={() => (viewMode = 'list')}>{$_('documents.view.list')}</button
			>
			<button
				class="view-btn"
				class:view-btn--active={viewMode === 'timeline'}
				onclick={() => (viewMode = 'timeline')}>{$_('documents.view.timeline')}</button
			>
		</div>
	</div>
</div>

<!-- Document list -->
{#if filteredDocs().length === 0}
	<div class="empty">
		<span class="empty-icon"
			>{@html `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="32" height="32"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>`}</span
		>
		<p class="empty-title">{$_('documents.empty.title')}</p>
		<p class="empty-desc">{$_('documents.empty.description')}</p>
	</div>
{:else if viewMode === 'list'}
	<div class="doc-list">
		{#each filteredDocs() as doc}
			<div
				id="doc-{doc.id}"
				class="doc-row"
				class:doc-row--expiring={isExpiringSoon(doc.expires_at)}
				class:doc-row--expired={isExpired(doc.expires_at)}
				class:doc-row--highlight={highlightId === doc.id}
			>
				<div class="doc-icon">{@html fileIconSvg(doc.mime_type)}</div>
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
						<span class="doc-type-tag">{docTypeLabels[doc.doc_type] ?? doc.doc_type}</span>
						<span class="sep">·</span>
						<span class="doc-meta-fixed">{formatSize(doc.size_bytes)}</span>
						<span class="sep">·</span>
						<span class="doc-meta-fixed">{formatDate(doc.created_at)}</span>
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
					{#if doc.expires_at}
						<div class="doc-expiry">
							{isExpired(doc.expires_at)
								? $_('documents.expiryExpired')
								: isExpiringSoon(doc.expires_at)
									? $_('documents.expiryExpiringSoon')
									: $_('documents.expiryValid')} · {formatDate(doc.expires_at)}
						</div>
					{/if}
				</div>
				<div class="doc-actions">
					<a
						href="/api/files?key={doc.storage_key}"
						target="_blank"
						rel="noopener"
						class="action-btn">{$_('documents.actions.view')}</a
					>
					<button
						type="button"
						class="action-btn"
						onclick={() => startEditName(doc.id, displayName(doc))}
						>{$_('documents.actions.rename')}</button
					>
					<button
						type="button"
						class="action-btn action-btn--danger"
						onclick={() => {
							deletingDoc = { id: doc.id, name: doc.name, storage_key: doc.storage_key };
						}}>{$_('documents.actions.delete')}</button
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
					<div
						class="timeline-entry"
						class:timeline-entry--expiring={isExpiringSoon(doc.expires_at)}
						class:timeline-entry--expired={isExpired(doc.expires_at)}
					>
						<span class="entry-dot"></span>
						<div class="entry-content">
							<div class="entry-title">{displayName(doc)}</div>
							<div class="entry-meta">
								{docTypeLabels[doc.doc_type] ?? doc.doc_type} · {formatSize(doc.size_bytes)} · {formatDate(
									doc.created_at
								)}
							</div>
						</div>
						<div class="entry-actions">
							<a
								href="/api/files?key={doc.storage_key}"
								target="_blank"
								rel="noopener"
								class="action-btn">{$_('documents.actions.view')}</a
							>
							<button
								type="button"
								class="action-btn action-btn--danger"
								onclick={() => {
									deletingDoc = { id: doc.id, name: doc.name, storage_key: doc.storage_key };
								}}>{$_('documents.actions.delete')}</button
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
		title={$_('documents.deleteDialog.title', { values: { name: deletingDoc.name } })}
		description={$_('documents.deleteDialog.description')}
		confirmLabel={$_('documents.deleteDialog.confirm')}
		cancelLabel={$_('documents.deleteDialog.cancel')}
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
			const keyInput = document.createElement('input');
			keyInput.type = 'hidden';
			keyInput.name = 'storage_key';
			keyInput.value = deletingDoc!.storage_key;
			form.appendChild(idInput);
			form.appendChild(keyInput);
			document.body.appendChild(form);
			form.submit();
		}}
		onclose={() => (deletingDoc = null)}
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

	/* Upload form */
	.upload-form {
		border: 1px solid var(--border);
		border-radius: 10px;
		padding: var(--space-5);
		margin-bottom: var(--space-5);
		background: var(--bg-subtle);
	}

	/* File chip */
	.file-chip {
		display: flex;
		align-items: center;
		justify-content: space-between;
		background: var(--bg-muted);
		padding: 0.75rem 1rem;
		border-radius: 8px;
		margin-bottom: 1.25rem;
		border: 1px solid var(--border);
	}
	.file-chip-name {
		flex: 1;
		font-size: var(--text-sm);
		color: var(--text);
		font-weight: 500;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.file-chip-remove {
		background: none;
		border: none;
		cursor: pointer;
		color: var(--text-subtle);
		padding: 0.25rem;
		line-height: 1;
		border-radius: 4px;
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.file-chip-remove:hover {
		background: var(--border);
		color: var(--text);
	}

	.form-row {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: var(--space-3);
		margin-bottom: var(--space-4);
	}
	@media (max-width: 640px) {
		.form-row {
			grid-template-columns: 1fr;
		}
	}

	.form-group {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		margin-bottom: var(--space-3);
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
	.label-hint {
		font-weight: 400;
		color: var(--text-subtle);
		font-size: var(--text-xs);
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
		margin-top: var(--space-4);
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
	.btn-primary:hover {
		background: var(--accent-hover);
	}
	.btn-primary:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}
	.btn-cancel {
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
	.btn-cancel:hover {
		background: var(--bg-muted);
		color: var(--text);
	}
	.btn-cancel:disabled {
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
	.view-toggle {
		display: flex;
		border: 1px solid var(--border);
		border-radius: 8px;
		overflow: hidden;
	}
	.view-btn {
		padding: 0.375rem 0.625rem;
		min-height: 40px;
		background: var(--bg-subtle);
		border: none;
		font-size: var(--text-sm);
		color: var(--text-muted);
		cursor: pointer;
	}
	.view-btn--active {
		background: var(--accent);
		color: #fff;
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

	.doc-icon {
		font-size: 1.25rem;
		flex-shrink: 0;
		margin-top: 0.125rem;
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
			grid-template-columns: 1fr 1fr 1fr;
			gap: 0.5rem;
			flex-wrap: nowrap !important;
		}
		.filter-select {
			min-height: 44px;
			width: 100%;
		}
		.view-toggle {
			display: flex;
		}
		.view-toggle button {
			min-height: 44px;
			padding: 0.5rem 0.75rem;
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
		}
		.action-btn {
			padding: 0.5rem 0.75rem;
			min-height: 40px;
		}
	}
</style>
