import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	createPaperlessIntegration,
	listPaperlessIntegrations
} from '$lib/db/repositories/paperless-integrations.js';

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) error(401, 'Unauthorized');
	return json({ integrations: await listPaperlessIntegrations(locals.user.id) });
};

export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) error(401, 'Unauthorized');
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		error(400, 'Invalid JSON');
	}
	try {
		return json(
			{ integration: await createPaperlessIntegration(locals.user.id, body) },
			{ status: 201 }
		);
	} catch (cause) {
		const message = cause instanceof Error ? cause.message : 'Unable to create integration';
		if (message.includes('INTEGRATION_ENCRYPTION_KEY')) error(500, message);
		if (message.includes('Paperless request failed')) error(502, message);
		error(400, message);
	}
};
