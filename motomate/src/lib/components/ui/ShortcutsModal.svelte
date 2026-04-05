<script lang="ts">
	let { open = $bindable(false) }: { open: boolean } = $props();

	const shortcuts = [
		{ keys: ['?'], desc: 'Show keyboard shortcuts' },
		{ keys: ['g', 'd'], desc: 'Go to Dashboard' },
		{ keys: ['g', 'g'], desc: 'Go to Garage' },
		{ keys: ['g', 's'], desc: 'Go to Settings' },
		{ keys: ['n'], desc: 'Add new vehicle' },
		{ keys: ['Esc'], desc: 'Close modal / Cancel' }
	];

	function handleKey(e: KeyboardEvent) {
		if (e.key === '?' && !e.ctrlKey && !e.metaKey) {
			e.preventDefault();
			open = true;
		}
		if (e.key === 'Escape' && open) {
			open = false;
		}
	}
</script>

<svelte:window onkeydown={handleKey} />

{#if open}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="modal-backdrop" onclick={() => (open = false)} onkeydown={() => {}}>
		<div
			class="modal"
			role="dialog"
			tabindex="-1"
			aria-labelledby="shortcuts-title"
			onclick={(e) => e.stopPropagation()}
			onkeydown={() => {}}
		>
			<h2 id="shortcuts-title" class="modal-title">Keyboard shortcuts</h2>
			<div class="shortcuts-list">
				{#each shortcuts as shortcut}
					<div class="shortcut">
						<div class="shortcut-keys">
							{#each shortcut.keys as key}
								<kbd>{key}</kbd>
							{/each}
						</div>
						<span class="shortcut-desc">{shortcut.desc}</span>
					</div>
				{/each}
			</div>
			<button class="modal-close" onclick={() => (open = false)}>Close</button>
		</div>
	</div>
{/if}

<style>
	.modal-backdrop {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.5);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 100;
	}
	.modal {
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: 12px;
		padding: var(--space-5);
		width: min(400px, calc(100vw - 2rem));
		max-height: 80vh;
		overflow-y: auto;
	}
	.modal-title {
		font-size: var(--text-lg);
		font-weight: 600;
		color: var(--text);
		margin: 0 0 var(--space-4);
	}
	.shortcuts-list {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}
	.shortcut {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-4);
	}
	.shortcut-keys {
		display: flex;
		gap: 0.25rem;
	}
	kbd {
		display: inline-block;
		padding: 0.25rem 0.5rem;
		background: var(--bg-muted);
		border: 1px solid var(--border);
		border-radius: 4px;
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		color: var(--text);
	}
	.shortcut-desc {
		font-size: var(--text-sm);
		color: var(--text-muted);
	}
	.modal-close {
		margin-top: var(--space-5);
		padding: 0.5rem 1rem;
		background: none;
		border: 1px solid var(--border);
		border-radius: 8px;
		font-size: var(--text-sm);
		color: var(--text-muted);
		cursor: pointer;
	}
	.modal-close:hover {
		background: var(--bg-muted);
		color: var(--text);
	}
</style>
