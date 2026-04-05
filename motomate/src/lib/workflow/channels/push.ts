import webpush from 'web-push';
import { db } from '$lib/db/index.js';
import { push_subscriptions } from '$lib/db/schema.js';
import { eq } from 'drizzle-orm';
import { env } from '$env/dynamic/private';

function getVapidConfigured(): boolean {
	return !!(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY && env.VAPID_SUBJECT);
}

export async function dispatchPush(userId: string, title: string, body: string): Promise<void> {
	if (!getVapidConfigured()) return;

	webpush.setVapidDetails(env.VAPID_SUBJECT!, env.VAPID_PUBLIC_KEY!, env.VAPID_PRIVATE_KEY!);

	const subs = await db.query.push_subscriptions.findMany({
		where: eq(push_subscriptions.user_id, userId)
	});

	const payload = JSON.stringify({ title, body });

	await Promise.allSettled(
		subs.map((sub) => webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, payload))
	);
}
