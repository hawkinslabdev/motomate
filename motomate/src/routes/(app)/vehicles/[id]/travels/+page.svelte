<script lang="ts">
	import { untrack } from 'svelte';
	import type { PageData } from './$types';
	import { enhance } from '$app/forms';
	import { page } from '$app/stores';
	import { replaceState, beforeNavigate } from '$app/navigation';
	import { _, waitLocale } from '$lib/i18n';
	import { formatYearMonth } from '$lib/utils/format.js';
	import ConfirmDialog from '$lib/components/ui/ConfirmDialog.svelte';
	import TravelEntry from '$lib/components/travels/TravelEntry.svelte';
	import TravelFormModal from '$lib/components/travels/TravelFormModal.svelte';
	import TravelMap from '$lib/components/travels/TravelMap.svelte';
	import type { Travel } from '$lib/db/schema.js';

	interface GpxDoc {
		id: string;
		name: string; // original filename
		title?: string | null; // user-facing description
		url?: string | null;
		index: number;
	}

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

	async function toggleExcludedDay(travelId: string, dayIndex: number) {
		const formData = new FormData();
		formData.set('id', travelId);
		formData.set('day_index', String(dayIndex));

		const response = await fetch('?/toggleExcludedDay', {
			method: 'POST',
			body: formData
		});

		if (response.ok) {
			// Reload the page to get updated data
			window.location.reload();
		}
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

	// Search + sort + filter state
	let searchQuery = $state('');
	let sortBy = $state<'newest' | 'oldest' | 'name'>(
		untrack(() => data.page_prefs?.sortBy ?? 'newest')
	);
	let filterBy = $state<'all' | 'past' | 'upcoming'>(
		untrack(() => data.page_prefs?.filterBy ?? 'all')
	);

	// Persist sort + filter preferences
	let _prefTimer: ReturnType<typeof setTimeout>;
	let _pendingPrefs: object | null = null;
	let _firstRun = true;

	function flushPrefs() {
		if (!_pendingPrefs) return;
		const body = JSON.stringify({ page_prefs: { travels: _pendingPrefs } });
		_pendingPrefs = null;
		clearTimeout(_prefTimer);
		fetch('/api/prefs', {
			method: 'PATCH',
			keepalive: true,
			headers: { 'content-type': 'application/json' },
			body
		});
	}

	beforeNavigate(() => flushPrefs());

	$effect(() => {
		const s = sortBy;
		const f = filterBy;
		if (_firstRun) {
			_firstRun = false;
			return;
		}
		_pendingPrefs = { sortBy: s, filterBy: f };
		clearTimeout(_prefTimer);
		_prefTimer = setTimeout(flushPrefs, 600);
	});

	const today = new Date().toISOString().slice(0, 10);

	// Map / row selection state
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
		searchQuery = '';
		filterBy = 'all';
	}

	// Filtered + sorted + grouped travels for the list
	const displayedTravels = $derived((): Travel[] => {
		let list = [...data.travels] as Travel[];

		if (searchQuery.trim()) {
			const q = searchQuery.trim().toLowerCase();
			list = list.filter((t) => {
				if (t.title.toLowerCase().includes(q)) return true;
				if ((t.remark ?? '').toLowerCase().includes(q)) return true;

				// Date: match year, full month name, short month name, and "month year" combos
				try {
					const d = new Date(t.start_date + 'T00:00:00');
					const year = String(d.getFullYear());
					const monthLong = d.toLocaleDateString(locale, { month: 'long' }).toLowerCase();
					const monthShort = d.toLocaleDateString(locale, { month: 'short' }).toLowerCase();
					const full = `${monthLong} ${year}`;
					if (
						year.includes(q) ||
						monthLong.includes(q) ||
						monthShort.includes(q) ||
						full.includes(q)
					)
						return true;
				} catch {
					/* ignore */
				}

				return false;
			});
		}

		if (filterBy === 'past') list = list.filter((t) => t.start_date <= today);
		else if (filterBy === 'upcoming') list = list.filter((t) => t.start_date > today);

		if (selectedTravelIds.length > 0) {
			list = list.filter((t) => selectedTravelIds.includes(t.id));
		}

		if (sortBy === 'newest') list.sort((a, b) => b.start_date.localeCompare(a.start_date));
		else if (sortBy === 'oldest') list.sort((a, b) => a.start_date.localeCompare(b.start_date));
		else list.sort((a, b) => a.title.localeCompare(b.title));

		return list;
	});

	// Group by year-month
	const grouped = $derived((): [string, Travel[]][] => {
		const map = new Map<string, Travel[]>();
		for (const t of displayedTravels()) {
			const key = t.start_date.slice(0, 7);
			if (!map.has(key)) map.set(key, []);
			map.get(key)!.push(t);
		}
		return [...map.entries()];
	});

	const hasHistory = $derived(data.travels.length > 0);
	const hasActiveFilter = $derived(
		selectedTravelIds.length > 0 || searchQuery.trim() !== '' || filterBy !== 'all'
	);

	// Build GPX file list for the map, filtering out excluded days
	const gpxFiles = $derived(
		data.travels.flatMap((t: Travel) => {
			const excluded = (t.excluded_gpx_days as number[]) ?? [];
			return (t.gpx_document_ids as (string | null)[])
				.filter(
					(docId, i): docId is string => !!docId && !!data.gpxUrls[docId] && !excluded.includes(i)
				)
				.map((docId, i) => ({
					travelId: t.id,
					label: `${t.title} — Day ${i + 1}`,
					url: data.gpxUrls[docId],
					num: i + 1,
					dayIndex: i
				}));
		})
	);

	// Group GPX files by travelId for the day toggle UI
	const gpxFilesByTravel = $derived(
		gpxFiles.reduce(
			(acc, f) => {
				if (!acc[f.travelId]) acc[f.travelId] = [];
				acc[f.travelId].push(f);
				return acc;
			},
			{} as Record<string, typeof gpxFiles>
		)
	);

	// Get all travels that have GPX (with their excluded days info for toggle UI)
	const travelsWithGpx = $derived(
		data.travels
			.filter((t: Travel) => (t.gpx_document_ids as (string | null)[]).some(Boolean))
			.map((t: Travel) => ({
				id: t.id,
				title: t.title,
				durationDays: t.duration_days,
				gpxDocIds: t.gpx_document_ids as (string | null)[],
				excludedDays: (t.excluded_gpx_days as number[]) ?? []
			}))
	);

	const hasGpx = $derived(gpxFiles.length > 0);

	// Existing GPX docs for the editing travel (include download URL)
	const editingGpxDocs = $derived(
		editingTravel
			? editingTravel.gpx_document_ids
					.map((id: string | null, i: number): GpxDoc | null => {
						if (!id) return null;
						const d = data.gpxDocs.find((doc: any) => doc.id === id);
						if (!d) return null;
						return {
							id: d.id,
							name: d.name,
							title: d.title ?? null,
							url: data.gpxUrls[d.id] ?? null,
							index: i
						};
					})
					.filter((d: GpxDoc | null): d is GpxDoc => d !== null)
			: []
	);

	// Get excluded days for editing travel
	const editingExcludedDays = $derived(
		editingTravel ? ((editingTravel.excluded_gpx_days as number[]) ?? []) : []
	);
</script>

<!-- Page Header -->
<div class="page-header">
	<div class="page-header-text">
		<h2 class="section-title">{$_('travels.title')}</h2>
		<p class="section-sub">{$_('travels.subtitle')}</p>
	</div>
	<div class="page-actions">
		<button type="button" class="btn-primary" onclick={openCreate}>
			+ {$_('travels.add')}
		</button>
	</div>
</div>

<!-- Map (only when GPX routes exist) -->
{#if hasGpx}
	<div class="map-section">
		<TravelMap {gpxFiles} {selectedTravelIds} onrouteclick={handleRouteClick} />
	</div>
{/if}

<!-- Filters (only when there are travels) -->
{#if hasHistory}
	<div class="filters">
		<div class="search-box">
			<input
				type="text"
				placeholder={$_('travels.filter.search')}
				bind:value={searchQuery}
				class="search-input"
			/>
		</div>
		<div class="filter-controls">
			<select bind:value={filterBy} class="filter-select">
				<option value="all">{$_('travels.filter.all')}</option>
				<option value="past">{$_('travels.filter.past')}</option>
				<option value="upcoming">{$_('travels.filter.upcoming')}</option>
			</select>
			<select bind:value={sortBy} class="filter-select">
				<option value="newest">{$_('documents.sort.newest')}</option>
				<option value="oldest">{$_('documents.sort.oldest')}</option>
				<option value="name">{$_('documents.sort.name')}</option>
			</select>
			{#if hasActiveFilter}
				<button class="filter-clear-btn" onclick={clearFilter}>
					{$_('travels.map.clearFilter')}
				</button>
			{/if}
		</div>
	</div>
{/if}

<!-- Travel List -->
{#if hasHistory}
	{#if grouped().length === 0}
		<div class="empty">
			<span class="empty-icon"
				>{@html `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="32" height="32"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>`}</span
			>
			<p class="empty-title">{$_('travels.filter.noResults')}</p>
			<p class="empty-desc">{$_('travels.filter.noResultsDesc')}</p>
		</div>
	{:else}
		<div class="travel-list">
			{#each grouped() as [ym, group]}
				<div class="month-group">
					<div class="month-label">{formatYearMonth(ym, locale)}</div>
					{#each group as travel}
						<TravelEntry
							{travel}
							{locale}
							selected={selectedTravelIds.includes(travel.id)}
							onselect={(t) => handleRouteClick(t.id)}
							onedit={openEdit}
							ondelete={(t) => {
								deletingTravel = t;
							}}
						/>
					{/each}
				</div>
			{/each}
		</div>
	{/if}
{:else}
	<div class="empty-state">
		<div class="empty-icon">🗺️</div>
		<h2 class="empty-title">{$_('travels.empty.title')}</h2>
		<p class="empty-desc">{$_('travels.empty.description')}</p>
		<button type="button" class="btn-primary" onclick={openCreate}>+ {$_('travels.add')}</button>
	</div>
{/if}

<!-- Create / Edit Modal -->
<TravelFormModal
	open={formOpen}
	mode={formMode}
	travel={editingTravel}
	existingGpxDocs={editingGpxDocs}
	excludedGpxDays={editingExcludedDays}
	vehicleId={data.vehicle.id}
	{currency}
	{locale}
	onclose={() => {
		formOpen = false;
		editingTravel = null;
	}}
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
		onclose={() => {
			deletingTravel = null;
		}}
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
		flex-wrap: wrap;
		margin-bottom: var(--space-6);
	}
	.page-header-text {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}
	.section-title {
		font-size: var(--text-lg);
		font-weight: 600;
		color: var(--text);
		margin: 0;
	}
	.section-sub {
		font-size: var(--text-sm);
		color: var(--text-muted);
		margin: 0;
	}
	.page-actions {
		display: flex;
		gap: var(--space-2);
		align-items: center;
		flex-shrink: 0;
	}
	.btn-primary {
		padding: 0.5rem 1rem;
		background: var(--accent);
		color: #fff;
		border: none;
		border-radius: 10px;
		font-size: var(--text-sm);
		font-weight: 500;
		cursor: pointer;
	}
	.btn-primary:hover:not(:disabled) {
		background: var(--accent-hover);
	}

	/* Map */
	.map-section {
		margin-bottom: var(--space-5);
	}

	/* Filters — matches documents page pattern */
	.filters {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-3);
		margin: 0 0 var(--space-5);
		align-items: center;
	}
	.search-box {
		flex: 1;
		min-width: 200px;
	}
	.search-input {
		width: 100%;
		padding: 0.5rem 0.75rem;
		border: 1px solid var(--border);
		border-radius: 8px;
		background: var(--bg-subtle);
		color: var(--text);
		font-size: var(--text-sm);
		min-height: 40px;
		box-sizing: border-box;
	}
	.search-input:focus {
		outline: 2px solid var(--accent);
		outline-offset: 1px;
		border-color: transparent;
	}
	.filter-controls {
		display: flex;
		gap: var(--space-2);
		flex-wrap: wrap;
		align-items: center;
	}
	.filter-select {
		padding: 0.375rem 0.625rem;
		border: 1px solid var(--border);
		border-radius: 8px;
		background: var(--bg-subtle);
		color: var(--text);
		font-size: var(--text-sm);
		cursor: pointer;
		min-height: 40px;
	}
	.filter-select:focus {
		outline: 2px solid var(--accent);
		outline-offset: -1px;
	}
	.filter-clear-btn {
		padding: 0.375rem 0.75rem;
		border: 1px solid var(--border);
		border-radius: 8px;
		background: var(--bg-subtle);
		color: var(--text-muted);
		font-size: var(--text-sm);
		cursor: pointer;
		min-height: 40px;
		white-space: nowrap;
	}
	.filter-clear-btn:hover {
		background: var(--bg-muted);
		color: var(--text);
	}

	/* Empty search result */
	.empty {
		display: flex;
		flex-direction: column;
		align-items: center;
		text-align: center;
		padding: 3rem 1.5rem;
	}
	.empty .empty-icon {
		font-size: 2rem;
		margin-bottom: 1rem;
		opacity: 0.5;
	}
	.empty .empty-title {
		font-size: var(--text-lg);
		font-weight: 600;
		color: var(--text);
		margin: 0 0 0.5rem;
	}
	.empty .empty-desc {
		font-size: var(--text-sm);
		color: var(--text-muted);
		margin: 0;
		line-height: var(--leading-base);
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
