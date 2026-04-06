<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	import { _ } from '$lib/i18n';

	interface GpxFile {
		travelId: string;
		label: string;
		url: string;
	}

	interface Props {
		gpxFiles: GpxFile[];
		selectedTravelIds: string[];
		onrouteclick: (travelId: string) => void;
	}

	let { gpxFiles, selectedTravelIds, onrouteclick }: Props = $props();

	let mapEl: HTMLDivElement | undefined = $state();
	let map: any = null;
	let L: any = null;

	// url → the GPX layer object (for cleanup / deduplication)
	let gpxLayersByUrl = new Map<string, any>();
	// travelId → polyline sub-layers (for color + click handling)
	let gpxPolylines = new Map<string, any[]>();
	// guard so the gpxFiles $effect doesn't run before onMount finishes
	let mapReady = false;

	let loading = $state(true);
	let error = $state(false);

	const COLOR_SELECTED = '#2563eb'; // --accent
	const COLOR_DEFAULT = '#9ca3af';  // --text-subtle

	function getColor(travelId: string) {
		if (selectedTravelIds.length === 0) return COLOR_SELECTED;
		return selectedTravelIds.includes(travelId) ? COLOR_SELECTED : COLOR_DEFAULT;
	}
	function getOpacity(travelId: string) {
		return selectedTravelIds.length === 0 || selectedTravelIds.includes(travelId) ? 0.85 : 0.3;
	}

	function updateColors() {
		for (const [travelId, polys] of gpxPolylines) {
			const color = getColor(travelId);
			const opacity = getOpacity(travelId);
			for (const poly of polys) {
				poly.setStyle?.({ color, opacity });
			}
		}
	}

	// Re-colour routes whenever selection changes
	$effect(() => {
		selectedTravelIds; // reactive dependency
		if (map) updateColors();
	});

	// Sync map layers whenever gpxFiles prop changes (new travel added / deleted)
	$effect(() => {
		const files = gpxFiles; // reactive dependency
		if (!mapReady || !map || !L) return;

		// 1. Remove layers for URLs no longer in the prop
		const currentUrls = new Set(files.map((f: GpxFile) => f.url));
		for (const [url, gpxLayer] of gpxLayersByUrl) {
			if (!currentUrls.has(url)) {
				map.removeLayer(gpxLayer);
				gpxLayersByUrl.delete(url);
			}
		}
		// Prune polyline entries for travel IDs that are gone
		const activeTravelIds = new Set(files.map((f: GpxFile) => f.travelId));
		for (const id of gpxPolylines.keys()) {
			if (!activeTravelIds.has(id)) gpxPolylines.delete(id);
		}

		// 2. Add layers for URLs that aren't loaded yet
		const newFiles = files.filter((f: GpxFile) => !gpxLayersByUrl.has(f.url));
		if (newFiles.length > 0) {
			void addGpxLayers(newFiles, /* refitBounds */ true);
		}
	});

	async function addGpxLayers(files: GpxFile[], refitBounds = false) {
		const newBounds: any[] = [];

		for (const file of files) {
			if (gpxLayersByUrl.has(file.url)) continue;

			await new Promise<void>((resolve) => {
				const gpx = new (L as any).GPX(file.url, {
					async: true,
					polyline_options: {
						color: getColor(file.travelId),
						weight: 3,
						opacity: getOpacity(file.travelId)
					},
					marker_options: { startIconUrl: '', endIconUrl: '', shadowUrl: '' }
				});

				gpx.on('loaded', (e: any) => {
					const layer = e.target;
					gpxLayersByUrl.set(file.url, gpx);

					const bounds = layer.getBounds();
					if (bounds.isValid()) newBounds.push(bounds);

					// Collect polyline children for styling / click
					const polys: any[] = [];
					layer.eachLayer((l: any) => { if (l.setStyle) polys.push(l); });

					if (!gpxPolylines.has(file.travelId)) gpxPolylines.set(file.travelId, []);
					gpxPolylines.get(file.travelId)!.push(...polys);

					for (const poly of polys) {
						poly.on('click', () => onrouteclick(file.travelId));
						poly.on('mouseover', () => { poly.setStyle?.({ weight: 5 }); poly.bringToFront?.(); });
						poly.on('mouseout',  () => { poly.setStyle?.({ weight: 3 }); });
					}

					resolve();
				});

				gpx.on('error', () => resolve());
				gpx.addTo(map);
			});
		}

		if (refitBounds && newBounds.length > 0) {
			// Combine new bounds with all existing route bounds
			const allBounds: any[] = [...newBounds];
			for (const gpxLayer of gpxLayersByUrl.values()) {
				try {
					const b = gpxLayer.getBounds?.();
					if (b?.isValid()) allBounds.push(b);
				} catch { /* ignore */ }
			}
			if (allBounds.length > 0) {
				const combined = allBounds.reduce((acc: any, b: any) => acc.extend(b));
				map.fitBounds(combined, { padding: [32, 32] });
			}
		}

		updateColors();
	}

	async function initMap() {
		if (!mapEl || !browser) return;
		try {
			L = (await import('leaflet')).default;
			await import('leaflet-gpx');

			map = L.map(mapEl, { zoomControl: true, attributionControl: true });

			L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
				attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
				maxZoom: 18
			}).addTo(map);

			if (gpxFiles.length === 0) {
				map.setView([50.5, 4.5], 6); // Europe fallback
			} else {
				await addGpxLayers(gpxFiles, true);
			}

			mapReady = true;
			loading = false;
		} catch (e) {
			console.error('Map init failed:', e);
			error = true;
			loading = false;
		}
	}

	onMount(() => { initMap(); });

	onDestroy(() => {
		mapReady = false;
		map?.remove();
		map = null;
		gpxLayersByUrl.clear();
		gpxPolylines.clear();
	});
</script>

{#if browser}
	<div class="map-wrap">
		{#if loading}
			<div class="map-overlay">
				<span class="map-loading">{$_('travels.map.loading')}</span>
			</div>
		{/if}
		{#if error}
			<div class="map-overlay map-overlay--error">
				<span>{$_('travels.map.error')}</span>
			</div>
		{/if}
		<div bind:this={mapEl} class="map-canvas"></div>
	</div>
{/if}

<style>
	.map-wrap {
		position: relative;
		width: 100%;
		height: 360px;
		border-radius: 10px;
		overflow: hidden;
		border: 1px solid var(--border);
		background: var(--bg-muted);
		/*
		 * Creates a new stacking context so Leaflet's internal z-index values
		 * (controls at 800, popups at 700…) are scoped within the map container
		 * and cannot bleed above page-level overlays like Modal (z-index 450).
		 */
		isolation: isolate;
	}
	.map-canvas {
		width: 100%;
		height: 100%;
	}
	.map-overlay {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 10;
		background: var(--bg-subtle);
		pointer-events: none;
	}
	.map-overlay--error {
		background: color-mix(in srgb, var(--status-overdue) 6%, var(--bg));
	}
	.map-loading {
		font-size: var(--text-sm);
		color: var(--text-muted);
	}

	:global(.leaflet-interactive) {
		cursor: pointer;
	}
</style>
