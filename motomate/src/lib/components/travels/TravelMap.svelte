<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	import { _ } from '$lib/i18n';

	interface GpxFile {
		travelId: string;
		label: string;
		url: string;
		num: number;
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

	// url the GPX layer object (for cleanup / deduplication)
	let gpxLayersByUrl = new Map<string, any>();
	// travelId polyline sub-layers (for color + click handling)
	let gpxPolylines = new Map<string, any[]>();
	// travelId marker sub-layers (start/end pins)
	let gpxMarkers = new Map<string, any[]>();
	// url number label marker (shown when track is selected + travel has >1 track)
	let gpxLabels = new Map<string, any>();
	// url { travelId, num } for label visibility logic
	let gpxFileMeta = new Map<string, { travelId: string; num: number }>();
	// guard so the gpxFiles $effect doesn't run before onMount finishes
	let mapReady = false;

	// snapshot of the map's view when all routes are shown (for restore on deselect)
	let initialView: { center: [number, number]; zoom: number } | null = null;

	let loading = $state(true);
	let error = $state(false);

	const COLOR_SELECTED = '#2563eb'; // --accent
	const COLOR_DEFAULT = '#9ca3af'; // --text-subtle

	function getColor(travelId: string) {
		if (selectedTravelIds.length === 0) return COLOR_SELECTED;
		return selectedTravelIds.includes(travelId) ? COLOR_SELECTED : COLOR_DEFAULT;
	}
	function getOpacity(travelId: string) {
		if (selectedTravelIds.length === 0) return 0.85;
		return selectedTravelIds.includes(travelId) ? 1 : 0.06;
	}

	// How many GPX files belong to each travelId (for label show/hide logic)
	function trackCountForTravel(travelId: string): number {
		let n = 0;
		for (const meta of gpxFileMeta.values()) {
			if (meta.travelId === travelId) n++;
		}
		return n;
	}

	function updateColors() {
		for (const [travelId, polys] of gpxPolylines) {
			const color = getColor(travelId);
			const opacity = getOpacity(travelId);
			for (const poly of polys) {
				poly.setStyle?.({ color });
				const el = poly.getElement?.();
				if (el) el.style.opacity = String(opacity);
			}
		}
		for (const [travelId, markers] of gpxMarkers) {
			// Only show start/end pins when a specific travel is selected
			const visible = selectedTravelIds.length > 0 && selectedTravelIds.includes(travelId);
			const display = visible ? '' : 'none';
			for (const marker of markers) {
				const icon = marker._icon;
				const shadow = marker._shadow;
				if (icon) icon.style.display = display;
				if (shadow) shadow.style.display = display;
			}
		}
		// Show #N labels only when travel is selected and has multiple tracks
		for (const [url, label] of gpxLabels) {
			const meta = gpxFileMeta.get(url);
			if (!meta) continue;
			const selected = selectedTravelIds.includes(meta.travelId);
			const multiTrack = trackCountForTravel(meta.travelId) > 1;
			const show = selected && multiTrack;
			const el = label._icon;
			if (el) el.style.display = show ? '' : 'none';
		}
	}

	// Re-colour routes whenever selection changes
	$effect(() => {
		selectedTravelIds; // reactive dependency
		if (map) {
			// Capture the "all routes" view before zooming into a selection
			if (selectedTravelIds.length > 0 && initialView === null) {
				const c = map.getCenter();
				initialView = { center: [c.lat, c.lng], zoom: map.getZoom() };
			}
			updateColors();
			if (selectedTravelIds.length > 0) {
				fitToSelection();
			} else if (initialView !== null) {
				map.setView(initialView.center, initialView.zoom);
			}
		}
	});

	function fitToSelection() {
		if (selectedTravelIds.length === 0) return;
		const bounds: any[] = [];
		for (const travelId of selectedTravelIds) {
			const polys = gpxPolylines.get(travelId);
			if (!polys) continue;
			for (const poly of polys) {
				try {
					const b = poly.getBounds?.();
					if (b?.isValid()) bounds.push(b);
				} catch {
					/* ignore */
				}
			}
		}
		if (bounds.length > 0) {
			const combined = bounds.reduce((acc: any, b: any) => acc.extend(b));
			map.fitBounds(combined, { padding: [32, 32] });
		}
	}

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
				const label = gpxLabels.get(url);
				if (label) {
					map.removeLayer(label);
					gpxLabels.delete(url);
				}
				gpxFileMeta.delete(url);
			}
		}
		// Prune polyline + marker entries for travel IDs that are gone
		const activeTravelIds = new Set(files.map((f: GpxFile) => f.travelId));
		for (const id of gpxPolylines.keys()) {
			if (!activeTravelIds.has(id)) gpxPolylines.delete(id);
		}
		for (const id of gpxMarkers.keys()) {
			if (!activeTravelIds.has(id)) gpxMarkers.delete(id);
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

					// leaflet-gpx nests layers: GPX > FeatureGroup(s) > Polyline/Marker
					// We need two levels of iteration to reach the actual primitives.
					const polys: any[] = [];
					const markers: any[] = [];
					layer.eachLayer((child: any) => {
						const collect = (l: any) => {
							if (typeof l.getLatLngs === 'function')
								polys.push(l); // Polyline
							else if (typeof l.getLatLng === 'function') markers.push(l); // Marker
						};
						if (typeof child.eachLayer === 'function') {
							child.eachLayer(collect); // FeatureGroup > go one level deeper
						} else {
							collect(child);
						}
					});

					if (!gpxPolylines.has(file.travelId)) gpxPolylines.set(file.travelId, []);
					gpxPolylines.get(file.travelId)!.push(...polys);

					if (!gpxMarkers.has(file.travelId)) gpxMarkers.set(file.travelId, []);
					gpxMarkers.get(file.travelId)!.push(...markers);

					for (const poly of polys) {
						poly.on('click', () => onrouteclick(file.travelId));
						poly.on('mouseover', () => {
							poly.setStyle?.({ weight: 5 });
							poly.bringToFront?.();
						});
						poly.on('mouseout', () => {
							poly.setStyle?.({ weight: 3 });
						});
					}

					// Create a #N label at the midpoint of the first polyline
					gpxFileMeta.set(file.url, { travelId: file.travelId, num: file.num });
					if (polys.length > 0) {
						const latlngs = polys[0].getLatLngs?.() ?? [];
						const flat = Array.isArray(latlngs[0]) ? latlngs[0] : latlngs;
						const mid = flat[Math.floor(flat.length / 2)];
						if (mid) {
							const label = (L as any)
								.marker(mid, {
									icon: (L as any).divIcon({
										className: 'gpx-num-label',
										html: `#${file.num}`,
										iconSize: [24, 24],
										iconAnchor: [12, 12]
									}),
									interactive: false
								})
								.addTo(map);
							// Hidden by default, updateColors will show when needed
							if (label._icon) label._icon.style.display = 'none';
							gpxLabels.set(file.url, label);
						}
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
				} catch {
					/* ignore */
				}
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
				attribution:
					'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
				maxZoom: 18,
				referrerPolicy: 'origin-when-cross-origin'
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

	onMount(() => {
		initMap();
	});

	onDestroy(() => {
		mapReady = false;
		map?.remove();
		map = null;
		gpxLayersByUrl.clear();
		gpxPolylines.clear();
		gpxMarkers.clear();
		gpxLabels.clear();
		gpxFileMeta.clear();
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

	:global(.gpx-num-label) {
		background: #2563eb;
		color: #fff;
		font-size: 11px;
		font-weight: 600;
		font-family: var(--font-mono, monospace);
		border-radius: 50%;
		width: 24px;
		height: 24px;
		display: flex;
		align-items: center;
		justify-content: center;
		border: 2px solid #fff;
		box-shadow: 0 1px 4px rgba(0, 0, 0, 0.35);
		pointer-events: none;
	}
</style>
