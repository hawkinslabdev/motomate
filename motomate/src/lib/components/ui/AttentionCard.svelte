<script lang="ts">
	import { _ } from '#lib/i18n/index.js';

	let {
		status,
		vehicleName,
		taskName,
		detail,
		href
	}: {
		status: 'due' | 'overdue';
		vehicleName: string;
		taskName: string;
		detail: string;
		href: string;
	} = $props();
</script>

<a {href} class="attention-card attention-card--{status}">
	<div class="card-body">
		<div class="card-vehicle">{vehicleName}</div>
		<div class="card-task">{taskName}</div>
		<div class="card-detail">{detail}</div>
	</div>
	<div class="card-cta" aria-hidden="true">→</div>
</a>

<style>
	.attention-card {
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 0.875rem 1.25rem;
		border: 1px solid var(--border);
		border-radius: 8px;
		text-decoration: none;
		transition:
			background 0.15s,
			border-color 0.15s;
	}
	.attention-card--due {
		background: color-mix(in srgb, var(--status-due) 6%, var(--bg));
		border-color: color-mix(in srgb, var(--status-due) 20%, var(--border));
	}
	.attention-card--overdue {
		background: color-mix(in srgb, var(--status-overdue) 6%, var(--bg));
		border-color: color-mix(in srgb, var(--status-overdue) 20%, var(--border));
	}
	.attention-card--due:hover {
		background: color-mix(in srgb, var(--status-due) 10%, var(--bg));
	}
	.attention-card--overdue:hover {
		background: color-mix(in srgb, var(--status-overdue) 10%, var(--bg));
	}

	.attention-card:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}

	.card-body {
		flex: 1;
		min-width: 0;
	}
	.card-vehicle {
		font-size: var(--text-sm);
		font-weight: 500;
		color: var(--text-muted);
		margin-bottom: 0.125rem;
	}
	.card-task {
		font-size: var(--text-base);
		font-weight: 600;
		color: var(--text);
	}
	.card-detail {
		font-size: var(--text-sm);
		font-weight: 400;
		margin-top: 0.125rem;
	}
	.attention-card--due .card-detail {
		color: var(--status-due);
	}
	.attention-card--overdue .card-detail {
		color: var(--status-overdue);
	}

	.card-cta {
		font-size: var(--text-base);
		color: var(--text-subtle);
		flex-shrink: 0;
	}
</style>
