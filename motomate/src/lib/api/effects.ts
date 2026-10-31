import { recomputeCurrentOdometer } from '#lib/db/repositories/vehicles.js';
import { recomputeTrackerStatuses } from '#lib/db/repositories/maintenance.js';

export async function syncOdometer(vehicleId: string, userId: string): Promise<number> {
	const trueOdo = await recomputeCurrentOdometer(vehicleId, userId);
	await recomputeTrackerStatuses(vehicleId, trueOdo);
	return trueOdo;
}
