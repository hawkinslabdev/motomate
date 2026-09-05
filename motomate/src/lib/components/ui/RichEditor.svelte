<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { Editor, Extension } from '@tiptap/core';
	import StarterKit from '@tiptap/starter-kit';
	import Link from '@tiptap/extension-link';
	import { Markdown } from 'tiptap-markdown';
	import { _ } from '$lib/i18n';

	interface DocRecord {
		id: string;
		name: string;
		title?: string | null;
		doc_type: string;
		storage_key: string;
	}

	let {
		content = '',
		placeholder = 'Write in Markdown…',
		docs = [] as DocRecord[],
		name = 'content',
		minHeight = '220px',
		docSearchPlaceholder = 'Search documents',
		docSearchEmpty = 'No documents match',
		onchange,
		ondocref
	}: {
		content?: string;
		placeholder?: string;
		docs?: DocRecord[];
		name?: string;
		minHeight?: string;
		docSearchPlaceholder?: string;
		docSearchEmpty?: string;
		onchange?: (markdown: string) => void;
		ondocref?: (docId: string) => void;
	} = $props();

	let editorEl = $state<HTMLDivElement | undefined>();
	let editor = $state<Editor | undefined>();
	let editorFailed = $state(false);
	let currentMarkdown = $state(untrack(() => content));
	let editorTick = $state(0);
	let showDocPicker = $state(false);
	let docSearch = $state('');
	let docSearchEl = $state<HTMLInputElement | undefined>();
	let showLinkInput = $state(false);
	let linkHref = $state('');
	let linkInputEl = $state<HTMLInputElement | undefined>();

	const filteredDocs = $derived.by(() => {
		const q = docSearch.trim().toLowerCase();
		if (!q) return docs;
		return docs.filter((d) => {
			const label = (d.title || d.name).toLowerCase();
			return label.includes(q) || d.doc_type.toLowerCase().includes(q);
		});
	});

	const active = $derived.by(() => {
		void editorTick;
		return {
			bold: editor?.isActive('bold') ?? false,
			italic: editor?.isActive('italic') ?? false,
			h2: editor?.isActive('heading', { level: 2 }) ?? false,
			h3: editor?.isActive('heading', { level: 3 }) ?? false,
			bullet: editor?.isActive('bulletList') ?? false,
			ordered: editor?.isActive('orderedList') ?? false,
			blockquote: editor?.isActive('blockquote') ?? false,
			codeBlock: editor?.isActive('codeBlock') ?? false,
			code: editor?.isActive('code') ?? false,
			link: editor?.isActive('link') ?? false
		};
	});

	onMount(() => {
		if (!editorEl) return;

		const initialContent = untrack(() => content);

		const ctrlASelectAll = Extension.create({
			name: 'ctrlASelectAll',
			addKeyboardShortcuts() {
				return {
					'Ctrl-a': () => this.editor.commands.selectAll()
				};
			}
		});

		try {
			const instance = new Editor({
				element: editorEl,
				extensions: [
					StarterKit.configure({ heading: { levels: [1, 2, 3] }, link: false }),
					ctrlASelectAll,
					Link.configure({
						openOnClick: false,
						HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' }
					}),
					Markdown.configure({ html: false, transformPastedText: true })
				],
				content: initialContent,
				onUpdate({ editor: e }) {
					currentMarkdown = (e.storage as any).markdown.getMarkdown();
					onchange?.(currentMarkdown);
				},
				onTransaction() {
					editorTick++;
				}
			});

			editor = instance;
		} catch (err) {
			console.error('RichEditor failed to initialize', err);
			editorFailed = true;
		}

		return () => {
			editor?.destroy();
			editor = undefined;
		};
	});

	function insertDocLink(doc: DocRecord) {
		if (!editor) return;
		const label = doc.title || doc.name;
		const href = `/api/files?key=${encodeURIComponent(doc.storage_key)}`;
		editor
			.chain()
			.focus()
			.insertContent({ type: 'text', text: label, marks: [{ type: 'link', attrs: { href } }] })
			.run();
		ondocref?.(doc.id);
		showDocPicker = false;
		docSearch = '';
	}

	function openLinkDialog() {
		linkHref = editor?.getAttributes('link').href ?? '';
		showLinkInput = true;
		setTimeout(() => linkInputEl?.focus(), 0);
	}

	function confirmLink() {
		if (!editor) return;
		const href = linkHref.trim();
		if (!href) {
			editor.chain().focus().unsetLink().run();
		} else {
			const full = href.startsWith('http') ? href : 'https://' + href;
			editor.chain().focus().setLink({ href: full }).run();
		}
		showLinkInput = false;
		linkHref = '';
	}

	function cancelLink() {
		showLinkInput = false;
		linkHref = '';
		editor?.chain().focus().run();
	}

	function handleLinkKey(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			e.preventDefault();
			confirmLink();
		}
		if (e.key === 'Escape') {
			e.preventDefault();
			cancelLink();
		}
	}
</script>

<div class="rich-editor">
	<div class="editor-toolbar">
		<div class="toolbar-group">
			<button
				type="button"
				class="tb-btn tb-bold"
				class:tb-btn--active={active.bold}
				onclick={() => editor?.chain().focus().toggleBold().run()}
				title={$_('richEditor.bold')}
				aria-label={$_('richEditor.bold')}>B</button
			>
			<button
				type="button"
				class="tb-btn tb-italic"
				class:tb-btn--active={active.italic}
				onclick={() => editor?.chain().focus().toggleItalic().run()}
				title={$_('richEditor.italic')}
				aria-label={$_('richEditor.italic')}>I</button
			>
		</div>

		<div class="toolbar-sep" aria-hidden="true"></div>

		<div class="toolbar-group">
			<button
				type="button"
				class="tb-btn"
				class:tb-btn--active={active.h2}
				onclick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
				title={$_('richEditor.heading2')}
				aria-label={$_('richEditor.heading2')}>H2</button
			>
			<button
				type="button"
				class="tb-btn"
				class:tb-btn--active={active.h3}
				onclick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()}
				title={$_('richEditor.heading3')}
				aria-label={$_('richEditor.heading3')}>H3</button
			>
		</div>

		<div class="toolbar-sep" aria-hidden="true"></div>

		<div class="toolbar-group">
			<button
				type="button"
				class="tb-btn"
				class:tb-btn--active={active.bullet}
				onclick={() => editor?.chain().focus().toggleBulletList().run()}
				title={$_('richEditor.bulletList')}
				aria-label={$_('richEditor.bulletList')}
			>
				<svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
					<circle cx="1.5" cy="4" r="1.5" fill="currentColor" />
					<rect x="4.5" y="3" width="9" height="2" rx="1" fill="currentColor" />
					<circle cx="1.5" cy="10" r="1.5" fill="currentColor" />
					<rect x="4.5" y="9" width="9" height="2" rx="1" fill="currentColor" />
				</svg>
			</button>
			<button
				type="button"
				class="tb-btn"
				class:tb-btn--active={active.ordered}
				onclick={() => editor?.chain().focus().toggleOrderedList().run()}
				title={$_('richEditor.numberedList')}
				aria-label={$_('richEditor.numberedList')}
			>
				<svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
					<text x="0" y="5" font-size="5" font-family="monospace" fill="currentColor">1.</text>
					<rect x="4.5" y="3" width="9" height="2" rx="1" fill="currentColor" />
					<text x="0" y="11" font-size="5" font-family="monospace" fill="currentColor">2.</text>
					<rect x="4.5" y="9" width="9" height="2" rx="1" fill="currentColor" />
				</svg>
			</button>
			<button
				type="button"
				class="tb-btn"
				class:tb-btn--active={active.blockquote}
				onclick={() => editor?.chain().focus().toggleBlockquote().run()}
				title={$_('richEditor.blockquote')}
				aria-label={$_('richEditor.blockquote')}
			>
				<svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
					<rect x="1" y="2" width="2" height="10" rx="1" fill="currentColor" />
					<rect x="5" y="4" width="8" height="2" rx="1" fill="currentColor" opacity=".7" />
					<rect x="5" y="8" width="6" height="2" rx="1" fill="currentColor" opacity=".7" />
				</svg>
			</button>
			<button
				type="button"
				class="tb-btn tb-mono"
				class:tb-btn--active={active.codeBlock}
				onclick={() => editor?.chain().focus().toggleCodeBlock().run()}
				title={$_('richEditor.codeBlock')}
				aria-label={$_('richEditor.codeBlock')}>&lt;/&gt;</button
			>
		</div>

		<div class="toolbar-sep" aria-hidden="true"></div>

		<div class="toolbar-group">
			<button
				type="button"
				class="tb-btn"
				class:tb-btn--active={active.link || showLinkInput}
				onclick={openLinkDialog}
				title={$_('richEditor.link')}
				aria-label={$_('richEditor.link')}
			>
				<svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
					<path
						d="M5.5 8.5L8.5 5.5"
						stroke="currentColor"
						stroke-width="1.5"
						stroke-linecap="round"
					/>
					<path
						d="M7 6.5L8.5 5a2.121 2.121 0 013 3L10 9.5"
						stroke="currentColor"
						stroke-width="1.5"
						stroke-linecap="round"
					/>
					<path
						d="M7 7.5L5.5 9A2.121 2.121 0 012.5 6L4 4.5"
						stroke="currentColor"
						stroke-width="1.5"
						stroke-linecap="round"
					/>
				</svg>
			</button>

			{#if docs.length > 0}
				<button
					type="button"
					class="tb-btn tb-doc"
					class:tb-btn--active={showDocPicker}
					onclick={() => {
						showDocPicker = !showDocPicker;
						if (showDocPicker) setTimeout(() => docSearchEl?.focus(), 0);
						else docSearch = '';
					}}
					title={$_('richEditor.insertDocLink')}
					aria-label={$_('richEditor.insertDocLink')}
					aria-expanded={showDocPicker}
				>
					<svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
						<rect
							x="2"
							y="1"
							width="8"
							height="10"
							rx="1.5"
							stroke="currentColor"
							stroke-width="1.5"
						/>
						<path
							d="M5 5h4M5 7h3"
							stroke="currentColor"
							stroke-width="1.2"
							stroke-linecap="round"
						/>
						<circle
							cx="11"
							cy="11"
							r="2.5"
							fill="var(--bg)"
							stroke="currentColor"
							stroke-width="1.2"
						/>
						<path
							d="M11 9.8v2.4M9.8 11h2.4"
							stroke="currentColor"
							stroke-width="1.1"
							stroke-linecap="round"
						/>
					</svg>
				</button>
			{/if}
		</div>
	</div>

	{#if showLinkInput}
		<div class="editor-link-bar">
			<input
				bind:this={linkInputEl}
				bind:value={linkHref}
				type="url"
				placeholder="https://…"
				class="link-input"
				onkeydown={handleLinkKey}
			/>
			<button type="button" class="link-btn link-btn--confirm" onclick={confirmLink}>Set</button>
			<button type="button" class="link-btn" onclick={cancelLink}>Cancel</button>
		</div>
	{/if}

	{#if showDocPicker}
		<div class="editor-doc-picker">
			<div class="doc-search-wrap">
				<input
					bind:this={docSearchEl}
					bind:value={docSearch}
					type="search"
					placeholder={docSearchPlaceholder}
					class="doc-search-input"
					autocomplete="off"
				/>
			</div>
			<div class="doc-ref-list">
				{#each filteredDocs as doc (doc.id)}
					<button type="button" class="doc-ref-item" onclick={() => insertDocLink(doc)}>
						<span class="doc-ref-type">{doc.doc_type}</span>
						<span class="doc-ref-name">{doc.title || doc.name}</span>
					</button>
				{:else}
					<p class="doc-ref-empty">{docSearchEmpty}</p>
				{/each}
			</div>
		</div>
	{/if}

	<div
		bind:this={editorEl}
		class="editor-content"
		class:editor-content--hidden={editorFailed}
		style="min-height:{minHeight}"
		data-placeholder={placeholder}
	></div>

	{#if editorFailed}
		<textarea
			class="editor-fallback"
			style="min-height:{minHeight}"
			{placeholder}
			bind:value={currentMarkdown}
			oninput={() => onchange?.(currentMarkdown)}
		></textarea>
	{/if}

	<input type="hidden" {name} value={currentMarkdown} />
</div>

<style>
	.rich-editor {
		border: 1px solid var(--border);
		border-radius: 10px;
		overflow: hidden;
		background: var(--bg);
		transition: border-color 0.15s;
	}

	.rich-editor:focus-within {
		border-color: var(--accent);
		outline: 2px solid color-mix(in srgb, var(--accent) 20%, transparent);
		outline-offset: 1px;
	}

	/* Toolbar */
	.editor-toolbar {
		display: flex;
		align-items: center;
		gap: 2px;
		padding: 0.375rem 0.5rem;
		border-bottom: 1px solid var(--border);
		background: var(--bg-subtle);
		flex-wrap: wrap;
	}

	.toolbar-group {
		display: flex;
		align-items: center;
		gap: 1px;
	}

	.toolbar-sep {
		width: 1px;
		height: 14px;
		background: var(--border);
		margin: 0 4px;
		flex-shrink: 0;
	}

	.tb-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 26px;
		height: 26px;
		padding: 0 4px;
		background: none;
		border: none;
		border-radius: 5px;
		cursor: pointer;
		font-size: var(--text-xs);
		font-weight: 500;
		color: var(--text-muted);
		font-family: var(--font-sans);
		transition:
			background 0.1s,
			color 0.1s;
		line-height: 1;
	}

	.tb-btn:hover {
		background: var(--bg-muted);
		color: var(--text);
	}

	.tb-btn--active {
		background: var(--accent-subtle);
		color: var(--accent);
	}

	.tb-btn--active:hover {
		background: color-mix(in srgb, var(--accent-subtle) 80%, var(--bg-muted));
	}

	.tb-bold {
		font-weight: 700;
	}
	.tb-italic {
		font-style: italic;
	}
	.tb-mono {
		font-family: var(--font-mono);
		font-size: 10px;
	}

	/* Link bar */
	.editor-link-bar {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.375rem 0.625rem;
		border-bottom: 1px solid var(--border);
		background: var(--bg-subtle);
	}

	.link-input {
		flex: 1;
		border: 1px solid var(--border);
		border-radius: 6px;
		padding: 0.25rem 0.5rem;
		font-size: var(--text-sm);
		background: var(--bg);
		color: var(--text);
		min-width: 0;
	}

	.link-input:focus {
		outline: 2px solid var(--accent);
		outline-offset: 1px;
		border-color: var(--accent);
	}

	.link-btn {
		padding: 0.25rem 0.625rem;
		border-radius: 6px;
		border: 1px solid var(--border);
		background: none;
		font-size: var(--text-xs);
		font-weight: 500;
		color: var(--text-muted);
		cursor: pointer;
		white-space: nowrap;
		transition:
			background 0.1s,
			color 0.1s;
	}

	.link-btn:hover {
		background: var(--bg-muted);
		color: var(--text);
	}

	.link-btn--confirm {
		background: var(--accent);
		color: #fff;
		border-color: var(--accent);
	}

	.link-btn--confirm:hover {
		background: var(--accent-hover);
		border-color: var(--accent-hover);
	}

	/* Doc picker dropdown */
	.editor-doc-picker {
		border-bottom: 1px solid var(--border);
		background: var(--bg-subtle);
	}

	.doc-search-wrap {
		padding: 0.375rem 0.5rem;
		border-bottom: 1px solid var(--border);
	}

	.doc-search-input {
		width: 100%;
		padding: 0.3rem 0.5rem;
		border: 1px solid var(--border);
		border-radius: 6px;
		background: var(--bg);
		color: var(--text);
		font-size: var(--text-sm);
		font-family: var(--font-sans);
		box-sizing: border-box;
	}

	.doc-search-input:focus {
		outline: 2px solid var(--accent);
		outline-offset: 1px;
		border-color: var(--accent);
	}

	.doc-ref-list {
		max-height: 160px;
		overflow-y: auto;
	}

	.doc-ref-item {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		width: 100%;
		padding: 0.4rem 0.75rem;
		background: none;
		border: none;
		border-bottom: 1px solid var(--border);
		cursor: pointer;
		text-align: left;
		font-family: var(--font-sans);
		transition: background 0.1s;
	}

	.doc-ref-item:last-child {
		border-bottom: none;
	}

	.doc-ref-item:hover {
		background: var(--accent-subtle);
	}

	.doc-ref-type {
		font-size: 10px;
		font-weight: 500;
		color: var(--text-muted);
		text-transform: uppercase;
		letter-spacing: 0.04em;
		flex-shrink: 0;
		min-width: 44px;
	}

	.doc-ref-name {
		font-size: var(--text-sm);
		color: var(--text);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		flex: 1;
		min-width: 0;
	}

	.doc-ref-empty {
		padding: 0.625rem 0.75rem;
		font-size: var(--text-sm);
		color: var(--text-subtle);
		margin: 0;
		font-style: italic;
	}

	/* ProseMirror content area */
	.editor-content {
		padding: 0.75rem 1rem;
		cursor: text;
		line-height: var(--leading-base);
		font-size: var(--text-base);
		color: var(--text);
	}

	.editor-content--hidden {
		display: none;
	}

	.editor-fallback {
		width: 100%;
		padding: 0.75rem 1rem;
		border: none;
		background: none;
		color: var(--text);
		font-family: var(--font-sans);
		font-size: var(--text-base);
		line-height: var(--leading-base);
		resize: vertical;
		box-sizing: border-box;
	}

	.editor-fallback:focus {
		outline: none;
	}

	/* ProseMirror global styles */
	:global(.ProseMirror) {
		outline: none;
		min-height: inherit;
	}

	:global(.ProseMirror p.is-editor-empty:first-child::before) {
		content: attr(data-placeholder);
		float: left;
		color: var(--text-subtle);
		pointer-events: none;
		height: 0;
	}

	:global(.ProseMirror h1),
	:global(.ProseMirror h2),
	:global(.ProseMirror h3) {
		font-weight: 600;
		line-height: var(--leading-tight);
		margin: 1.1em 0 0.4em;
		color: var(--text);
	}
	:global(.ProseMirror h1) {
		font-size: var(--text-xl);
	}
	:global(.ProseMirror h2) {
		font-size: var(--text-lg);
	}
	:global(.ProseMirror h3) {
		font-size: var(--text-base);
		font-weight: 600;
	}

	:global(.ProseMirror p) {
		margin: 0.5em 0;
	}
	:global(.ProseMirror p:first-child) {
		margin-top: 0;
	}
	:global(.ProseMirror p:last-child) {
		margin-bottom: 0;
	}

	:global(.ProseMirror ul) {
		padding-left: 1.5rem;
		margin: 0.5em 0;
	}

	:global(.ProseMirror ol) {
		padding-left: 1.5rem;
		margin: 0.5em 0;
	}

	:global(.ProseMirror ul > li) {
		display: list-item;
		list-style-type: disc;
		margin: 0.2em 0;
	}

	:global(.ProseMirror ol > li) {
		display: list-item;
		list-style-type: decimal;
		margin: 0.2em 0;
	}

	:global(.ProseMirror code) {
		font-family: var(--font-mono);
		font-size: 0.875em;
		background: var(--bg-muted);
		padding: 0.1em 0.35em;
		border-radius: 4px;
		color: var(--text);
	}

	:global(.ProseMirror pre) {
		background: var(--bg-muted);
		border: 1px solid var(--border);
		border-radius: 8px;
		padding: 0.75rem 1rem;
		overflow-x: auto;
		margin: 0.75em 0;
	}

	:global(.ProseMirror pre code) {
		background: none;
		padding: 0;
		font-size: var(--text-sm);
	}

	:global(.ProseMirror blockquote) {
		border-left: 3px solid var(--border-strong);
		padding-left: 1rem;
		margin: 0.75em 0;
		color: var(--text-muted);
	}

	:global(.ProseMirror a) {
		color: var(--accent);
		text-decoration: underline;
		text-underline-offset: 2px;
	}

	:global(.ProseMirror hr) {
		border: none;
		border-top: 1px solid var(--border);
		margin: 1.25em 0;
	}

	:global(.ProseMirror *) {
		box-sizing: border-box;
	}
</style>
