<script lang="ts">
	import type { PageData } from './$types';
	import { enhance } from '$app/forms';
	import { page } from '$app/stores';
	import { replaceState } from '$app/navigation';
	import { _, waitLocale } from '$lib/i18n';
	import { formatYearMonth } from '$lib/utils/format.js';
	import ConfirmDialog from '$lib/components/ui/ConfirmDialog.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import TravelEntry from '$lib/components/travels/TravelEntry.svelte';
	import TravelFormModal from '$lib/components/travels/TravelFormModal.svelte';
	import TravelMap from '$lib/components/travels/TravelMap.svelte';
	import type { Travel } from '$lib/db/schema.js';

	let { data, form }: { data: PageData; form: Record<string, unknown> | null } = $props();

	$effect(() => {
		waitLocale();
	});

	const locale = $derived(data.user?.settings?.locale ?? 'en');
	const currency = $derived((data.user as any)?.settings?.currency ?? 'EUR');

	// Modal / dialog state
	let formOpen = $state(false);
	let formMode = $state<'create' | 'edit'>('create');
	let editingTravel = $state<Travel | null>(null);
	let deletingTravel = $state<Travel | null>(null);
	let deleteSubmitting = $state(false);
	let deleteFormEl: HTMLFormElement | undefined = $state();

	function openCreate() {
		formMode = 'create';
		editingTravel = null;
		formOpen = true;
	}

	function openEdit(travel: Travel) {
		formMode = 'edit';
		editingTravel = travel;
		formOpen = true;
	}

	// Close modal and reset on successful form submission
	$effect(() => {
		if (form?.created || form?.edited) {
			formOpen = false;
			editingTravel = null;
		}
		if (form?.deleted) {
			deletingTravel = null;
		}
	});

	// Handle ?edit=id and ?delete=id deep-links from the timeline
	$effect(() => {
		const editId = $page.url.searchParams.get('edit');
		if (editId) {
			const t = data.travels.find((t: Travel) => t.id === editId);
			if (t) openEdit(t);
			const url = new URL($page.url);
			url.searchParams.delete('edit');
			replaceState(url, $page.state);
			return;
		}
		const deleteId = $page.url.searchParams.get('delete');
		if (deleteId) {
			const t = data.travels.find((t: Travel) => t.id === deleteId);
			if (t) deletingTravel = t;
			const url = new URL($page.url);
			url.searchParams.delete('delete');
			replaceState(url, $page.state);
		}
	});

	// Map selection state
	let selectedTravelIds = $state<string[]>([]);

	function handleRouteClick(travelId: string) {
		if (selectedTravelIds.includes(travelId)) {
			selectedTravelIds = selectedTravelIds.filter((id) => id !== travelId);
		} else {
			selectedTravelIds = [...selectedTravelIds, travelId];
		}
	}

	function clearFilter() {
		selectedTravelIds = [];
	}

	// Filtered + grouped travels for the list
	const displayedTravels = $derived(
		selectedTravelIds.length > 0
			? data.travels.filter((t: Travel) => selectedTravelIds.includes(t.id))
			: data.travels
	);

	// Group by year-month
	const grouped = $derived((): [string, Travel[]][] => {
		const map = new Map<string, Travel[]>();
		for (const t of displayedTravels) {
			const key = t.start_date.slice(0, 7);
			if (!map.has(key)) map.set(key, []);
			map.get(key)!.push(t);
		}
		return [...map.entries()];
	});

	const hasHistory = $derived(data.travels.length > 0);

	// Build GPX file list for the map
	const gpxFiles = $derived(
		data.travels.flatMap((t: Travel) =>
			t.gpx_document_ids
				.filter((docId: string) => data.gpxUrls[docId])
				.map((docId: string, i: number) => ({
					travelId: t.id,
					label: `${t.title} — Day ${i + 1}`,
					url: data.gpxUrls[docId]
				}))
		)
	);

	const hasGpx = $derived(gpxFiles.length > 0);

	// Existing GPX docs for the editing travel (include download URL)
	const editingGpxDocs = $derived(
		editingTravel
			? editingTravel.gpx_document_ids
					.map((id: string) => data.gpxDocs.find((d: any) => d.id === id))
					.filter(Boolean)
					.map((d: any) => ({ id: d.id, name: d.name, url: data.gpxUrls[d.id] ?? null }))
			: []
	);
</script>

<!-- Page Header -->
<div class="page-header">
	<div>
		<h1 class="page-title">{$_('travels.title')}</h1>
		<p class="page-sub">{$_('travels.subtitle')}</p>
	</div>
	<div class="page-actions">
		<Button variant="primary" size="sm" onclick={openCreate}>
			{$_('travels.add')}
		</Button>
	</div>
</div>

<!-- Map (only when GPX routes exist) -->
{#if hasGpx}
	<div class="map-section">
		<TravelMap {gpxFiles} {selectedTravelIds} onrouteclick={handleRouteClick} />

		{#if selectedTravelIds.length > 0}
			<div class="filter-bar">
				<span class="filter-label">
					{$_('travels.map.filterActive', { values: { n: selectedTravelIds.length } })}
				</span>
				<button class="filter-clear" onclick={clearFilter}>
					{$_('travels.map.clearFilter')}
				</button>
			</div>
		{:else}
			<p class="map-hint">{$_('travels.map.clickHint')}</p>
		{/if}
	</div>
{/if}

<!-- Travel List -->
{#if hasHistory}
	<div class="travel-list">
		{#each grouped() as [ym, group]}
			<div class="month-group">
				<div class="month-label">{formatYearMonth(ym, locale)}</div>
				{#each group as travel}
					<TravelEntry
						{travel}
						{locale}
						onedit={openEdit}
						ondelete={(t) => { deletingTravel = t; }}
					/>
				{/each}
			</div>
		{/each}
	</div>
{:else}
	<div class="empty-state">
		<div class="empty-icon">🗺️</div>
		<h2 class="empty-title">{$_('travels.empty.title')}</h2>
		<p class="empty-desc">{$_('travels.empty.description')}</p>
		<Button variant="primary" onclick={openCreate}>{$_('travels.add')}</Button>
	</div>
{/if}

<!-- Create / Edit Modal -->
<TravelFormModal
	open={formOpen}
	mode={formMode}
	travel={editingTravel}
	existingGpxDocs={editingGpxDocs}
	vehicleId={data.vehicle.id}
	{currency}
	{locale}
	onclose={() => { formOpen = false; editingTravel = null; }}
/>

<!-- Delete Confirm Dialog -->
{#if deletingTravel}
	<ConfirmDialog
		open={!!deletingTravel}
		title={$_('travels.delete.title')}
		description={$_('travels.delete.description')}
		confirmLabel={$_('travels.delete.confirm')}
		cancelLabel={$_('travels.delete.cancel')}
		danger
		loading={deleteSubmitting}
		onclose={() => { deletingTravel = null; }}
		onconfirm={() => deleteFormEl?.requestSubmit()}
	/>
	<form
		bind:this={deleteFormEl}
		method="POST"
		action="?/delete"
		hidden
		use:enhance={() => {
			deleteSubmitting = true;
			return async ({ update }) => {
				await update();
				deleteSubmitting = false;
			};
		}}
	>
		<input type="hidden" name="id" value={deletingTravel.id} />
	</form>
{/if}

<style>
	.page-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--space-4);
		margin-bottom: var(--space-6);
	}
	.page-title {
		font-size: var(--text-2xl);
		font-weight: 600;
		color: var(--text);
		margin: 0;
		line-height: var(--leading-tight);
	}
	.page-sub {
		font-size: var(--text-sm);
		color: var(--text-muted);
		margin: 0.25rem 0 0;
	}
	.page-actions {
		flex-shrink: 0;
	}

	/* Map */
	.map-section {
		margin-bottom: var(--space-6);
	}
	.filter-bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-top: var(--space-3);
		padding: 0.5rem var(--space-4);
		background: var(--accent-subtle);
		border-radius: 8px;
		border: 1px solid color-mix(in srgb, var(--accent) 20%, var(--border));
	}
	.filter-label {
		font-size: var(--text-sm);
		color: var(--accent);
	}
	.filter-clear {
		background: none;
		border: none;
		cursor: pointer;
		font-size: var(--text-sm);
		color: var(--accent);
		font-weight: 500;
		padding: 0;
	}
	.filter-clear:hover {
		text-decoration: underline;
	}
	.map-hint {
		margin: var(--space-2) 0 0;
		font-size: var(--text-xs);
		color: var(--text-subtle);
		text-align: center;
	}

	/* Travel list */
	.travel-list {
		display: flex;
		flex-direction: column;
		gap: var(--space-6);
	}
	.month-group {
		display: flex;
		flex-direction: column;
	}
	.month-label {
		font-size: var(--text-xs);
		font-weight: 500;
		color: var(--text-subtle);
		text-transform: uppercase;
		letter-spacing: 0.07em;
		padding-bottom: var(--space-2);
		border-bottom: 1px solid var(--border);
		margin-bottom: 0;
	}

	/* Empty state */
	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		text-align: center;
		padding: var(--space-10) var(--space-4);
		gap: var(--space-3);
	}
	.empty-icon {
		font-size: 3rem;
		line-height: 1;
	}
	.empty-title {
		font-size: var(--text-lg);
		font-weight: 600;
		color: var(--text);
		margin: 0;
	}
	.empty-desc {
		font-size: var(--text-sm);
		color: var(--text-muted);
		line-height: var(--leading-base);
		max-width: 320px;
		margin: 0;
	}
</style>
