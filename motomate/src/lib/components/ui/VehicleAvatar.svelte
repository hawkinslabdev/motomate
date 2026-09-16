<script lang="ts">
	import { defaultVehicleEmoji } from '$lib/utils/vehicle-avatar.js';

	let {
		vehicle,
		size = 40,
		class: className = ''
	}: {
		vehicle: {
			type?: string;
			cover_image_key?: string | null;
			meta?: { avatar_emoji?: string } | null;
			name?: string;
		};
		size?: number;
		class?: string;
	} = $props();

	const emoji = $derived(vehicle.meta?.avatar_emoji ?? defaultVehicleEmoji(vehicle.type));
	const hasImage = $derived(!!vehicle.cover_image_key);
</script>

<span class="vehicle-avatar {className}" style="--vehicle-avatar-size: {size}px" aria-hidden="true">
	{#if hasImage}
		<img src="/api/files?key={vehicle.cover_image_key}" alt="" loading="lazy" />
	{:else}
		{emoji}
	{/if}
</span>

<style>
	.vehicle-avatar {
		width: var(--vehicle-avatar-size);
		height: var(--vehicle-avatar-size);
		border-radius: 50%;
		overflow: hidden;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		font-size: calc(var(--vehicle-avatar-size) * 0.55);
		line-height: 1;
	}

	.vehicle-avatar img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
</style>
