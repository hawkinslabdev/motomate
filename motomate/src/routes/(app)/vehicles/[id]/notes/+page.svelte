<script lang="ts">
	import { untrack } from 'svelte';
	import { beforeNavigate } from '$app/navigation';
	import { _, waitLocale } from '$lib/i18n';
	import { formatYearMonth } from '$lib/utils/format.js';
	import { sheet } from '$lib/stores/sheet.svelte.js';
	import { toasts } from '$lib/stores/toasts.svelte.js';
	import { createPrefsSync } from '$lib/utils/prefs-sync.js';
	import type { PageData } from './$types';
	import VehicleNoteForm from '$lib/components/vehicle/VehicleNoteForm.svelte';
	import ConfirmDialog from '$lib/components/ui/ConfirmDialog.svelte';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import ViewToggle from '$lib/components/ui/ViewToggle.svelte';
	import ColumnPicker from '$lib/components/ui/ColumnPicker.svelte';

	let { data, form }: { data: PageData; form: Record<string, unknown> | null } = $props();

	$effect(() => {
		waitLocale();
	});

	$effect(() => {
		const f = form;
		untrack(() => {
			if ((f as any)?.success) {
				toasts.success($_('vehicle.notes.saved'));
			}
		});
	});

	const defaultColVis = { excerpt: true, date: true, documents: true };

	let deletingId = $state<string | null>(null);
	let searchQuery = $state('');
	let sortBy = $state<'newest' | 'oldest' | 'name'>(
		untrack(() => data.page_prefs?.sortBy ?? 'newest')
	);
	let notesViewMode = $state<'timeline' | 'table'>(
		untrack(() => data.page_prefs?.viewMode ?? 'timeline')
	);
	let notesColumnVisible = $state<Record<string, boolean>>(
		untrack(() => data.page_prefs?.columnVisibility ?? defaultColVis)
	);

	const prefsSync = createPrefsSync('notes');
	let _firstRun = true;

	beforeNavigate(() => prefsSync.flush());

	$effect(() => {
		const s = sortBy;
		const v = notesViewMode;
		const c = notesColumnVisible;
		if (_firstRun) {
			_firstRun = false;
			return;
		}
		prefsSync.schedule({ sortBy: s, viewMode: v, columnVisibility: c });
	});

	function openNewNote() {
		sheet.openSheet(
			VehicleNoteForm,
			$_('vehicle.notes.new'),
			{
				vehicleId: data.vehicle.id,
				allDocs: data.docList ?? []
			},
			true
		);
	}

	function openViewNote(note: (typeof data.notes)[number]) {
		sheet.openSheet(
			VehicleNoteForm,
			note.title || $_('vehicle.notes.untitled'),
			{
				vehicleId: data.vehicle.id,
				allDocs: data.docList ?? [],
				viewMode: true,
				editData: {
					id: note.id,
					title: note.title,
					content: note.content,
					doc_refs: parseDocRefs(note.doc_refs)
				}
			},
			true
		);
	}

	function openEditNote(note: (typeof data.notes)[number]) {
		sheet.openSheet(
			VehicleNoteForm,
			$_('vehicle.notes.edit'),
			{
				vehicleId: data.vehicle.id,
				allDocs: data.docList ?? [],
				editData: {
					id: note.id,
					title: note.title,
					content: note.content,
					doc_refs: parseDocRefs(note.doc_refs)
				}
			},
			true
		);
	}

	function parseDocRefs(raw: unknown): string[] {
		if (Array.isArray(raw)) return raw as string[];
		if (typeof raw === 'string') {
			try {
				return JSON.parse(raw);
			} catch {
				return [];
			}
		}
		return [];
	}

	function noteExcerpt(content: string): string {
		const plain = content
			.replace(/\\$/gm, '')
			.replace(/\\([\\`*_{}[\]()#+\-.!])/g, '$1')
			.replace(/#{1,6}\s+/g, '')
			.replace(/\*{1,2}([^*]+)\*{1,2}/g, '$1')
			.replace(/_{1,2}([^_]+)_{1,2}/g, '$1')
			.replace(/`[^`]+`/g, '')
			.replace(/!\[[^\]]*\]\([^)]*\)/g, '')
			.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
			.replace(/^>\s*/gm, '')
			.replace(/^[-*+]\s+/gm, '')
			.trim();
		const first = plain.split('\n').find((l) => l.trim().length > 0) ?? '';
		return first.length > 120 ? first.slice(0, 120) + '…' : first;
	}

	function formatDate(iso: string): string {
		return new Date(iso).toLocaleDateString(data.user?.settings?.locale ?? 'en', {
			year: 'numeric',
			month: 'short',
			day: 'numeric'
		});
	}

	function resolvedDocRefs(note: (typeof data.notes)[number]) {
		const refs = parseDocRefs(note.doc_refs);
		if (!refs.length) return [];
		const map = new Map((data.docList ?? []).map((d) => [d.id, d]));
		return refs.map((id) => map.get(id)).filter(Boolean) as (typeof data.docList)[number][];
	}

	const locale = $derived(data.user?.settings?.locale ?? 'en');

	const filteredSortedNotes = $derived.by(() => {
		let list = [...data.notes];
		const q = searchQuery.trim().toLowerCase();
		if (q) {
			list = list.filter((n) => {
				const title = (n.title ?? '').toLowerCase();
				const excerpt = noteExcerpt(n.content).toLowerCase();
				return title.includes(q) || excerpt.includes(q);
			});
		}
		if (sortBy === 'newest') list.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
		else if (sortBy === 'oldest') list.sort((a, b) => a.updated_at.localeCompare(b.updated_at));
		else if (sortBy === 'name') list.sort((a, b) => (a.title ?? '').localeCompare(b.title ?? ''));
		return list;
	});

	const notesGrouped = $derived.by(() => {
		const map = new Map<string, typeof filteredSortedNotes>();
		for (const note of filteredSortedNotes) {
			const key = note.updated_at.slice(0, 7);
			if (!map.has(key)) map.set(key, []);
			map.get(key)!.push(note);
		}
		return [...map.entries()];
	});
</script>

<svelte:head
	><title
		>{$_('vehicle.notes.pageTitle', { values: { name: data.vehicle.name } })} · {$_(
			'layout.brand'
		)}</title
	></svelte:head
>

<div class="page-header">
	<div class="page-header-text">
		<h2 class="section-title">{$_('vehicle.notes.title')}</h2>
		<p class="section-sub">{$_('vehicle.notes.subtitle')}</p>
	</div>
	<div class="page-actions">
		<button class="btn-primary" onclick={openNewNote}>
			+ {$_('common.add')}
		</button>
	</div>
</div>

{#if data.notes.length === 0}
	<EmptyState
		icon="📝"
		title={$_('vehicle.notes.empty.title')}
		description={$_('vehicle.notes.empty.desc')}
	/>
{:else}
	<div class="filters">
		<div class="search-box">
			<input
				type="text"
				class="search-input"
				placeholder={$_('vehicle.notes.searchPlaceholder')}
				bind:value={searchQuery}
			/>
		</div>
		<div class="filter-controls">
			<select class="filter-select" bind:value={sortBy}>
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
					value={notesViewMode}
					onchange={(v) => (notesViewMode = v as 'timeline' | 'table')}
				/>
				{#if notesViewMode === 'table'}
					<ColumnPicker
						columns={[
							{ key: 'excerpt', label: $_('vehicle.notes.col.excerpt'), hideable: true },
							{ key: 'date', label: $_('finance.col.date'), hideable: true },
							{ key: 'documents', label: $_('documents.title'), hideable: true }
						]}
						visible={notesColumnVisible}
						onchange={(v) => (notesColumnVisible = v)}
					/>
				{/if}
			</div>
		</div>
	</div>

	{#if notesViewMode === 'timeline'}
		<div class="notes-list">
			{#each notesGrouped as [yearMonth, groupNotes]}
				<div class="timeline-month">
					<div class="timeline-month-label">
						<span class="timeline-month-name">{formatYearMonth(yearMonth, locale)}</span>
						<span class="timeline-month-line"></span>
					</div>
					{#each groupNotes as note (note.id)}
						{@const docs = resolvedDocRefs(note)}
						<div class="note-card">
							<div
								class="note-body"
								role="button"
								tabindex="0"
								onclick={() => openViewNote(note)}
								onkeydown={(e) => e.key === 'Enter' && openViewNote(note)}
							>
								<div class="note-title">
									{note.title || $_('vehicle.notes.untitled')}
								</div>
								{#if noteExcerpt(note.content)}
									<div class="note-excerpt">{noteExcerpt(note.content)}</div>
								{/if}
								{#if docs.length > 0}
									<div class="note-doc-refs">
										{#each docs as doc}
											<a
												href="/api/files?key={doc.storage_key}"
												target="_blank"
												rel="noopener noreferrer"
												class="doc-chip"
												onclick={(e) => e.stopPropagation()}
											>
												<span class="doc-chip-type">{$_('documents.types.' + doc.doc_type)}</span>
												<span class="doc-chip-name">{doc.title || doc.name}</span>
											</a>
										{/each}
									</div>
								{/if}
							</div>
							<div class="note-meta">
								<span class="note-date">{formatDate(note.updated_at)}</span>
								<div class="note-actions">
									<button
										type="button"
										class="note-action-btn"
										onclick={() => openEditNote(note)}
										aria-label={$_('common.edit')}
									>
										{$_('common.edit')}
									</button>
									<button
										type="button"
										class="note-action-btn note-action-btn--danger"
										onclick={() => (deletingId = note.id)}
										aria-label={$_('common.delete')}
									>
										{$_('common.delete')}
									</button>
								</div>
							</div>
						</div>
					{/each}
				</div>
			{/each}
		</div>
	{:else}
		<div class="note-rows">
			{#each filteredSortedNotes as note (note.id)}
				{@const docs = resolvedDocRefs(note)}
				{@const rowExcerpt = notesColumnVisible.excerpt ? noteExcerpt(note.content) : ''}
				{@const hasExcerpt = !!rowExcerpt}
				{@const hasDate = !!notesColumnVisible.date}
				{@const hasDocs = !!(notesColumnVisible.documents && docs.length > 0)}
				<div
					class="note-row"
					role="button"
					tabindex="0"
					onclick={() => openViewNote(note)}
					onkeydown={(e) => e.key === 'Enter' && openViewNote(note)}
				>
					<div class="note-row-info">
						<div class="note-row-name">
							{note.title || $_('vehicle.notes.untitled')}
						</div>
						{#if hasExcerpt || hasDate || hasDocs}
							<div class="note-row-meta">
								{#if hasExcerpt}
									<span class="note-row-excerpt">{rowExcerpt}</span>
								{/if}
								{#if hasExcerpt && (hasDate || hasDocs)}<span class="sep">·</span>{/if}
								{#if hasDate}
									<span class="note-row-date">{formatDate(note.updated_at)}</span>
								{/if}
								{#if hasDocs && hasDate}<span class="sep">·</span>{/if}
								{#if hasDocs}
									<span class="note-row-docs"
										>{docs.length}
										{docs.length === 1
											? $_('documents.title').toLowerCase().replace(/s$/, '')
											: $_('documents.title').toLowerCase()}</span
									>
								{/if}
							</div>
						{/if}
					</div>
					<div class="note-row-actions">
						<button
							type="button"
							class="note-action-btn"
							onclick={(e) => {
								e.stopPropagation();
								openEditNote(note);
							}}
							aria-label={$_('common.edit')}
						>
							{$_('common.edit')}
						</button>
						<button
							type="button"
							class="note-action-btn note-action-btn--danger"
							onclick={(e) => {
								e.stopPropagation();
								deletingId = note.id;
							}}
							aria-label={$_('common.delete')}
						>
							{$_('common.delete')}
						</button>
					</div>
				</div>
			{/each}
		</div>
	{/if}
{/if}

{#if deletingId}
	<ConfirmDialog
		open={true}
		title={$_('vehicle.notes.delete.title')}
		description={$_('vehicle.notes.delete.desc')}
		confirmLabel={$_('vehicle.notes.delete.confirm')}
		cancelLabel={$_('vehicle.notes.delete.cancel')}
		danger={true}
		loading={false}
		onconfirm={() => {
			const id = deletingId!;
			deletingId = null;
			const f = document.createElement('form');
			f.method = 'POST';
			f.action = '?/delete';
			const input = document.createElement('input');
			input.type = 'hidden';
			input.name = 'id';
			input.value = id;
			f.appendChild(input);
			document.body.appendChild(f);
			f.submit();
		}}
		onclose={() => (deletingId = null)}
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

	.section-sub {
		font-size: var(--text-sm);
		color: var(--text-muted);
		margin: 0;
	}

	.page-actions {
		flex-shrink: 0;
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

	.view-controls {
		display: flex;
		gap: var(--space-2);
		align-items: center;
	}

	.notes-list {
		display: flex;
		flex-direction: column;
	}

	.timeline-month {
		margin-bottom: var(--space-5);
	}

	.timeline-month-label {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		margin-bottom: var(--space-4);
	}

	.timeline-month-name {
		font-size: var(--text-xs);
		font-weight: 600;
		color: var(--text-subtle);
		text-transform: uppercase;
		letter-spacing: 0.07em;
		flex-shrink: 0;
	}

	.timeline-month-line {
		flex: 1;
		height: 1px;
		background: var(--border);
	}

	.note-rows {
		display: flex;
		flex-direction: column;
	}

	.note-row {
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 0.75rem 0 0.75rem var(--space-2);
		border-bottom: 1px solid var(--border);
		cursor: pointer;
		transition: background 0.15s;
	}

	.note-row:first-child {
		border-top: 1px solid var(--border);
	}

	.note-row:hover {
		background: var(--bg-subtle);
	}

	.note-row-info {
		flex: 1;
		min-width: 0;
	}

	.note-row-name {
		font-size: var(--text-base);
		font-weight: 500;
		color: var(--text);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.note-row-meta {
		display: flex;
		flex-wrap: nowrap;
		gap: 0.25rem;
		align-items: center;
		font-size: var(--text-sm);
		color: var(--text-muted);
		margin-top: 0.2rem;
		overflow: hidden;
	}

	.sep {
		color: var(--text-subtle);
		flex-shrink: 0;
	}

	.note-row-excerpt {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		min-width: 0;
	}

	.note-row-date {
		flex-shrink: 0;
		white-space: nowrap;
		font-family: var(--font-mono);
		font-variant-numeric: tabular-nums;
		font-size: var(--text-xs);
	}

	.note-row-docs {
		flex-shrink: 0;
		white-space: nowrap;
		font-size: var(--text-xs);
	}

	.note-row-actions {
		display: flex;
		gap: var(--space-2);
		flex-shrink: 0;
	}

	.note-card {
		padding: 0.875rem 0;
		border-bottom: 1px solid var(--border);
		display: flex;
		align-items: flex-start;
		gap: var(--space-4);
	}

	.note-card:first-child {
		border-top: 1px solid var(--border);
	}

	.note-body {
		flex: 1;
		min-width: 0;
		cursor: pointer;
	}

	.note-title {
		font-size: var(--text-base);
		font-weight: 500;
		color: var(--text);
		line-height: var(--leading-snug);
	}

	.note-excerpt {
		font-size: var(--text-sm);
		color: var(--text-muted);
		margin-top: 0.25rem;
		line-height: var(--leading-snug);
		overflow: hidden;
		display: -webkit-box;
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 2;
		line-clamp: 2;
	}

	.note-doc-refs {
		display: flex;
		flex-wrap: wrap;
		gap: 0.375rem;
		margin-top: 0.5rem;
	}

	.doc-chip {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		font-size: var(--text-xs);
		border: 1px solid var(--border);
		border-radius: 5px;
		padding: 2px 6px 2px 4px;
		background: var(--bg);
		text-decoration: none;
		transition:
			border-color 0.1s,
			background 0.1s;
	}

	.doc-chip:hover {
		border-color: var(--accent);
		background: var(--accent-subtle);
	}

	.doc-chip-type {
		font-size: 10px;
		font-weight: 500;
		color: var(--text-muted);
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	.doc-chip:hover .doc-chip-type {
		color: var(--accent);
	}

	.doc-chip-name {
		color: var(--text-muted);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		max-width: 120px;
	}

	.doc-chip:hover .doc-chip-name {
		color: var(--accent);
	}

	.note-meta {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: var(--space-2);
		flex-shrink: 0;
	}

	.note-date {
		font-size: var(--text-xs);
		color: var(--text-subtle);
		white-space: nowrap;
		font-family: var(--font-mono);
		font-variant-numeric: tabular-nums;
	}

	.note-actions {
		display: flex;
		gap: var(--space-2);
	}

	.note-action-btn {
		font-size: var(--text-xs);
		font-weight: 500;
		color: var(--text-subtle);
		background: none;
		border: 1px solid var(--border);
		border-radius: 5px;
		padding: 0.25rem 0.5rem;
		cursor: pointer;
		transition:
			color 0.1s,
			border-color 0.1s,
			background 0.1s;
	}

	.note-action-btn:hover {
		color: var(--text);
		border-color: var(--border-strong);
		background: var(--bg-muted);
	}

	.note-action-btn--danger:hover {
		color: var(--status-overdue);
		border-color: color-mix(in srgb, var(--status-overdue) 40%, transparent);
		background: color-mix(in srgb, var(--status-overdue) 6%, transparent);
	}

	@media (max-width: 480px) {
		.note-card {
			flex-direction: column;
			gap: var(--space-2);
		}

		.note-meta {
			flex-direction: row;
			align-items: center;
			justify-content: space-between;
			width: 100%;
		}
	}
</style>
