<script lang="ts">
	interface Props {
		count?: number;
		onclick?: () => void;
	}
	let { count = 0, onclick }: Props = $props();
</script>

<button
	class="bell"
	{onclick}
	aria-label={count > 0 ? `${count} unread notifications` : 'Notifications'}
>
	<svg
		width="20"
		height="20"
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		stroke-width="2"
		stroke-linecap="round"
		stroke-linejoin="round"
		aria-hidden="true"
	>
		<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
		<path d="M13.73 21a2 2 0 0 1-3.46 0" />
	</svg>
	{#if count > 0}
		<span class="badge" aria-hidden="true">{count > 99 ? '99+' : count}</span>
	{/if}
</button>

<style>
	.bell {
		position: relative;
		background: none;
		border: none;
		cursor: pointer;
		color: var(--text-muted);
		padding: 0.25rem 0.5rem;
		border-radius: 10px;
		display: flex;
		align-items: center;
	}
	.bell:hover {
		color: var(--text);
		background: var(--bg-muted);
	}
	.badge {
		position: absolute;
		top: 0;
		right: 0;
		background: var(--status-overdue);
		color: #fff;
		border-radius: 999px;
		font-size: 0.625rem;
		font-weight: 700;
		min-width: 1rem;
		height: 1rem;
		padding: 0 0.25rem;
		display: flex;
		align-items: center;
		justify-content: center;
		line-height: 1;
	}
</style>
