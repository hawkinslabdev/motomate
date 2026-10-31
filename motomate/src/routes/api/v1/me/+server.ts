import type { RequestHandler } from '@sveltejs/kit';
import { ok } from '#lib/api/response.js';
import { requireAuth } from '#lib/api/guards.js';

export const GET: RequestHandler = async ({ locals }) => {
	const authErr = requireAuth(locals);
	if (authErr) return authErr;

	const { password_hash: _pw, ...safeUser } = locals.user! as typeof locals.user & {
		password_hash?: unknown;
	};
	return ok(safeUser);
};
