import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getPaperlessClient } from '$lib/db/repositories/paperless-integrations.js';
import { importPaperlessDocumentReference } from '$lib/db/repositories/documents.js';
import { replaceDocumentLinks } from '$lib/db/repositories/document-links.js';
import { DOCUMENT_LINK_TARGET_TYPES } from '$lib/db/schema.js';

export const GET: RequestHandler = async ({ locals, params, url }) => {
	if (!locals.user) error(401, 'Unauthorized');
	try {
		const client = await getPaperlessClient(params.id, locals.user.id);
		const page = Number(url.searchParams.get('page') ?? '1');
		const pageSize = Number(url.searchParams.get('page_size') ?? '25');
		return json(
			await client.searchDocuments({
				query: url.searchParams.get('query') ?? undefined,
				page: Number.isInteger(page) && page > 0 ? page : 1,
				pageSize: Number.isInteger(pageSize) ? pageSize : 25
			})
		);
	} catch (cause) {
		error(502, cause instanceof Error ? cause.message : 'Paperless search failed');
	}
};

export const POST: RequestHandler = async ({ locals, params, request }) => {
	if (!locals.user) error(401, 'Unauthorized');
	const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
	if (!body) error(400, 'Invalid JSON');
	const vehicleId = typeof body.vehicle_id === 'string' ? body.vehicle_id : '';
	const remoteId = Number(body.paperless_document_id);
	const importMode = body.import_mode === 'copy' ? 'copy' : 'link';
	if (!vehicleId || !Number.isInteger(remoteId) || remoteId <= 0) {
		error(400, 'vehicle_id and paperless_document_id are required');
	}

	try {
		const document = await importPaperlessDocumentReference(
			locals.user.id,
			vehicleId,
			params.id,
			remoteId,
			importMode
		);
		if (typeof body.target_type === 'string' && typeof body.target_id === 'string') {
			if (!DOCUMENT_LINK_TARGET_TYPES.includes(body.target_type as never)) {
				error(400, 'Invalid target_type');
			}
			await replaceDocumentLinks({
				userId: locals.user.id,
				vehicleId,
				targetType: body.target_type as (typeof DOCUMENT_LINK_TARGET_TYPES)[number],
				targetId: body.target_id,
				documentIds: [document.id],
				relation:
					body.relation === 'purchase' || body.relation === 'sale' ? body.relation : 'attachment'
			});
		}
		return json({ document }, { status: 201 });
	} catch (cause) {
		error(400, cause instanceof Error ? cause.message : 'Unable to import Paperless document');
	}
};
