<script lang="ts">
	import { toasts } from '$lib/stores/toasts.js';
</script>

<div class="toast-stack" aria-live="polite" aria-atomic="false">
	{#each $toasts as toast (toast.id)}
		<div class="toast toast--{toast.type}" role="status">
			<span class="toast-icon"
				>{toast.type === 'success' ? '✓' : toast.type === 'error' ? '✕' : 'ℹ'}</span
			>
			<span class="toast-message">{toast.message}</span>
			<button onclick={() => toasts.remove(toast.id)} aria-label="Dismiss" class="toast-close"
				>✕</button
			>
		</div>
	{/each}
</div>

<style>
	.toast-stack {
		position: fixed;
		top: 1rem;
		right: 1rem;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		z-index: 500;
		max-width: 360px;
		pointer-events: none;
	}

	@media (max-width: 768px) {
		.toast-stack {
			top: auto;
			bottom: calc(5rem + env(safe-area-inset-bottom));
			right: 1rem;
			left: 1rem;
			max-width: none;
		}
	}
	.toast {
		display: flex;
		align-items: center;
		gap: 0.625rem;
		padding: 0.875rem 1rem;
		border-radius: 10px;
		border: 1px solid;
		background: var(--bg);
		box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
		font-size: 0.9375rem;
		font-weight: 500;
		color: var(--text);
		animation: toast-in 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
		pointer-events: auto;
	}
	.toast--success {
		background: color-mix(in srgb, var(--status-ok) 12%, var(--bg));
		border-color: color-mix(in srgb, var(--status-ok) 40%, transparent);
	}
	.toast--error {
		background: color-mix(in srgb, var(--status-overdue) 12%, var(--bg));
		border-color: color-mix(in srgb, var(--status-overdue) 40%, transparent);
	}
	.toast--info {
		background: color-mix(in srgb, var(--accent) 12%, var(--bg));
		border-color: color-mix(in srgb, var(--accent) 40%, transparent);
	}
	.toast-icon {
		flex-shrink: 0;
		font-size: 1rem;
	}
	.toast--success .toast-icon {
		color: var(--status-ok);
	}
	.toast--error .toast-icon {
		color: var(--status-overdue);
	}
	.toast--info .toast-icon {
		color: var(--accent);
	}
	.toast-message {
		flex: 1;
	}
	.toast-close {
		flex-shrink: 0;
		background: none;
		border: none;
		cursor: pointer;
		color: var(--text-subtle);
		padding: 0.25rem;
		font-size: 0.75rem;
		line-height: 1;
		border-radius: 4px;
	}
	.toast-close:hover {
		background: var(--bg-muted);
	}
	@keyframes toast-in {
		from {
			transform: translateX(1.5rem) scale(0.95);
			opacity: 0;
		}
		to {
			transform: translateX(0) scale(1);
			opacity: 1;
		}
	}

	@media (max-width: 768px) {
		.toast {
			animation-name: toast-in-mobile;
		}
		@keyframes toast-in-mobile {
			from {
				transform: translateY(1rem) scale(0.95);
				opacity: 0;
			}
			to {
				transform: translateY(0) scale(1);
				opacity: 1;
			}
		}
	}
</style>
