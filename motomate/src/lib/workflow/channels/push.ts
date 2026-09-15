import webpush from 'web-push';
import { db } from '$lib/db/index.js';
import { push_subscriptions } from '$lib/db/schema.js';
import { eq } from 'drizzle-orm';
import { getVapidConfig } from '$lib/server/vapid.js';

export async function dispatchPush(userId: string, title: string, body: string): Promise<void> {
	const { publicKey, privateKey, subject } = getVapidConfig();
	webpush.setVapidDetails(subject, publicKey, privateKey);

	const subs = await db.query.push_subscriptions.findMany({
		where: eq(push_subscriptions.user_id, userId)
	});

	const payload = JSON.stringify({ title, body });

	await Promise.allSettled(
		subs.map((sub) => webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, payload))
	);
}
