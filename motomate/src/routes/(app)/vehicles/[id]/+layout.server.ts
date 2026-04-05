import { error } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { getVehicleById } from '$lib/db/repositories/vehicles.js';
import { getTrackersByVehicle } from '$lib/db/repositories/maintenance.js';

export const load: LayoutServerLoad = async ({ params, locals }) => {
	const vehicle = await getVehicleById(params.id, locals.user!.id);
	if (!vehicle) error(404, 'Vehicle not found');
	const trackers = await getTrackersByVehicle(params.id, locals.user!.id);
	const attentionCount = trackers.filter(
		(t) => t.status === 'due' || t.status === 'overdue'
	).length;
	return { vehicle, attentionCount };
};
