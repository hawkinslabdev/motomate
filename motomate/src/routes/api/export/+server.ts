import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';
import { generateJsonExport, generateZipExport } from '#lib/server/export.js';

export const GET: RequestHandler = async ({ locals, url }) => {
	if (!locals.user) error(401, 'Unauthorized');

	const format = url.searchParams.get('format') === 'zip' ? 'zip' : 'json';
	const { password_hash: _pw, ...safeProfile } = locals.user as typeof locals.user & {
		password_hash?: string;
	};

	if (format === 'zip') {
		const { buffer, filename } = await generateZipExport(locals.user.id, safeProfile);
		return new Response(buffer.buffer as ArrayBuffer, {
			headers: {
				'Content-Type': 'application/zip',
				'Content-Disposition': `attachment; filename="${filename}"`,
				'Content-Length': buffer.length.toString(),
				'Cache-Control': 'no-store'
			}
		});
	}

	const { body, filename } = await generateJsonExport(
		locals.user.id,
		locals.user.email,
		safeProfile
	);
	return new Response(body, {
		headers: {
			'Content-Type': 'application/json',
			'Content-Disposition': `attachment; filename="${filename}"`,
			'Cache-Control': 'no-store'
		}
	});
};
