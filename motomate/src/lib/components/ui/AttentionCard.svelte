<script lang="ts">
	import { _ } from '$lib/i18n';

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
	<div class="card-cta" aria-hidden="true">{$_('vehicle.detail.logLink')} →</div>
</a>

<style>
	.attention-card {
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 1rem 1.25rem;
		border: 1px solid var(--border);
		border-radius: 8px;
		border-left-width: 3px;
		text-decoration: none;
		transition: border-color 0.15s;
	}
	.attention-card--due {
		border-left-color: var(--status-due);
		background: color-mix(in srgb, var(--status-due) 6%, var(--bg));
	}
	.attention-card--overdue {
		border-left-color: var(--status-overdue);
		background: color-mix(in srgb, var(--status-overdue) 6%, var(--bg));
	}
	.attention-card:hover {
		border-color: var(--border-strong);
	}
	.attention-card--due:hover {
		border-left-color: var(--status-due);
	}
	.attention-card--overdue:hover {
		border-left-color: var(--status-overdue);
	}

	.card-body {
		flex: 1;
		min-width: 0;
	}
	.card-vehicle {
		font-size: var(--text-xs);
		font-weight: 500;
		color: var(--text-muted);
		margin-bottom: 0.125rem;
	}
	.card-task {
		font-size: var(--text-base);
		font-weight: 500;
		color: var(--text);
	}
	.card-detail {
		font-size: var(--text-sm);
		margin-top: 0.125rem;
	}
	.attention-card--due .card-detail {
		color: var(--status-due);
	}
	.attention-card--overdue .card-detail {
		color: var(--status-overdue);
	}

	.card-cta {
		font-size: var(--text-sm);
		font-weight: 500;
		color: var(--text-subtle);
		flex-shrink: 0;
		white-space: nowrap;
	}
	.attention-card--due .card-cta {
		color: var(--status-due);
	}
	.attention-card--overdue .card-cta {
		color: var(--status-overdue);
	}
</style>
