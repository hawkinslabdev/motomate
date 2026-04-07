import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import {
	getTravelsByVehicle,
	getTravelById,
	createTravel,
	updateTravel,
	deleteTravel
} from '$lib/db/repositories/travels.js';
import {
	createDocument,
	deleteDocument,
	getDocumentsByIds
} from '$lib/db/repositories/documents.js';
import { getStorage } from '$lib/storage/index.js';
import { generateId } from '$lib/utils/id.js';

function storageKey(userId: string, filename: string): string {
	const ext =
		filename
			.split('.')
			.pop()
			?.replace(/[^a-zA-Z0-9]/g, '') ?? 'bin';
	const id = generateId();
	return `files/${userId}/${id}.${ext}`;
}

export const load: PageServerLoad = async ({ parent, locals }) => {
	const { vehicle } = await parent();
	const userId = locals.user!.id;

	const travelList = await getTravelsByVehicle(vehicle.id, userId);

	// Resolve all GPX documents so the map has storage keys + presigned URLs
	const allDocIds = [...new Set(travelList.flatMap((t) => t.gpx_document_ids))];
	const gpxDocs = await getDocumentsByIds(allDocIds, userId);

	// Generate presigned URLs for GPX files (valid 1 hour)
	const storage = getStorage();
	const gpxUrls: Record<string, string> = {};
	for (const doc of gpxDocs) {
		gpxUrls[doc.id] = await storage.presignedUrl(doc.storage_key, 3600);
	}

	return { travels: travelList, gpxDocs, gpxUrls };
};

export const actions: Actions = {
	create: async ({ request, locals, params }) => {
		const userId = locals.user!.id;
		const vehicleId = params.id;
		const data = await request.formData();

		const title = String(data.get('title') ?? '').trim();
		const startDate = String(data.get('start_date') ?? '');
		const durationDays = parseInt(String(data.get('duration_days') ?? '1'));
		const remark = String(data.get('remark') ?? '').trim() || null;
		const expensesRaw = data.get('total_expenses');
		const totalExpensesCents =
			expensesRaw && String(expensesRaw).trim() !== ''
				? Math.round(Number(expensesRaw) * 100)
				: null;
		const currency =
			(locals.user as any)?.settings?.currency ?? 'EUR';

		if (!title) return fail(400, { createError: 'Title is required' });
		if (!startDate.match(/^\d{4}-\d{2}-\d{2}$/)) return fail(400, { createError: 'Invalid date' });
		if (!Number.isInteger(durationDays) || durationDays < 1)
			return fail(400, { createError: 'Duration must be at least 1 day' });

		// Upload GPX files
		const gpxDocIds: string[] = [];
		const storage = getStorage();
		const maxSlots = Math.min(durationDays, 14);

		for (let i = 0; i < maxSlots; i++) {
			const file = data.get(`gpx_file_${i}`) as File | null;
			if (!file || file.size === 0) continue;

			if (file.size > 20 * 1024 * 1024)
				return fail(400, { createError: `GPX file for day ${i + 1} exceeds 20 MB` });

			const buffer = Buffer.from(await file.arrayBuffer());
			const key = storageKey(userId, `day-${i + 1}.gpx`);
			await storage.put(key, buffer, 'application/gpx+xml');

			const doc = await createDocument(userId, {
				vehicle_id: vehicleId,
				name: file.name || `Day ${i + 1} route.gpx`,
				doc_type: 'route',
				storage_key: key,
				mime_type: 'application/gpx+xml',
				size_bytes: file.size
			});
			gpxDocIds.push(doc.id);
		}

		await createTravel(userId, {
			vehicle_id: vehicleId,
			start_date: startDate,
			duration_days: durationDays,
			title,
			remark,
			total_expenses_cents: totalExpensesCents,
			currency,
			gpx_document_ids: gpxDocIds
		});

		return { created: true };
	},

	edit: async ({ request, locals, params }) => {
		const userId = locals.user!.id;
		const vehicleId = params.id;
		const data = await request.formData();

		const id = String(data.get('id') ?? '');
		const title = String(data.get('title') ?? '').trim();
		const startDate = String(data.get('start_date') ?? '');
		const durationDays = parseInt(String(data.get('duration_days') ?? '1'));
		const remark = String(data.get('remark') ?? '').trim() || null;
		const expensesRaw = data.get('total_expenses');
		const totalExpensesCents =
			expensesRaw && String(expensesRaw).trim() !== ''
				? Math.round(Number(expensesRaw) * 100)
				: null;

		if (!id) return fail(400, { editError: 'Missing travel ID' });
		if (!title) return fail(400, { editError: 'Title is required' });
		if (!startDate.match(/^\d{4}-\d{2}-\d{2}$/)) return fail(400, { editError: 'Invalid date' });

		const travel = await getTravelById(id, userId);
		if (!travel) return fail(404, { editError: 'Travel not found' });

		// Remove GPX docs that were marked for removal
		const removeIds = data.getAll('remove_gpx_doc_id').map(String);
		const storage = getStorage();

		const updatedDocIds = [...travel.gpx_document_ids];

		for (const docId of removeIds) {
			const docs = await getDocumentsByIds([docId], userId);
			if (docs[0]) {
				await storage.delete(docs[0].storage_key).catch(() => {});
				await deleteDocument(docId, userId);
			}
			const idx = updatedDocIds.indexOf(docId);
			if (idx !== -1) updatedDocIds.splice(idx, 1);
		}

		// Upload new GPX files
		const maxSlots = Math.min(durationDays, 14);
		for (let i = 0; i < maxSlots; i++) {
			const file = data.get(`gpx_file_${i}`) as File | null;
			if (!file || file.size === 0) continue;

			if (file.size > 20 * 1024 * 1024)
				return fail(400, { editError: `GPX file for day ${i + 1} exceeds 20 MB` });

			const buffer = Buffer.from(await file.arrayBuffer());
			const key = storageKey(userId, `day-${i + 1}.gpx`);
			await storage.put(key, buffer, 'application/gpx+xml');

			const doc = await createDocument(userId, {
				vehicle_id: vehicleId,
				name: file.name || `Day ${i + 1} route.gpx`,
				doc_type: 'route',
				storage_key: key,
				mime_type: 'application/gpx+xml',
				size_bytes: file.size
			});
			updatedDocIds.push(doc.id);
		}

		await updateTravel(id, vehicleId, userId, {
			start_date: startDate,
			duration_days: durationDays,
			title,
			remark,
			total_expenses_cents: totalExpensesCents,
			gpx_document_ids: updatedDocIds
		});

		return { edited: true };
	},

	delete: async ({ request, locals, params }) => {
		const userId = locals.user!.id;
		const vehicleId = params.id;
		const data = await request.formData();
		const id = String(data.get('id') ?? '');

		if (!id) return fail(400, { deleteError: 'Missing travel ID' });

		const travel = await getTravelById(id, userId);
		if (!travel) return fail(404, { deleteError: 'Travel not found' });

		// Delete linked GPX documents from storage + DB
		const storage = getStorage();
		if (travel.gpx_document_ids.length > 0) {
			const docs = await getDocumentsByIds(travel.gpx_document_ids, userId);
			for (const doc of docs) {
				await storage.delete(doc.storage_key).catch(() => {});
				await deleteDocument(doc.id, userId);
			}
		}

		await deleteTravel(id, vehicleId, userId);

		return { deleted: true };
	}
};
