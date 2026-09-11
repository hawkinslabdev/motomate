import type { RequestHandler } from '@sveltejs/kit';
import {
	getDocumentsByVehicle,
	getDocumentsByVehicleTotal
} from '$lib/db/repositories/documents.js';
import { list } from '$lib/api/response.js';
import { requireAuth, guardVehicle, parsePage } from '$lib/api/guards.js';

export const GET: RequestHandler = async ({ locals, params, url }) => {
	const authErr = requireAuth(locals);
	if (authErr) return authErr;

	const vehicle = await guardVehicle(params.id!, locals.user!.id);
	if (vehicle instanceof Response) return vehicle;

	const { limit, offset } = parsePage(url);
	const docType = url.searchParams.get('doc_type') ?? undefined;
	const [docs, total] = await Promise.all([
		getDocumentsByVehicle(params.id!, locals.user!.id, { limit, offset, docType }),
		getDocumentsByVehicleTotal(params.id!, locals.user!.id, { docType })
	]);

	return list(
		docs.map((d) => ({
			id: d.id,
			name: d.name,
			title: d.title,
			doc_type: d.doc_type,
			mime_type: d.mime_type,
			size_bytes: d.size_bytes,
			expires_at: d.expires_at,
			created_at: d.created_at,
			url: `/api/files?key=${encodeURIComponent(d.storage_key)}`
		})),
		total
	);
};
