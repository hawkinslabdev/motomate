import type { RequestHandler } from '@sveltejs/kit';
import { verifyDownloadToken } from '$lib/server/download-token.js';
import { generateJsonExport, generateZipExport } from '$lib/server/export.js';
import { getUserById } from '$lib/db/repositories/users.js';
import { rateLimit } from '$lib/auth/rate-limit.js';

export const GET: RequestHandler = async ({ params }) => {
	const payload = verifyDownloadToken(params.token!);
	if (!payload) {
		return new Response(
			JSON.stringify({ error: 'Link expired or invalid', code: 'INVALID_TOKEN' }),
			{
				status: 401,
				headers: { 'Content-Type': 'application/json' }
			}
		);
	}

	const user = await getUserById(payload.uid);
	if (!user) {
		return new Response(JSON.stringify({ error: 'Unauthorized', code: 'UNAUTHORIZED' }), {
			status: 401,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	if (!rateLimit(`/api/export:${user.id}`, 5, 15 * 60_000)) {
		return new Response(JSON.stringify({ error: 'Too many attempts', code: 'RATE_LIMITED' }), {
			status: 429,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	const { password_hash: _pw, ...safeProfile } = user as typeof user & { password_hash?: string };

	if (payload.fmt === 'zip') {
		const { buffer, filename } = await generateZipExport(user.id, safeProfile);
		return new Response(buffer.buffer as ArrayBuffer, {
			headers: {
				'Content-Type': 'application/zip',
				'Content-Disposition': `attachment; filename="${filename}"`,
				'Content-Length': buffer.length.toString(),
				'Cache-Control': 'no-store'
			}
		});
	}

	const { body, filename } = await generateJsonExport(user.id, user.email, safeProfile);
	return new Response(body, {
		headers: {
			'Content-Type': 'application/json',
			'Content-Disposition': `attachment; filename="${filename}"`,
			'Cache-Control': 'no-store'
		}
	});
};
