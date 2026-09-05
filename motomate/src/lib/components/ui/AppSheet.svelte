<script lang="ts">
	import { browser } from '$app/environment';
	import { sheet } from '$lib/stores/sheet.svelte.js';
	import { _ } from '$lib/i18n';

	function close() {
		sheet.closeSheet();
	}

	$effect(() => {
		if (sheet.open && browser) {
			const prev = document.documentElement.style.overflow;
			document.documentElement.style.overflow = 'hidden';
			return () => {
				document.documentElement.style.overflow = prev;
			};
		}
	});

	function handleBackdrop(e: MouseEvent) {
		if (e.target === e.currentTarget) close();
	}

	function handleKey(e: KeyboardEvent) {
		if (e.key === 'Escape' && sheet.open) close();
	}
</script>

<svelte:window onkeydown={handleKey} />

{#if sheet.open}
	<div class="sheet-backdrop" onclick={handleBackdrop} aria-hidden="true"></div>

	<div
		class="sheet-panel"
		class:sheet-panel--wide={sheet.wide}
		role="dialog"
		aria-modal="true"
		aria-labelledby="sheet-title"
	>
		<div class="sheet-drag-handle" aria-hidden="true"></div>
		<div class="sheet-header">
			<div class="sheet-title-area">
				<h2 id="sheet-title" class="sheet-title">{sheet.title}</h2>
				{#if sheet.hint}<span class="sheet-hint">{sheet.hint}</span>{/if}
			</div>
			<button class="sheet-close" onclick={close} aria-label={$_('common.close')}>
				<svg
					width="16"
					height="16"
					viewBox="0 0 16 16"
					fill="none"
					stroke="currentColor"
					stroke-width="1.5"
					stroke-linecap="round"
				>
					<path d="M3 3l10 10M13 3L3 13" />
				</svg>
			</button>
		</div>

		<div class="sheet-body">
			{#if sheet.formComponent}
				{@const Cmp = sheet.formComponent}
				{@const props = (sheet.formData ?? {}) as Record<string, unknown>}
				<Cmp {...props} />
			{/if}
		</div>
	</div>
{/if}

<style>
	.sheet-backdrop {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.4);
		z-index: 440;
		animation: fadeIn 0.2s ease;
	}

	.sheet-panel {
		position: fixed;
		top: 0;
		right: 0;
		bottom: 0;
		width: min(420px, 100vw);
		background: var(--bg);
		border-left: 1px solid var(--border);
		z-index: 450;
		display: flex;
		flex-direction: column;
		overflow: hidden;
		animation: slideInRight 0.25s cubic-bezier(0.22, 1, 0.36, 1);
	}

	.sheet-panel--wide {
		width: min(680px, 100vw);
	}

	.sheet-drag-handle {
		display: none;
	}

	.sheet-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--space-5) var(--space-5) var(--space-4);
		border-bottom: 1px solid var(--border);
		flex-shrink: 0;
	}

	.sheet-title-area {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.sheet-title {
		font-size: var(--text-md);
		font-weight: 600;
		color: var(--text);
		margin: 0;
	}

	.sheet-hint {
		font-size: var(--text-xs);
		color: var(--text-subtle);
		font-weight: 400;
	}

	.sheet-close {
		background: none;
		border: none;
		cursor: pointer;
		color: var(--text-muted);
		padding: var(--space-1);
		border-radius: 6px;
		display: flex;
		align-items: center;
		justify-content: center;
		transition:
			color 0.1s,
			background 0.1s;
	}

	.sheet-close:hover {
		color: var(--text);
		background: var(--bg-muted);
	}

	.sheet-close:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 1px;
	}

	.sheet-body {
		flex: 1;
		overflow-y: auto;
		overflow-x: hidden;
		padding: var(--space-5);
	}

	@keyframes fadeIn {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}

	@keyframes slideInRight {
		from {
			transform: translateX(100%);
		}
		to {
			transform: translateX(0);
		}
	}

	@keyframes slideInUp {
		from {
			transform: translateY(100%);
		}
		to {
			transform: translateY(0);
		}
	}

	@media (max-width: 768px) {
		.sheet-panel {
			top: auto;
			right: 0;
			bottom: 0;
			left: 0;
			width: 100%;
			max-height: 90dvh;
			border-left: none;
			border-top: 1px solid var(--border);
			border-radius: 14px 14px 0 0;
			animation: slideInUp 0.3s cubic-bezier(0.22, 1, 0.36, 1);
		}

		.sheet-drag-handle {
			display: block;
			width: 32px;
			height: 3px;
			background: var(--border);
			border-radius: 2px;
			margin: var(--space-2) auto 0;
			flex-shrink: 0;
		}

		.sheet-header {
			padding-top: var(--space-4);
		}

		.sheet-body {
			padding-bottom: max(var(--space-5), env(safe-area-inset-bottom));
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.sheet-backdrop,
		.sheet-panel {
			animation: none;
		}
	}
</style>
