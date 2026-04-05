<script lang="ts">
	interface Props {
		label?: string;
		error?: string;
		hint?: string;
		type?: string;
		name?: string;
		value?: string | number;
		placeholder?: string;
		required?: boolean;
		disabled?: boolean | undefined;
		autocomplete?: string | undefined;
		mono?: boolean; // JetBrains Mono (for odometer, cost)
		class?: string;
	}
	let {
		label,
		error,
		hint,
		type = 'text',
		name,
		value = $bindable(''),
		placeholder,
		required,
		disabled = undefined,
		autocomplete = undefined,
		mono = false,
		class: className = ''
	}: Props = $props();
</script>

<div class="field {className}">
	{#if label}
		<label class="label" for={name}>
			{label}{#if required}<span class="req" aria-hidden="true">*</span>{/if}
		</label>
	{/if}
	<input
		{type}
		{name}
		id={name}
		bind:value
		{placeholder}
		{required}
		{disabled}
		autocomplete={autocomplete as any}
		class="input"
		class:input--error={!!error}
		class:input--mono={mono}
	/>
	{#if error}
		<span class="msg msg--error" role="alert">{error}</span>
	{:else if hint}
		<span class="msg msg--hint">{hint}</span>
	{/if}
</div>

<style>
	.field {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}
	.label {
		font-size: var(--text-sm);
		font-weight: 500;
		color: var(--text-muted);
	}
	.req {
		color: var(--status-overdue);
		margin-left: 2px;
	}
	.input {
		padding: 0.75rem;
		border: 1px solid var(--border);
		border-radius: 10px;
		background: var(--bg);
		color: var(--text);
		font-size: var(--text-md);
		font-family: var(--font-sans);
		width: 100%;
		min-height: 48px;
	}
	.input:hover {
		border-color: var(--border-strong);
	}
	.input--mono {
		font-family: var(--font-mono);
		font-variant-numeric: tabular-nums;
	}
	.input:focus {
		outline: 2px solid var(--accent);
		outline-offset: 1px;
		border-color: var(--accent);
	}
	.input:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}
	.input--error {
		border-color: var(--status-overdue);
	}
	.msg {
		font-size: var(--text-xs);
	}
	.msg--error {
		color: var(--status-overdue);
	}
	.msg--hint {
		color: var(--text-subtle);
	}
</style>
