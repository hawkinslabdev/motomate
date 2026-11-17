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
	event.waitUntil(sw.registration.showNotification(title, { body, icon: '/icon.png' }));
});

sw.addEventListener('notificationclick', (event) => {
	event.notification.close();
	event.waitUntil(sw.clients.openWindow('/'));
});
