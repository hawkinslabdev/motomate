import { error } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { runWorkflowChecks } from '#lib/workflow/engine.js';

export const POST: RequestHandler = async ({ locals }) => {
	if (!locals.user) error(401, 'Unauthorized');
	const result = await runWorkflowChecks(locals.user.id);
	return Response.json({ ok: true, ...result });
};

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) error(401, 'Unauthorized');
	const result = await runWorkflowChecks(locals.user.id);
	return Response.json({ ok: true, ...result });
};
