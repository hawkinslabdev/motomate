<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import type { PageData } from './$types';
	import { _, waitLocale } from '$lib/i18n';
	import { formatDateTime } from '$lib/utils/format';
	import PageHeader from '$lib/components/ui/PageHeader.svelte';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import Button from '$lib/components/ui/Button.svelte';

	let { data } = $props<{ data: PageData }>();

	$effect(() => {
		waitLocale();
	});

	const locale = $derived((data as any).user?.settings?.locale ?? 'en');
	const totalPages = $derived(Math.max(1, Math.ceil(data.total / data.perPage)));
	const hasUnread = $derived(
		data.notifications.some((n: { read_at: string | null }) => !n.read_at)
	);

	function formatNotifDate(dateStr: string) {
		return formatDateTime(dateStr, locale);
	}

	function navTo(p: number, f?: string) {
		const u = new URL($page.url);
		u.searchParams.set('page', String(p));
		u.searchParams.set('filter', f ?? data.filter);
		goto(u.toString(), { replaceState: false });
	}

	function setFilter(f: string) {
		navTo(1, f);
	}
</script>

<svelte:head>
	<title>{$_('settings.notifications.allTitle')} · {$_('layout.nav.settings')}</title>
</svelte:head>

<a href="/settings/notifications" class="back-link">{$_('settings.notifications.title')}</a>

<PageHeader title={$_('settings.notifications.allTitle')}>
	{#snippet children()}
		{#if hasUnread}
			<form method="POST" action="?/markAllRead" use:enhance>
				<button type="submit" class="text-action">{$_('settings.notifications.markAllRead')}</button>
			</form>
		{/if}
		{#if data.filter === 'all'}
			<form
				method="POST"
				action="?/deleteRead"
				use:enhance={() => {
					return async ({ update }) => {
						await update({ reset: false });
					};
				}}
			>
				<button type="submit" class="text-action text-action--danger">
					{$_('settings.notifications.deleteRead')}
				</button>
			</form>
		{/if}
	{/snippet}
</PageHeader>

<!-- Filter tabs -->
<div class="filter-tabs">
	<button
		class="filter-tab"
		class:filter-tab--active={data.filter === 'all'}
		onclick={() => setFilter('all')}
	>
		{$_('settings.notifications.filterAll')}
	</button>
	<button
		class="filter-tab"
		class:filter-tab--active={data.filter === 'unread'}
		onclick={() => setFilter('unread')}
	>
		{$_('settings.notifications.filterUnread')}
	</button>
</div>

{#if data.notifications.length === 0}
	<EmptyState icon="🔔" title={$_('settings.notifications.empty')} />
{:else}
	<div class="notif-list">
		{#each data.notifications as n}
			<div class="notif-row" class:notif-row--unread={!n.read_at}>
				<div class="notif-dot" class:notif-dot--unread={!n.read_at}></div>
				<div class="notif-body">
					<div class="notif-title">{n.title}</div>
					<div class="notif-text">{n.body}</div>
					<div class="notif-time">{formatNotifDate(n.created_at)}</div>
				</div>
				<div class="notif-actions">
					{#if !n.read_at}
						<form
							method="POST"
							action="?/markRead"
							use:enhance={({ formData: _fd }) => {
								return async ({ update }) => {
									await update({ reset: false });
								};
							}}
						>
							<input type="hidden" name="id" value={n.id} />
							<button type="submit" class="row-btn">
								{$_('settings.notifications.markRead')}
							</button>
						</form>
					{/if}
					<form
						method="POST"
						action="?/delete"
						use:enhance={() => {
							return async ({ update }) => {
								await update({ reset: false });
							};
						}}
					>
						<input type="hidden" name="id" value={n.id} />
						<button type="submit" class="row-btn row-btn--danger">
							{$_('settings.notifications.delete')}
						</button>
					</form>
				</div>
			</div>
		{/each}
	</div>

	{#if totalPages > 1}
		<div class="pagination">
			<Button
				variant="secondary"
				size="sm"
				disabled={data.page <= 1}
				onclick={() => navTo(data.page - 1)}
			>
				{$_('settings.notifications.prevPage')}
			</Button>
			<span class="page-label">
				{$_('settings.notifications.pageOf', {
					values: { page: data.page, total: totalPages }
				})}
			</span>
			<Button
				variant="secondary"
				size="sm"
				disabled={data.page >= totalPages}
				onclick={() => navTo(data.page + 1)}
			>
				{$_('settings.notifications.nextPage')}
			</Button>
		</div>
	{/if}
{/if}

<style>
	.back-link {
		display: inline-block;
		font-size: var(--text-sm);
		color: var(--text-muted);
		text-decoration: none;
		margin-bottom: var(--space-2);
	}
	.back-link:hover {
		color: var(--accent);
	}
	.back-link::before {
		content: '← ';
	}

	/* Header text actions — bare text links, not buttons */
	.text-action {
		font-size: var(--text-sm);
		font-weight: 500;
		color: var(--accent);
		background: none;
		border: none;
		cursor: pointer;
		padding: 0;
		line-height: 1;
	}
	.text-action:hover {
		text-decoration: underline;
	}
	.text-action--danger {
		color: var(--status-overdue);
	}

	/* Filter tabs — underline pattern matching nav */
	.filter-tabs {
		display: flex;
		border-bottom: 1px solid var(--border);
		margin-bottom: var(--space-5);
		margin-top: calc(-1 * var(--space-3));
	}
	.filter-tab {
		padding: 0.5rem 1rem;
		font-size: var(--text-sm);
		font-weight: 500;
		color: var(--text-muted);
		background: none;
		border: none;
		border-bottom: 2px solid transparent;
		margin-bottom: -1px;
		cursor: pointer;
		transition: color 0.1s;
	}
	.filter-tab:hover {
		color: var(--text);
	}
	.filter-tab--active {
		color: var(--accent);
		border-bottom-color: var(--accent);
	}

	/* Open entry list — Forgejo news feed pattern */
	.notif-list {
		display: flex;
		flex-direction: column;
	}
	.notif-row {
		display: flex;
		gap: var(--space-4);
		padding: 0.875rem 0;
		border-bottom: 1px solid var(--border);
		align-items: flex-start;
		opacity: 0.6;
		transition: opacity 0.1s;
	}
	.notif-row:first-child {
		border-top: 1px solid var(--border);
	}
	.notif-row--unread {
		opacity: 1;
	}
	.notif-dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		margin-top: 0.4rem;
		flex-shrink: 0;
		background: var(--border-strong);
	}
	.notif-dot--unread {
		background: var(--accent);
	}
	.notif-body {
		flex: 1;
		min-width: 0;
	}
	.notif-title {
		font-size: var(--text-sm);
		font-weight: 500;
		color: var(--text);
	}
	.notif-row--unread .notif-title {
		font-weight: 600;
	}
	.notif-text {
		font-size: var(--text-sm);
		color: var(--text-muted);
		margin-top: 0.125rem;
		line-height: var(--leading-snug);
	}
	.notif-time {
		font-size: var(--text-xs);
		color: var(--text-subtle);
		margin-top: 0.25rem;
	}

	/* Inline row actions — intentionally smaller than Button component */
	.notif-actions {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		align-items: flex-end;
		flex-shrink: 0;
	}
	.row-btn {
		font-size: var(--text-xs);
		color: var(--text-subtle);
		background: none;
		border: 1px solid var(--border);
		border-radius: 4px;
		padding: 0.25rem 0.5rem;
		cursor: pointer;
		white-space: nowrap;
		transition: color 0.1s, border-color 0.1s, background 0.1s;
	}
	.row-btn:hover {
		color: var(--text-muted);
		background: var(--bg-muted);
	}
	.row-btn--danger:hover {
		color: var(--status-overdue);
		border-color: var(--status-overdue);
		background: none;
	}

	/* Pagination */
	.pagination {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: var(--space-4);
		padding: var(--space-6) 0 var(--space-2);
	}
	.page-label {
		font-size: var(--text-sm);
		color: var(--text-muted);
		font-family: var(--font-mono);
		font-variant-numeric: tabular-nums;
	}
</style>
