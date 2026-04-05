<script lang="ts">
	import Modal from './Modal.svelte';

	interface Props {
		open: boolean;
		title: string;
		description: string;
		confirmLabel?: string;
		cancelLabel?: string;
		danger?: boolean;
		loading?: boolean;
		onconfirm: () => void;
		onclose: () => void;
	}

	let {
		open,
		title,
		description,
		confirmLabel = 'Confirm',
		cancelLabel = 'Cancel',
		danger = false,
		loading = false,
		onconfirm,
		onclose
	}: Props = $props();
</script>

<Modal {open} {title} {onclose}>
	<p class="description">{description}</p>
	{#snippet footer()}
		<button type="button" class="btn-cancel" onclick={onclose} disabled={loading}>
			{cancelLabel}
		</button>
		<button
			type="button"
			class="btn-confirm"
			class:btn-confirm--danger={danger}
			onclick={onconfirm}
			disabled={loading}
		>
			{loading ? 'Working…' : confirmLabel}
		</button>
	{/snippet}
</Modal>

<style>
	.description {
		font-size: var(--text-sm);
		color: var(--text-muted);
		margin: 0;
		line-height: var(--leading-base);
	}

	:global(.modal-footer) {
		padding: var(--space-4) var(--space-5) !important;
		border-top: 1px solid var(--border) !important;
		display: flex !important;
		justify-content: flex-end !important;
		gap: var(--space-2) !important;
	}

	.btn-cancel {
		padding: 0.625rem 1rem;
		background: none;
		border: 1px solid var(--border);
		border-radius: 10px;
		font-size: var(--text-sm);
		font-weight: 500;
		color: var(--text-muted);
		cursor: pointer;
		min-height: 44px;
		transition:
			background 0.1s cubic-bezier(0.25, 1, 0.5, 1),
			color 0.1s cubic-bezier(0.25, 1, 0.5, 1),
			transform 0.1s cubic-bezier(0.25, 1, 0.5, 1);
	}
	.btn-cancel:not(:disabled):hover {
		background: var(--bg-muted);
		color: var(--text);
		transform: translateY(-1px);
	}
	.btn-cancel:not(:disabled):active {
		transform: scale(0.97);
		transition-duration: 0.06s;
	}
	.btn-cancel:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
	.btn-cancel:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.btn-confirm {
		padding: 0.625rem 1.25rem;
		background: var(--accent);
		border: none;
		border-radius: 10px;
		font-size: var(--text-sm);
		font-weight: 500;
		color: #fff;
		cursor: pointer;
		min-height: 44px;
		transition:
			background 0.1s cubic-bezier(0.25, 1, 0.5, 1),
			transform 0.1s cubic-bezier(0.25, 1, 0.5, 1);
	}
	.btn-confirm:not(:disabled):hover {
		background: var(--accent-hover);
		transform: translateY(-1px);
	}
	.btn-confirm:not(:disabled):active {
		transform: scale(0.97);
		transition-duration: 0.06s;
	}
	.btn-confirm:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
	.btn-confirm:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}
	@media (prefers-reduced-motion: reduce) {
		.btn-cancel,
		.btn-confirm {
			transition:
				background 0.1s,
				color 0.1s;
		}
		.btn-cancel:not(:disabled):hover,
		.btn-cancel:not(:disabled):active,
		.btn-confirm:not(:disabled):hover,
		.btn-confirm:not(:disabled):active {
			transform: none;
		}
	}
	.btn-confirm--danger {
		background: var(--status-overdue);
	}
	.btn-confirm--danger:hover:not(:disabled) {
		background: color-mix(in srgb, var(--status-overdue) 85%, black);
	}
</style>
