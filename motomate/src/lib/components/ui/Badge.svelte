<script lang="ts">
	interface Props {
		status: 'ok' | 'due' | 'overdue' | 'archived';
		size?: 'sm' | 'md';
	}
	let { status, size = 'md' }: Props = $props();

	const config = {
		ok: { icon: '✓', label: 'OK', color: 'var(--status-ok)' },
		due: { icon: '!', label: 'Due', color: 'var(--status-due)' },
		overdue: { icon: '‼', label: 'Overdue', color: 'var(--status-overdue)' },
		archived: { icon: '⊘', label: 'Archived', color: 'var(--text-subtle)' }
	};
	const c = $derived(config[status]);
</script>

<span
	class="badge badge--{size}"
	style="color:{c.color};border-color:color-mix(in srgb, {c.color} 30%, transparent);background:color-mix(in srgb, {c.color} 10%, transparent)"
>
	<span class="badge-icon" aria-hidden="true">{c.icon}</span>
	<span>{c.label}</span>
</span>

<style>
	.badge {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		border-radius: 4px;
		border: 1px solid;
		font-weight: 500;
		letter-spacing: 0.01em;
	}
	.badge--sm {
		padding: 0.125rem 0.375rem;
		font-size: 0.75rem;
	}
	.badge--md {
		padding: 0.25rem 0.5rem;
		font-size: 0.8125rem;
	}
	.badge-icon {
		font-style: normal;
		font-size: 0.9em;
	}
</style>
