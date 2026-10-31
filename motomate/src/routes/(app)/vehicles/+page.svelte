<script lang="ts">
	import EmptyState from '#lib/components/ui/EmptyState.svelte';
	import { refreshAll } from '$app/navigation';
	import type { PageData } from './$types';
	import VehicleCard from '#lib/components/ui/VehicleCard.svelte';
	import { _ } from '#lib/i18n/index.js';

	let { data }: { data: PageData } = $props();

	const locale = $derived(data.formatLocale);
	const onboardingDone = $derived((data as any).user?.settings?.onboarding_done ?? false);
	const favoriteVehicleId = $derived((data as any).user?.settings?.favorite_vehicle ?? null);

	const sortedVehicles = $derived.by(() => {
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
		await fetch('?/setFavorite', {
			method: 'POST',
			body: formData
		});
		refreshAll();
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
	<EmptyState
		title={$_('vehicles.empty.title')}
		description={onboardingDone
			? $_('vehicles.empty.description')
			: $_('dashboard.empty.descriptionOnboarding')}
	/>
{:else}
	<div class="vehicle-list">
		{#each sortedVehicles as vehicle (vehicle.id)}
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
		flex-wrap: wrap;
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
		color: var(--accent-fg);
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

	@media (max-width: 640px) {
		.page-header {
			padding: var(--space-4) var(--space-4) 0;
			flex-direction: column;
			align-items: stretch;
		}
		.vehicle-list {
			padding: 0 var(--space-4) var(--space-4);
		}
		.page-actions {
			flex-direction: column-reverse;
			width: 100%;
		}
		.btn-primary,
		.btn-ghost {
			width: 100%;
			justify-content: center;
		}
	}
</style>
