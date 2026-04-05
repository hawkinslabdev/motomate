import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { db } from '$lib/db/index.js';
import { push_subscriptions } from '$lib/db/schema.js';
import { generateId } from '$lib/utils/id.js';
import { eq } from 'drizzle-orm';

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) error(401);
	const sub = await request.json();
	if (!sub.endpoint || !sub.keys) error(400, 'Invalid subscription');

	// Upsert — replace existing subscription for same endpoint
	await db.delete(push_subscriptions).where(eq(push_subscriptions.endpoint, sub.endpoint));
	await db.insert(push_subscriptions).values({
		id: generateId(),
		user_id: locals.user.id,
		endpoint: sub.endpoint,
		keys: sub.keys
	});
	return json({ ok: true });
};

export const DELETE: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) error(401);
	const { endpoint } = await request.json();
	await db.delete(push_subscriptions).where(eq(push_subscriptions.endpoint, endpoint));
	return json({ ok: true });
};
