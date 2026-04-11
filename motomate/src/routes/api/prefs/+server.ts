import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { updateUserSettings } from '$lib/db/repositories/users.js';
import type { PagePrefs } from '$lib/db/schema.js';

export const PATCH: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) throw error(401, 'Unauthorized');

	const body = await request.json().catch(() => null);
	if (!body || typeof body !== 'object') throw error(400, 'Invalid body');

	const incoming: PagePrefs = body.page_prefs ?? {};
	const existing: PagePrefs = (locals.user as any).settings?.page_prefs ?? {};

	// Deep merge one level — don't clobber sibling page prefs
	const merged: PagePrefs = { ...existing };
	for (const key of Object.keys(incoming) as (keyof PagePrefs)[]) {
		(merged as any)[key] = { ...(existing[key] ?? {}), ...(incoming[key] ?? {}) };
	}

	await updateUserSettings(locals.user.id, { page_prefs: merged });

	return json({ ok: true });
};
