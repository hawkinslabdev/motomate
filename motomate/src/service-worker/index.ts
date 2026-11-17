import { self as sw } from '$app/service-worker';

sw.addEventListener('install', () => {
	sw.skipWaiting();
});

sw.addEventListener('activate', (event) => {
	async function dropCachesAndClaim() {
		for (const key of await caches.keys()) {
			if (key.startsWith('motomate-')) await caches.delete(key);
		}
		await sw.clients.claim();
	}

	event.waitUntil(dropCachesAndClaim());
});

sw.addEventListener('push', (event) => {
	if (!event.data) return;
	const { title, body } = event.data.json() as { title: string; body: string };
	event.waitUntil(sw.registration.showNotification(title, { body, icon: '/icon-192.png' }));
});

sw.addEventListener('notificationclick', (event) => {
	event.notification.close();
	async function focusOrOpen() {
		const windows = await sw.clients.matchAll({ type: 'window', includeUncontrolled: true });
		const open = windows.find((client) => new URL(client.url).origin === sw.location.origin);
		if (open) return open.focus();
		return sw.clients.openWindow('/');
	}

	event.waitUntil(focusOrOpen());
});
