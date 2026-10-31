import { error } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { getVehicleById } from '#lib/db/repositories/vehicles.js';
import { getTrackersByVehicle } from '#lib/db/repositories/maintenance.js';
import { getDocumentsByVehicle } from '#lib/db/repositories/documents.js';

export const load: LayoutServerLoad = async ({ params, locals }) => {
	const vehicle = await getVehicleById(params.id, locals.user!.id);
	if (!vehicle) error(404, 'Vehicle not found');

	const [trackers, docList] = await Promise.all([
		getTrackersByVehicle(params.id, locals.user!.id),
		getDocumentsByVehicle(params.id, locals.user!.id, { sortBy: 'name' })
	]);

	const attentionCount = trackers.filter(
		(t) => t.status === 'due' || t.status === 'overdue'
	).length;

	const pinnedDocId = vehicle.meta?.pinned_doc_id;
	const pinnedDoc = pinnedDocId ? (docList.find((d) => d.id === pinnedDocId) ?? null) : null;

	return { vehicle, attentionCount, docList, pinnedDoc };
};
