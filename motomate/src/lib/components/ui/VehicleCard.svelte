<script lang="ts">
	import { formatNumber } from '$lib/utils/format.js';
	import { _ } from '$lib/i18n';

	let {
		vehicle,
		locale = 'en',
		isFavorite = false,
		onFavorite
	}: {
		vehicle: {
			id: string;
			name: string;
			make: string;
			model: string;
			year: number;
			type: string;
			current_odometer: number;
			odometer_unit: string;
			archived_at?: string | null;
			cover_image_key?: string | null;
			meta?: { avatar_emoji?: string } | null;
			license_plate?: string | null;
		};
		locale?: string;
		isFavorite?: boolean;
		onFavorite?: (vehicleId: string) => void;
	} = $props();

	const defaultEmoji = $derived(
		vehicle.type === 'scooter' ? '🛵' : vehicle.type === 'bike' ? '🚲' : '🏍'
	);
	const avatarEmoji = $derived(vehicle.meta?.avatar_emoji ?? defaultEmoji);
	const hasAvatarImage = $derived(!!vehicle.cover_image_key);

	function handleFavoriteClick(e: MouseEvent) {
		e.preventDefault();
		e.stopPropagation();
		onFavorite?.(vehicle.id);
	}
</script>

<div class="vehicle-card-wrapper">
	<a
		href="/vehicles/{vehicle.id}"
		class="vehicle-card"
		class:vehicle-card--archived={!!vehicle.archived_at}
	>
		<div class="vehicle-avatar" aria-hidden="true">
			{#if hasAvatarImage}
				<img
					src="/api/files?key={vehicle.cover_image_key}"
					alt={vehicle.name}
					class="avatar-img"
					loading="lazy"
				/>
			{:else}
				<span class="avatar-emoji">{avatarEmoji}</span>
			{/if}
		</div>
		<div class="vehicle-info">
			<div class="vehicle-name-row">
				<span class="vehicle-name">{vehicle.name}</span>
				{#if vehicle.archived_at}
					<span class="archived-tag">{$_('vehicle.layout.archived')}</span>
				{/if}
			</div>
			<div class="vehicle-meta">
				{vehicle.make}
				{vehicle.model} · {vehicle.year}
				{#if vehicle.license_plate}
					· {vehicle.license_plate}{/if}
			</div>
			<div class="vehicle-odo">
				<span class="odo-value">{formatNumber(vehicle.current_odometer, locale)}</span>
				<span class="odo-unit">{vehicle.odometer_unit}</span>
			</div>
		</div>
	</a>
	{#if !vehicle.archived_at && onFavorite}
		<button
			class="favorite-btn"
			class:favorite-btn--active={isFavorite}
			onclick={handleFavoriteClick}
			title={isFavorite ? $_('vehicles.unfavorite') : $_('vehicles.favorite')}
			aria-label={isFavorite ? $_('vehicles.unfavorite') : $_('vehicles.favorite')}
			type="button"
		>
			<svg
				viewBox="0 0 24 24"
				fill={isFavorite ? 'currentColor' : 'none'}
				stroke="currentColor"
				stroke-width="2"
			>
				<path
					d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
				/>
			</svg>
		</button>
	{/if}
</div>

<style>
	.vehicle-card-wrapper {
		position: relative;
	}
	.vehicle-card {
		display: flex;
		align-items: center;
		gap: 1.25rem;
		padding: 1.25rem 1.5rem;
		border: 1px solid var(--border);
		border-radius: 10px;
		background: var(--bg);
		text-decoration: none;
		transition:
			border-color 0.15s cubic-bezier(0.25, 1, 0.5, 1),
			box-shadow 0.15s cubic-bezier(0.25, 1, 0.5, 1),
			transform 0.15s cubic-bezier(0.25, 1, 0.5, 1);
	}
	.vehicle-card:hover {
		border-color: var(--border-strong);
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
		transform: translateY(-1px);
	}
	.vehicle-card--archived {
		opacity: 0.7;
	}

	.vehicle-avatar {
		width: 56px;
		height: 56px;
		border-radius: 50%;
		background: var(--bg-muted);
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		overflow: hidden;
		transition: transform 0.15s cubic-bezier(0.25, 1, 0.5, 1);
	}
	.vehicle-card:hover .vehicle-avatar {
		transform: scale(1.05);
	}
	.avatar-emoji {
		font-size: 1.75rem;
		line-height: 1;
	}
	.avatar-img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.vehicle-info {
		flex: 1;
		min-width: 0;
	}
	.vehicle-name-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
	}
	.vehicle-name {
		font-size: var(--text-lg);
		font-weight: 600;
		color: var(--text);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.archived-tag {
		font-size: var(--text-xs);
		font-weight: 600;
		padding: 0.125rem 0.5rem;
		border-radius: 4px;
		background: var(--bg-muted);
		color: var(--text-subtle);
		border: 1px solid var(--border);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		white-space: nowrap;
	}
	.vehicle-meta {
		font-size: var(--text-sm);
		color: var(--text-muted);
		margin-top: 0.25rem;
	}
	.vehicle-odo {
		display: flex;
		align-items: baseline;
		gap: 0.25rem;
		margin-top: 0.5rem;
	}
	.odo-value {
		font-family: var(--font-mono);
		font-variant-numeric: tabular-nums;
		font-size: var(--text-xl);
		font-weight: 500;
		color: var(--text);
	}
	.odo-unit {
		font-size: var(--text-xs);
		color: var(--text-subtle);
	}

	/* Favorite button */
	.favorite-btn {
		position: absolute;
		top: 0.75rem;
		right: 0.75rem;
		width: 28px;
		height: 28px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: transparent;
		border: none;
		color: var(--text-subtle);
		cursor: pointer;
		opacity: 0.5;
		transition:
			opacity 0.15s,
			color 0.15s,
			transform 0.15s;
		z-index: 5;
	}
	.favorite-btn svg {
		width: 18px;
		height: 18px;
	}
	.favorite-btn:hover {
		opacity: 1;
		color: var(--accent);
		transform: scale(1.1);
	}
	.favorite-btn--active {
		opacity: 1;
		color: var(--accent);
	}
	.favorite-btn--active:hover {
		color: var(--accent-hover);
	}
</style>
