import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { markRead, markAllRead, getNotifications } from '$lib/workflow/channels/inapp.js';

export const GET: RequestHandler = async ({ locals, url }) => {
	if (!locals.user) error(401);
	const rawLimit = parseInt(url.searchParams.get('limit') ?? '3');
	const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 10) : 3;
	const filter = url.searchParams.get('filter') === 'unread' ? 'unread' : 'all';
	const items = await getNotifications(locals.user.id, limit, 0, filter);
	return json(items);
};

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) error(401);
	const { id, all } = await request.json();
	if (all) {
		await markAllRead(locals.user.id);
	} else if (id) {
		await markRead(id, locals.user.id);
	}
	return json({ ok: true });
};
