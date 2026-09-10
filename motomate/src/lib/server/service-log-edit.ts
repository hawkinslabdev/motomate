import {
	updateServiceLog,
	updateServiceLogAttachments
} from '$lib/db/repositories/service-logs.js';
import { recomputeTrackerStatuses } from '$lib/db/repositories/maintenance.js';
import { getVehicleById, recomputeCurrentOdometer } from '$lib/db/repositories/vehicles.js';
import { runWorkflowChecks } from '$lib/workflow/engine.js';
import { collectAttachmentIds } from './finance-attachments.js';

export type ServiceLogEditResult = { warning?: string } | { error: string; status: number };

// Shared by the timeline and the maintenance history so a service log edits the same way from either page
export async function applyServiceLogEdit(
	formData: FormData,
	userId: string,
	vehicleId: string
): Promise<ServiceLogEditResult> {
	const id = String(formData.get('id') ?? '');
	const performedAt = String(formData.get('performed_at') ?? '');
	const odometerAtService = Number(formData.get('odometer_at_service'));

	if (!id) return { error: 'Missing service log ID', status: 400 };
	if (!performedAt.match(/^\d{4}-\d{2}-\d{2}$/)) return { error: 'Invalid date', status: 400 };
	if (!Number.isInteger(odometerAtService) || odometerAtService < 0) {
		return { error: 'Invalid odometer', status: 400 };
	}

	const vehicle = await getVehicleById(vehicleId, userId);
	if (!vehicle) return { error: 'Not found', status: 404 };

	const rawCost = formData.get('cost');
	const costCents = rawCost ? Math.round(Number(rawCost) * 100) : null;
	const notes = String(formData.get('notes') ?? '').trim() || null;
	const remark = String(formData.get('remark') ?? '').trim() || null;
	const resetTrackerIds = formData.getAll('reset_trackers').map(String).filter(Boolean);

	const attachments = await collectAttachmentIds(formData, userId, vehicleId);
	if ('error' in attachments) return attachments;

	const previousMaxOdometer = vehicle.current_odometer ?? 0;

	await updateServiceLog(id, vehicleId, userId, {
		performed_at: performedAt,
		odometer_at_service: odometerAtService,
		cost_cents: costCents,
		notes,
		remark,
		serviced_tracker_ids: resetTrackerIds
	});

	// replaces all attachments with current selection on submission
	await updateServiceLogAttachments(id, vehicleId, userId, attachments.ids);

	const trueOdometer = await recomputeCurrentOdometer(vehicleId, userId);
	await recomputeTrackerStatuses(vehicleId, trueOdometer);
	runWorkflowChecks(userId).catch(() => {});

	return {
		warning:
			odometerAtService < previousMaxOdometer
				? `Odometer is lower than the highest recorded reading (${previousMaxOdometer} ${vehicle.odometer_unit}). Saved as a historical record.`
				: undefined
	};
}
