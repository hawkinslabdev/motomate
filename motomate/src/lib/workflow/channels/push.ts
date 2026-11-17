import webpush from 'web-push';
import { db } from '#lib/db/index.js';
import { push_subscriptions } from '#lib/db/schema.js';
import { eq } from 'drizzle-orm';
import { getVapidConfig } from '#lib/server/vapid.js';

export async function dispatchPush(userId: string, title: string, body: string): Promise<void> {
	const { publicKey, privateKey, subject } = getVapidConfig();
	webpush.setVapidDetails(subject, publicKey, privateKey);

	const subs = await db.query.push_subscriptions.findMany({
		where: eq(push_subscriptions.user_id, userId)
	});

	const payload = JSON.stringify({ title, body });

	await Promise.all(
		subs.map((sub) =>
			webpush
				.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, payload)
				.catch(async (err: { statusCode?: number }) => {
					if (err.statusCode !== 404 && err.statusCode !== 410) throw err;
					await db.delete(push_subscriptions).where(eq(push_subscriptions.id, sub.id));
				})
		)
	);
}
