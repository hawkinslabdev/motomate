import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import {
	getTravelsByVehicle,
	getTravelById,
	createTravel,
	updateTravel,
	deleteTravel,
	isDocumentReferencedByOtherTravels
} from '$lib/db/repositories/travels.js';
import {
	createDocument,
	deleteDocument,
	getDocumentsByIds,
	getRouteDocumentsByVehicle
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
	const allDocIds = [
		...new Set(travelList.flatMap((t) => t.gpx_document_ids).filter(Boolean))
	] as string[];
	const gpxDocs = await getDocumentsByIds(allDocIds, userId);

	// Generate presigned URLs for GPX files (valid 1 hour)
	const storage = getStorage();
	const gpxUrls: Record<string, string> = {};
	for (const doc of gpxDocs) {
		gpxUrls[doc.id] = await storage.presignedUrl(doc.storage_key, 3600);
	}

	// All route documents for this vehicle (for the "pick from library" selector)
	const routeDocs = await getRouteDocumentsByVehicle(vehicle.id, userId);
	const routeDocUrls: Record<string, string> = {};
	for (const doc of routeDocs) {
		// Reuse already-generated URL if available, otherwise generate
		routeDocUrls[doc.id] = gpxUrls[doc.id] ?? (await storage.presignedUrl(doc.storage_key, 3600));
	}

	return {
		travels: travelList,
		gpxDocs,
		gpxUrls,
		routeDocs,
		routeDocUrls,
		page_prefs: locals.user!.settings?.page_prefs?.travels ?? null
	};
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
		const currency = (locals.user as any)?.settings?.currency ?? 'EUR';

		const excludedGpxRaw = data.get('excluded_gpx_days');
		const excludedGpxDays: number[] = excludedGpxRaw
			? JSON.parse(String(excludedGpxRaw)).filter((n: unknown) => typeof n === 'number')
			: [];

		if (!title) return fail(400, { createError: 'Title is required' });
		if (!startDate.match(/^\d{4}-\d{2}-\d{2}$/)) return fail(400, { createError: 'Invalid date' });
		if (!Number.isInteger(durationDays) || durationDays < 1)
			return fail(400, { createError: 'Duration must be at least 1 day' });

		const maxSlots = Math.min(durationDays, 14);

		// Upload GPX files - use null placeholders to preserve day slot positions
		const gpxDocIds: (string | null)[] = Array(maxSlots).fill(null);
		const storage = getStorage();

		for (let i = 0; i < maxSlots; i++) {
			// Check for an existing library doc being borrowed first
			const existingDocId = String(data.get(`gpx_existing_doc_${i}`) ?? '').trim();
			if (existingDocId) {
				gpxDocIds[i] = existingDocId;
				continue;
			}

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
			gpxDocIds[i] = doc.id;
		}

		await createTravel(userId, {
			vehicle_id: vehicleId,
			start_date: startDate,
			duration_days: durationDays,
			title,
			remark,
			total_expenses_cents: totalExpensesCents,
			currency,
			gpx_document_ids: gpxDocIds,
			excluded_gpx_days: excludedGpxDays
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

		const excludedGpxRaw = data.get('excluded_gpx_days');
		const excludedGpxDays: number[] = excludedGpxRaw
			? JSON.parse(String(excludedGpxRaw)).filter((n: unknown) => typeof n === 'number')
			: [];

		if (!id) return fail(400, { editError: 'Missing travel ID' });
		if (!title) return fail(400, { editError: 'Title is required' });
		if (!startDate.match(/^\d{4}-\d{2}-\d{2}$/)) return fail(400, { editError: 'Invalid date' });

		const travel = await getTravelById(id, userId);
		if (!travel) return fail(404, { editError: 'Travel not found' });

		const storage = getStorage();

		const updatedDocIds = [...travel.gpx_document_ids] as (string | null)[];

		// Expand array if new duration is longer
		const maxSlots = Math.min(durationDays, 14);
		while (updatedDocIds.length < maxSlots) {
			updatedDocIds.push(null);
		}

		// Process slot-indexed removals: remove_gpx_slot_{i} = docId
		for (let i = 0; i < maxSlots; i++) {
			const docId = String(data.get(`remove_gpx_slot_${i}`) ?? '').trim();
			if (!docId) continue;

			// Null this specific slot first
			updatedDocIds[i] = null;

			// Only delete from storage/DB if no other slot in this travel still references
			// the same docId, and no other travel references it either
			const stillInThisTravel = updatedDocIds.some((id) => id === docId);
			if (!stillInThisTravel) {
				const isShared = await isDocumentReferencedByOtherTravels(docId, id, vehicleId);
				if (!isShared) {
					const docs = await getDocumentsByIds([docId], userId);
					if (docs[0]) {
						await storage.delete(docs[0].storage_key).catch(() => {});
						await deleteDocument(docId, userId);
					}
				}
			}
		}

		// Upload new GPX files or assign existing library docs to slots
		for (let i = 0; i < maxSlots; i++) {
			// Check for an existing library doc being borrowed first
			const existingDocId = String(data.get(`gpx_existing_doc_${i}`) ?? '').trim();
			if (existingDocId) {
				updatedDocIds[i] = existingDocId;
				continue;
			}

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
			updatedDocIds[i] = doc.id;
		}

		await updateTravel(id, vehicleId, userId, {
			start_date: startDate,
			duration_days: durationDays,
			title,
			remark,
			total_expenses_cents: totalExpensesCents,
			gpx_document_ids: updatedDocIds,
			excluded_gpx_days: excludedGpxDays
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

		// Delete linked GPX documents from storage + DB (skip docs borrowed by other travels)
		const storage = getStorage();
		const docIds = travel.gpx_document_ids.filter(Boolean) as string[];
		if (docIds.length > 0) {
			const docs = await getDocumentsByIds(docIds, userId);
			for (const doc of docs) {
				const isShared = await isDocumentReferencedByOtherTravels(doc.id, id, vehicleId);
				if (!isShared) {
					await storage.delete(doc.storage_key).catch(() => {});
					await deleteDocument(doc.id, userId);
				}
			}
		}

		await deleteTravel(id, vehicleId, userId);

		return { deleted: true };
	},

	toggleExcludedDay: async ({ request, locals, params }) => {
		const userId = locals.user!.id;
		const data = await request.formData();

		const id = String(data.get('id') ?? '');
		const dayIndex = parseInt(String(data.get('day_index') ?? '-1'));

		if (!id || dayIndex < 0) return fail(400, { toggleError: 'Invalid request' });

		const travel = await getTravelById(id, userId);
		if (!travel) return fail(404, { toggleError: 'Travel not found' });

		const excluded = (travel.excluded_gpx_days as number[]) ?? [];
		const newExcluded = excluded.includes(dayIndex)
			? excluded.filter((d) => d !== dayIndex)
			: [...excluded, dayIndex];

		await updateTravel(id, params.id, userId, { excluded_gpx_days: newExcluded });

		return { toggled: true };
	}
};
