<script lang="ts">
	import { _, waitLocale } from '#lib/i18n/index.js';

	interface Column {
		key: string;
		label: string;
		hideable: boolean;
	}

	let {
		columns,
		visible,
		onchange
	}: {
		columns: Column[];
		visible: Record<string, boolean>;
		onchange: (v: Record<string, boolean>) => void;
	} = $props();

	$effect(() => {
		waitLocale();
	});

	let open = $state(false);
	let triggerEl = $state<HTMLButtonElement | undefined>();
	let popoverEl = $state<HTMLDivElement | undefined>();

	function toggle() {
		open = !open;
	}

	function handleWindowClick(e: MouseEvent) {
		if (!open) return;
		const target = e.target as Node;
		if (triggerEl?.contains(target) || popoverEl?.contains(target)) return;
		open = false;
	}

	function toggleColumn(key: string) {
		onchange({ ...visible, [key]: !visible[key] });
	}
</script>

<svelte:window onclick={handleWindowClick} />

<div class="column-picker">
	<button
		bind:this={triggerEl}
		type="button"
		class="picker-btn"
		class:picker-btn--active={open}
		onclick={toggle}
		aria-label={$_('common.columns')}
		title={$_('common.columns')}
	>
		<svg
			width="15"
			height="15"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			stroke-linecap="round"
			stroke-linejoin="round"
			aria-hidden="true"
		>
			<rect x="3" y="3" width="5" height="18" rx="1" />
			<rect x="10" y="3" width="5" height="18" rx="1" />
			<rect x="17" y="3" width="5" height="18" rx="1" />
		</svg>
	</button>

	{#if open}
		<div
			bind:this={popoverEl}
			class="picker-popover"
			role="dialog"
			aria-label={$_('common.columns')}
		>
			<ul class="picker-list" role="list">
				{#each columns as col}
					<li>
						{#if col.hideable}
							<label class="picker-item">
								<input
									type="checkbox"
									checked={visible[col.key] ?? true}
									onchange={() => toggleColumn(col.key)}
									class="picker-checkbox"
								/>
								<span class="picker-label">{col.label}</span>
							</label>
						{:else}
							<div class="picker-item picker-item--fixed">
								<input type="checkbox" checked disabled class="picker-checkbox" />
								<span class="picker-label picker-label--fixed">{col.label}</span>
							</div>
						{/if}
					</li>
				{/each}
			</ul>
		</div>
	{/if}
</div>

<style>
	.column-picker {
		position: relative;
	}

	.picker-btn {
		background: none;
		border: 1px solid var(--border);
		border-radius: 8px;
		padding: 0.375rem 0.5rem;
		cursor: pointer;
		color: var(--text-muted);
		display: flex;
		align-items: center;
		justify-content: center;
		transition:
			background 0.1s,
			color 0.1s,
			border-color 0.1s;
	}

	.picker-btn:hover,
	.picker-btn--active {
		background: var(--bg-muted);
		color: var(--text);
		border-color: var(--border-strong);
	}

	.picker-popover {
		position: absolute;
		top: calc(100% + 6px);
		right: 0;
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: 10px;
		box-shadow:
			0 4px 16px rgba(0, 0, 0, 0.1),
			0 1px 4px rgba(0, 0, 0, 0.06);
		z-index: 200;
		min-width: 160px;
		padding: var(--space-2);
	}

	.picker-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.picker-item {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: 0.375rem var(--space-2);
		border-radius: 6px;
		cursor: pointer;
		transition: background 0.1s;
	}

	.picker-item:hover {
		background: var(--bg-muted);
	}

	.picker-item--fixed {
		cursor: default;
		opacity: 0.5;
	}

	.picker-item--fixed:hover {
		background: none;
	}

	.picker-checkbox {
		width: 14px;
		height: 14px;
		flex-shrink: 0;
		accent-color: var(--accent);
	}

	.picker-label {
		font-size: var(--text-sm);
		color: var(--text);
		user-select: none;
	}

	.picker-label--fixed {
		color: var(--text-muted);
	}
</style>
