/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />
/// <reference types="@sveltejs/kit" />

import { build, files, version } from '$service-worker';

const sw =
	/** @type {ServiceWorkerGlobalScope} */ /** @type {unknown} */ globalThis.self as ServiceWorkerGlobalScope;

const CACHE = `motomate-${version}`;

const ASSETS = [
	...build, // hashed app bundles
	...files // static/ directory
];

sw.addEventListener('install', (event) => {
	async function precache() {
		const cache = await caches.open(CACHE);
		await cache.addAll(ASSETS);
	}

	event.waitUntil(precache());
});

sw.addEventListener('activate', (event) => {
	async function deleteOldCaches() {
		for (const key of await caches.keys()) {
			if (key !== CACHE) await caches.delete(key);
		}
	}

	event.waitUntil(deleteOldCaches());
});

sw.addEventListener('push', (event) => {
	if (!event.data) return;
	const { title, body } = event.data.json() as { title: string; body: string };
	event.waitUntil(sw.registration.showNotification(title, { body, icon: '/icon.png' }));
});

sw.addEventListener('notificationclick', (event) => {
	event.notification.close();
	event.waitUntil(sw.clients.openWindow('/'));
});

sw.addEventListener('fetch', (event) => {
	if (event.request.method !== 'GET') return;

	const url = new URL(event.request.url);
	if (url.origin !== sw.location.origin) return;

	async function respond() {
		const cache = await caches.open(CACHE);

		// Precached assets (hashed); we'll always serve from cache
		if (ASSETS.includes(url.pathname)) {
			const cached = await cache.match(url.pathname);
			if (cached) return cached;
		}

		// Everything else: network-first, cache fallback
		try {
			const response = await fetch(event.request);

			if (!(response instanceof Response)) {
				throw new Error('invalid response from fetch');
			}

			// API responses carry per-user data that would outlive the session; keep page shells only
			const cacheable = !url.pathname.startsWith('/api/');

			if (response.status === 200 && cacheable) {
				cache.put(event.request, response.clone());
			}

			return response;
		} catch (err) {
			const cached = await cache.match(event.request);
			if (cached) return cached;

			throw err;
		}
	}

	event.respondWith(respond());
});
