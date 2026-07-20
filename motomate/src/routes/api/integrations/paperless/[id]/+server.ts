import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	deletePaperlessIntegration,
	testPaperlessIntegration
} from '$lib/db/repositories/paperless-integrations.js';

export const POST: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) error(401, 'Unauthorized');
	try {
		return json(await testPaperlessIntegration(params.id, locals.user.id));
	} catch (cause) {
		error(502, cause instanceof Error ? cause.message : 'Paperless connection failed');
	}
};

export const DELETE: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) error(401, 'Unauthorized');
	try {
		await deletePaperlessIntegration(params.id, locals.user.id);
		return new Response(null, { status: 204 });
	} catch (cause) {
		error(409, cause instanceof Error ? cause.message : 'Unable to delete integration');
	}
};
