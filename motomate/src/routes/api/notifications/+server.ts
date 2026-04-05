import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { markRead, markAllRead } from '$lib/workflow/channels/inapp.js';

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
