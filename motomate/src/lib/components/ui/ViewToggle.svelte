<script lang="ts">
	interface Option {
		value: string;
		label: string;
	}

	let {
		options,
		value,
		onchange
	}: {
		options: Option[];
		value: string;
		onchange: (v: string) => void;
	} = $props();
</script>

<div class="view-toggle" role="group">
	{#each options as opt}
		<button
			type="button"
			class="view-btn"
			class:view-btn--active={value === opt.value}
			onclick={() => onchange(opt.value)}
		>
			{opt.label}
		</button>
	{/each}
</div>

<style>
	.view-toggle {
		display: flex;
		flex-wrap: wrap;
		background: var(--bg-muted);
		border-radius: 8px;
		padding: 2px;
		gap: 2px;
		min-width: 0;
	}

	.view-btn {
		padding: 0.375rem 0.75rem;
		font-size: var(--text-sm);
		font-weight: 500;
		background: transparent;
		border: none;
		border-radius: 6px;
		cursor: pointer;
		color: var(--text-muted);
		transition:
			background 0.15s,
			color 0.15s;
		flex: 1 1 auto;
		min-width: 0;
	}

	.view-btn:hover {
		color: var(--text);
	}

	.view-btn:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: -2px;
	}

	.view-btn--active {
		background: var(--bg);
		color: var(--text);
		box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
	}
</style>
