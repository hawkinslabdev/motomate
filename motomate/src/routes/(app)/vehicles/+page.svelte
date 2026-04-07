<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import type { PageData } from './$types';
	import VehicleCard from '$lib/components/ui/VehicleCard.svelte';
	import { _ } from '$lib/i18n';

	let { data, form }: { data: PageData; form: Record<string, unknown> | null } = $props();

	const locale = $derived((data as any).user?.settings?.locale ?? 'en');
	const onboardingDone = $derived((data as any).user?.settings?.onboarding_done ?? false);
	const favoriteVehicleId = $derived((data as any).user?.settings?.favorite_vehicle ?? null);

	const sortedVehicles = $derived(() => {
		const list = [...data.vehicles];
		if (favoriteVehicleId) {
			list.sort((a, b) => {
				if (a.id === favoriteVehicleId) return -1;
				if (b.id === favoriteVehicleId) return 1;
				return 0;
			});
		}
		return list;
	});

	async function handleFavorite(vehicleId: string) {
		const formData = new FormData();
		formData.set('vehicle_id', vehicleId === favoriteVehicleId ? '' : vehicleId);
		const response = await fetch('?/setFavorite', {
			method: 'POST',
			body: formData
		});
		const result = await response.json();
		invalidateAll();
	}
</script>

<svelte:head><title>{$_('vehicles.title')} &middot; MotoMate</title></svelte:head>

<div class="page-header">
	<div>
		<h1 class="page-title">{$_('vehicles.title')}</h1>
		<p class="page-sub">
			{$_('vehicles.vehicleCount', { values: { count: data.vehicles.length } })}
		</p>
	</div>
	<div class="page-actions">
		<a href="?archived={data.includeArchived ? '0' : '1'}" class="btn-ghost">
			{data.includeArchived ? $_('vehicles.archived.hide') : $_('vehicles.archived.show')}
		</a>
		<a href="/vehicles/new" class="btn-primary">{$_('vehicles.add')}</a>
	</div>
</div>

{#if data.vehicles.length === 0}
	<div class="empty">
		<div class="empty-icon" aria-hidden="true">🏍</div>
		{#if onboardingDone}
			<p class="empty-title">{$_('vehicles.empty.title')}</p>
			<p class="empty-desc">{$_('vehicles.empty.description')}</p>
		{:else}
			<p class="empty-title">{$_('vehicles.empty.title')}</p>
			<p class="empty-desc">{$_('dashboard.empty.descriptionOnboarding')}</p>
		{/if}
		<a href="/vehicles/new" class="btn-primary">{$_('vehicles.add')}</a>
	</div>
{:else}
	<div class="vehicle-list">
		{#each sortedVehicles() as vehicle}
			<div class="vehicle-row">
				<VehicleCard
					{vehicle}
					{locale}
					isFavorite={vehicle.id === favoriteVehicleId}
					onFavorite={handleFavorite}
				/>
			</div>
		{/each}
	</div>
{/if}

<style>
	.page-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		padding: var(--space-6) var(--space-6) 0;
		gap: var(--space-4);
		flex-wrap: wrap;
		margin-bottom: var(--space-5);
		max-width: 860px;
		margin-left: auto;
		margin-right: auto;
	}
	.page-title {
		font-size: var(--text-2xl);
		font-weight: 600;
		color: var(--text);
		letter-spacing: -0.02em;
		margin: 0;
	}
	.page-sub {
		font-size: var(--text-sm);
		color: var(--text-muted);
		margin: 0.25rem 0 0;
	}
	.page-actions {
		display: flex;
		gap: var(--space-2);
		align-items: center;
		flex-shrink: 0;
	}

	.btn-primary {
		display: inline-flex;
		align-items: center;
		padding: 0.5rem 0.875rem;
		min-height: 44px;
		background: var(--accent);
		color: #fff;
		border-radius: 10px;
		font-size: var(--text-sm);
		font-weight: 500;
		text-decoration: none;
		border: none;
		cursor: pointer;
	}
	.btn-primary:hover {
		background: var(--accent-hover);
	}
	.btn-ghost {
		display: inline-flex;
		align-items: center;
		padding: 0.5rem 0.75rem;
		min-height: 44px;
		background: transparent;
		color: var(--text-muted);
		border-radius: 10px;
		font-size: var(--text-sm);
		font-weight: 500;
		text-decoration: none;
		border: 1px solid var(--border);
	}
	.btn-ghost:hover {
		background: var(--bg-muted);
		color: var(--text);
	}

	.vehicle-list {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		padding: 0 var(--space-6) var(--space-6);
		max-width: 860px;
		margin: 0 auto;
	}

	.empty {
		display: flex;
		flex-direction: column;
		align-items: center;
		text-align: center;
		padding: 5rem var(--space-6);
	}
	.empty-icon {
		font-size: 3rem;
		margin-bottom: 1rem;
	}
	.empty-title {
		font-size: var(--text-lg);
		font-weight: 600;
		color: var(--text);
		margin: 0 0 0.5rem;
	}
	.empty-desc {
		font-size: var(--text-sm);
		color: var(--text-muted);
		margin: 0 0 1.25rem;
		line-height: var(--leading-base);
	}

	@media (max-width: 640px) {
		.page-header {
			padding: var(--space-4) var(--space-4) 0;
		}
		.vehicle-list {
			padding: 0 var(--space-4) var(--space-4);
		}
	}
</style>
