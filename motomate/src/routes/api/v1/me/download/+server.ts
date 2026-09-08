import type { RequestHandler } from '@sveltejs/kit';
import { ok } from '$lib/api/response.js';
import { requireAuth } from '$lib/api/guards.js';
import { createDownloadToken, tokenExpiresAt } from '$lib/server/download-token.js';
import { env as pubEnv } from '$env/dynamic/public';

export const GET: RequestHandler = async ({ locals, url }) => {
	const authErr = requireAuth(locals);
	if (authErr) return authErr;

	const rawFormat = url.searchParams.get('format') ?? 'json';
	const format = rawFormat === 'zip' ? 'zip' : 'json';

	const token = createDownloadToken(locals.user!.id, format);
	const expiresAt = tokenExpiresAt(token)!;

	const base = (pubEnv.PUBLIC_APP_URL as string | undefined)?.replace(/\/$/, '') ?? '';
	const downloadUrl = `${base}/api/download/${token}`;

	return ok({ url: downloadUrl, format, expires_at: expiresAt });
};
