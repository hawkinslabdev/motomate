import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { db } from '$lib/db/index.js';
import { push_subscriptions } from '$lib/db/schema.js';
import { generateId } from '$lib/utils/id.js';
import { and, eq } from 'drizzle-orm';
import { updateUserSettings } from '$lib/db/repositories/users.js';

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) error(401);
	const sub = await request.json();
	if (!sub.endpoint || !sub.keys) error(400, 'Invalid subscription');

	// Unscoped: unique endpoint constraint requires deleting stale cross-account row
	await db.delete(push_subscriptions).where(eq(push_subscriptions.endpoint, sub.endpoint));
	await db.insert(push_subscriptions).values({
		id: generateId(),
		user_id: locals.user.id,
		endpoint: sub.endpoint,
		keys: sub.keys
	});

	const channels = locals.user.settings?.notification_channels ?? {};
	if (!channels.push?.enabled) {
		await updateUserSettings(locals.user.id, {
			notification_channels: { ...channels, push: { enabled: true } }
		});
	}

	return json({ ok: true });
};

export const DELETE: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) error(401);
	const { endpoint } = await request.json();
	// Scoped: unsubscribing must not be able to silence another account's device.
	await db
		.delete(push_subscriptions)
		.where(
			and(eq(push_subscriptions.endpoint, endpoint), eq(push_subscriptions.user_id, locals.user.id))
		);
	return json({ ok: true });
};
