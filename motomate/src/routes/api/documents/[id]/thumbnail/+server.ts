import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDocumentById } from '$lib/db/repositories/documents.js';
import { getDocumentThumbnail } from '$lib/server/document-thumbnail.js';
import { UnsupportedThumbnailError } from '$lib/documents/thumbnail.js';

export const GET: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) error(401, 'Unauthorized');
	const document = await getDocumentById(params.id, locals.user.id);
	if (!document) error(404, 'Document not found');

	try {
		const thumbnail = await getDocumentThumbnail(document, locals.user.id);
		const body = thumbnail.data.buffer.slice(
			thumbnail.data.byteOffset,
			thumbnail.data.byteOffset + thumbnail.data.byteLength
		) as ArrayBuffer;
		return new Response(body, {
			headers: {
				'Content-Type': thumbnail.contentType,
				'Content-Length': String(thumbnail.data.length),
				'Cache-Control': 'private, max-age=300, stale-while-revalidate=300',
				'X-Content-Type-Options': 'nosniff'
			}
		});
	} catch (cause) {
		if (cause instanceof UnsupportedThumbnailError) error(415, cause.message);
		console.error('Document thumbnail retrieval failed:', cause);
		error(502, 'Document thumbnail is unavailable');
	}
};
