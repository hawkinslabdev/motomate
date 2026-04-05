import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { runWorkflowChecks } from '$lib/workflow/engine.js';

export const POST: RequestHandler = async ({ request, locals }) => {
	const cronSecret = env.CRON_SECRET;

	// Auth path 1: external cron with secret header
	const headerSecret = request.headers.get('X-Cron-Secret');
	if (cronSecret && headerSecret === cronSecret) {
		// Run for ALL users (global cron)
		const result = await runWorkflowChecks();
		return json({ ok: true, ...result });
	}

	// Auth path 2: authenticated user (login trigger or manual refresh)
	if (locals.user) {
		const result = await runWorkflowChecks(locals.user.id);
		return json({ ok: true, ...result });
	}

	error(401, 'Unauthorized');
};

// Also allow GET for simple health check / manual trigger from browser when authenticated
export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) error(401, 'Unauthorized');
	const result = await runWorkflowChecks(locals.user.id);
	return json({ ok: true, ...result });
};
