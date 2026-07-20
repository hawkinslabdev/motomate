import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDocumentById } from '$lib/db/repositories/documents.js';
import { getDocumentContent } from '$lib/server/document-content.js';
import { documentContentDisposition } from '$lib/documents/content.js';

export const GET: RequestHandler = async ({ locals, params, url }) => {
	if (!locals.user) error(401, 'Unauthorized');
	const document = await getDocumentById(params.id, locals.user.id);
	if (!document) error(404, 'Document not found');

	try {
		const { data, contentType } = await getDocumentContent(document, locals.user.id);
		const body = data.buffer.slice(
			data.byteOffset,
			data.byteOffset + data.byteLength
		) as ArrayBuffer;
		const download = url.searchParams.get('download') === '1';
		return new Response(body, {
			headers: {
				'Content-Type': contentType,
				'Content-Length': String(data.length),
				'Content-Disposition': documentContentDisposition(document.name, download),
				'Cache-Control': 'private, no-store',
				'X-Content-Type-Options': 'nosniff'
			}
		});
	} catch (cause) {
		console.error('Document content retrieval failed:', cause);
		error(502, 'Document content is unavailable');
	}
};
