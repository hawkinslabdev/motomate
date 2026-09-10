import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import {
	getDocumentsByVehicle,
	getDocumentsByVehicleTotal,
	createDocument,
	deleteDocument,
	renameDocument,
	getDocumentsByIds
} from '$lib/db/repositories/documents.js';
import { getServiceLogsByVehicle } from '$lib/db/repositories/service-logs.js';
import { getTravelsByVehicle } from '$lib/db/repositories/travels.js';
import { getStorage } from '$lib/storage/index.js';
import { onDocumentCreated, onDocumentRenamed, mirrorDelete } from '$lib/server/integrations.js';
import { attachmentStorageKey } from '$lib/utils/storage.js';

const MAX_SIZE = 10 * 1024 * 1024; // 10 MB
const PER_PAGE = 10;

export const load: PageServerLoad = async ({ parent, locals, url }) => {
	const { vehicle } = await parent();
	const highlight = url.searchParams.get('highlight') ?? null;
	const page = Math.max(1, Number(url.searchParams.get('page') ?? '1'));
	const search = url.searchParams.get('search') ?? '';
	const docType = url.searchParams.get('type') ?? 'all';
	const prefSort = locals.user!.settings?.page_prefs?.documents?.sortBy ?? 'newest';
	const sortBy = (url.searchParams.get('sort') ?? prefSort) as 'newest' | 'oldest' | 'name';
	const offset = highlight ? undefined : (page - 1) * PER_PAGE;
	const limit = highlight ? undefined : PER_PAGE;
	const filterOpts = { search: search || undefined, docType, sortBy };

	const [docs, total, serviceLogs, travelEntries] = await Promise.all([
		getDocumentsByVehicle(vehicle.id, locals.user!.id, { limit, offset, ...filterOpts }),
		getDocumentsByVehicleTotal(vehicle.id, locals.user!.id, filterOpts),
		getServiceLogsByVehicle(vehicle.id, locals.user!.id),
		getTravelsByVehicle(vehicle.id, locals.user!.id)
	]);

	// Build reverse map: document ID > service log { id, performed_at }
	const serviceLogMap: Record<string, { id: string; performed_at: string }> = {};
	for (const log of serviceLogs) {
		const attachments = (log.attachments as string[]) ?? [];
		for (const docId of attachments) {
			serviceLogMap[docId] = { id: log.id, performed_at: log.performed_at };
		}
	}

	// Build reverse map: document ID > travel { id, title, start_date }
	const travelMap: Record<string, { id: string; title: string; start_date: string }> = {};
	for (const travel of travelEntries) {
		const gpxIds = (travel.gpx_document_ids as string[]) ?? [];
		for (const docId of gpxIds) {
			travelMap[docId] = { id: travel.id, title: travel.title, start_date: travel.start_date };
		}
	}

	return {
		docs,
		total,
		page,
		perPage: highlight ? total : PER_PAGE,
		serviceLogMap,
		travelMap,
		page_prefs: locals.user!.settings?.page_prefs?.documents ?? null
	};
};

export const actions: Actions = {
	upload: async ({ request, locals, params }) => {
		const user = locals.user!;
		const vehicleId = params.id;
		const formData = await request.formData();

		const file = formData.get('file') as File | null;
		if (!file || file.size === 0) return fail(400, { error: 'No file selected' });
		if (file.size > MAX_SIZE) return fail(400, { error: 'File too large (max 10 MB)' });

		const titleRaw = String(formData.get('name') ?? '').trim();
		const title = titleRaw || null; // user-facing description
		const doc_type = String(formData.get('doc_type') || 'other');
		const expires_at = String(formData.get('expires_at') || '').trim() || undefined;

		const key = attachmentStorageKey(user.id, vehicleId, file.name);
		const buffer = Buffer.from(await file.arrayBuffer());

		try {
			const storage = getStorage();
			await storage.put(key, buffer, file.type || 'application/octet-stream');
		} catch (e) {
			console.error('Storage upload failed:', e);
			return fail(500, { error: 'Upload failed, storage error' });
		}

		const doc = await createDocument(user.id, {
			vehicle_id: vehicleId,
			name: file.name, // original filename preserved
			title,
			doc_type,
			storage_key: key,
			mime_type: file.type || 'application/octet-stream',
			size_bytes: file.size,
			expires_at
		});
		onDocumentCreated(user.id, doc);

		return { uploaded: true };
	},

	delete: async ({ request, locals }) => {
		const data = await request.formData();
		const id = String(data.get('id') ?? '');
		if (!id) return fail(400, { error: 'Missing id' });

		// Key comes from the owned record, never the form: a submitted storage_key would delete any file in uploads
		const [doc] = await getDocumentsByIds([id], locals.user!.id);
		if (!doc) return fail(404, { error: 'Document not found' });

		await deleteDocument(id, locals.user!.id);
		try {
			await getStorage().delete(doc.storage_key);
		} catch {
			/* ignore storage errors */
		}
		mirrorDelete(locals.user!.id, doc.storage_key);
		return { deleted: true };
	},

	rename: async ({ request, locals }) => {
		const data = await request.formData();
		const id = String(data.get('id') ?? '');
		const name = String(data.get('name') ?? '').trim();
		if (!id || !name) return fail(400, { error: 'Missing id or name' });
		const doc = await renameDocument(id, locals.user!.id, name);
		if (!doc) return fail(404, { error: 'Document not found' });
		onDocumentRenamed(locals.user!.id, doc);
		return { renamed: true };
	}
};
