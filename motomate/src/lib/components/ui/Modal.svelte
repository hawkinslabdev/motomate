<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		open: boolean;
		title: string;
		onclose?: () => void;
		children?: Snippet;
		footer?: Snippet;
	}

	let { open, title, onclose, children, footer }: Props = $props();

	function handleKey(e: KeyboardEvent) {
		if (e.key === 'Escape') onclose?.();
	}

	function handleBackdropClick(e: MouseEvent) {
		if (e.target === e.currentTarget) onclose?.();
	}
</script>

<svelte:window onkeydown={handleKey} />

{#if open}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<div class="backdrop" onclick={handleBackdropClick} aria-hidden="true"></div>
	<div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
		<div class="modal-header">
			<h2 id="modal-title" class="modal-title">{title}</h2>
			<button class="close-btn" onclick={onclose} aria-label="Close">
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
		{#if children}
			<div class="modal-body">
				{@render children()}
			</div>
		{/if}
		{#if footer}
			<div class="modal-footer">
				{@render footer()}
			</div>
		{/if}
	</div>
{/if}

<style>
	.backdrop {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.45);
		z-index: 400;
		animation: fadeIn 0.2s cubic-bezier(0.25, 1, 0.5, 1);
	}
	.modal {
		position: fixed;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		z-index: 450;
		width: min(420px, calc(100vw - 2rem));
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: 12px;
		overflow: hidden;
		animation: slideUp 0.28s cubic-bezier(0.22, 1, 0.36, 1);
	}
	.modal-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--space-4) var(--space-5);
		border-bottom: 1px solid var(--border);
	}
	.modal-title {
		font-size: var(--text-md);
		font-weight: 600;
		color: var(--text);
		margin: 0;
	}
	.close-btn {
		background: none;
		border: none;
		cursor: pointer;
		color: var(--text-muted);
		font-size: 0;
		padding: var(--space-1);
		border-radius: 6px;
		display: flex;
		align-items: center;
		justify-content: center;
		transition:
			color 0.1s,
			background 0.1s;
	}
	.close-btn:hover {
		color: var(--text);
		background: var(--bg-muted);
	}
	.close-btn:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 1px;
	}
	.modal-body {
		padding: var(--space-5);
		overflow-x: hidden;
	}
	.modal-footer {
		padding: var(--space-4) var(--space-5);
		border-top: 1px solid var(--border);
		display: flex;
		justify-content: flex-end;
		gap: var(--space-2);
	}

	@keyframes fadeIn {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}
	@keyframes slideUp {
		from {
			opacity: 0;
			transform: translate(-50%, -46%) scale(0.98);
		}
		to {
			opacity: 1;
			transform: translate(-50%, -50%) scale(1);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.backdrop,
		.modal {
			animation: none;
		}
	}
</style>
