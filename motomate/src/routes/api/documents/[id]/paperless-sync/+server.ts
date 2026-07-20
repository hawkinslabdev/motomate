import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { enqueueDocumentSync } from '$lib/db/repositories/document-sync-jobs.js';

export const POST: RequestHandler = async ({ locals, params, request }) => {
	if (!locals.user) error(401, 'Unauthorized');
	const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
	if (!body || typeof body.integration_id !== 'string') error(400, 'integration_id is required');
	if (body.mode !== 'mirror' && body.mode !== 'move') error(400, 'mode must be mirror or move');

	try {
		const job = await enqueueDocumentSync(
			params.id,
			locals.user.id,
			body.integration_id,
			body.mode
		);
		return json({ job }, { status: 202 });
	} catch (cause) {
		error(400, cause instanceof Error ? cause.message : 'Unable to queue document sync');
	}
};
