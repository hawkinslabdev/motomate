import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import {
	getServiceLogsByVehicle,
	createServiceLog,
	updateServiceLog,
	deleteServiceLog
} from '$lib/db/repositories/service-logs.js';
import {
	getOdometerLogs,
	insertOdometerLog,
	updateOdometer,
	updateOdometerLog,
	deleteOdometerLog,
	recomputeCurrentOdometer,
	getVehicleById
} from '$lib/db/repositories/vehicles.js';
import {
	getTrackersByVehicle,
	recomputeTrackerStatuses,
	updateTrackerAfterService
} from '$lib/db/repositories/maintenance.js';
import { CreateServiceLogSchema } from '$lib/validators/schemas.js';
import { runWorkflowChecks } from '$lib/workflow/engine.js';

export const load: PageServerLoad = async ({ parent, locals }) => {
	const { vehicle } = await parent();

	// Ensure tracker statuses are fresh every time the timeline loads
	await recomputeTrackerStatuses(vehicle.id, vehicle.current_odometer);

	const [logs, odoLogs, trackers] = await Promise.all([
		getServiceLogsByVehicle(vehicle.id, locals.user!.id),
		getOdometerLogs(vehicle.id, locals.user!.id),
		getTrackersByVehicle(vehicle.id, locals.user!.id)
	]);

	return { logs, odoLogs, trackers, vehicle };
};

export const actions: Actions = {
	logService: async ({ request, locals, params }) => {
		const raw = Object.fromEntries(await request.formData());
		const currency = (locals.user as any)?.settings?.currency ?? 'EUR';

		// Handle multiple tracker resets (checkbox array)
		const resetTrackerIds = raw.reset_trackers
			? Array.isArray(raw.reset_trackers)
				? raw.reset_trackers
				: [raw.reset_trackers]
			: [];
		const trackerId =
			raw.tracker_id || (resetTrackerIds.length === 1 ? resetTrackerIds[0] : undefined);

		const input = {
			vehicle_id: params.id,
			tracker_id: trackerId,
			performed_at: raw.performed_at as string,
			odometer_at_service: Number(raw.odometer_at_service),
			cost_cents: raw.cost ? Math.round(Number(raw.cost) * 100) : undefined,
			currency,
			notes: raw.notes || undefined,
			remark: raw.remark ? String(raw.remark).trim() : undefined,
			parts_used: []
		};

		const parsed = CreateServiceLogSchema.safeParse(input);
		if (!parsed.success) {
			return fail(400, { error: parsed.error.issues[0]?.message ?? 'Invalid input' });
		}

		const vehicle = await getVehicleById(params.id, locals.user!.id);
		const maxOdo = vehicle?.current_odometer ?? 0;
		const warning =
			parsed.data.odometer_at_service < maxOdo
				? `Odometer is lower than the highest recorded reading (${maxOdo} km). Saved as a historical record.`
				: undefined;

		await createServiceLog(locals.user!.id, parsed.data);

		// Reset all selected trackers
		for (const tid of resetTrackerIds) {
			await updateTrackerAfterService(
				tid,
				parsed.data.performed_at,
				parsed.data.odometer_at_service
			);
		}

		await recomputeTrackerStatuses(params.id, maxOdo);
		runWorkflowChecks(locals.user!.id).catch(() => {});

		return { logged: true, warning };
	},

	updateOdometer: async ({ request, locals, params }) => {
		const data = await request.formData();
		const raw = Number(data.get('odometer'));
		const remark = data.get('remark') ? String(data.get('remark')).trim() : undefined;
		const recordedAt = String(data.get('recorded_at') ?? '').trim() || undefined;

		if (!Number.isInteger(raw) || raw < 0) {
			return fail(400, { odoError: 'Enter a valid odometer reading' });
		}

		const vehicle = await getVehicleById(params.id, locals.user!.id);
		const maxOdo = vehicle?.current_odometer ?? 0;
		let warning: string | undefined;

		if (raw === maxOdo) {
			warning = `You already have a reading of ${raw} km. Saving anyway for your records.`;
		} else if (raw < maxOdo) {
			warning = `Lower than the highest recorded reading (${maxOdo} km). Saved as a historical record.`;
		} else {
			await updateOdometer(params.id, locals.user!.id, raw);
		}

		await insertOdometerLog(params.id, locals.user!.id, raw, remark, recordedAt);
		await recomputeTrackerStatuses(params.id, Math.max(raw, maxOdo));
		runWorkflowChecks(locals.user!.id).catch(() => {});

		return { odoUpdated: true, warning };
	},

	editServiceLog: async ({ request, locals, params }) => {
		const raw = Object.fromEntries(await request.formData());
		const id = String(raw.id);
		const performedAt = String(raw.performed_at || '');
		const odoAtService = Number(raw.odometer_at_service);
		if (!performedAt.match(/^\d{4}-\d{2}-\d{2}$/)) return fail(400, { editError: 'Invalid date' });
		if (!Number.isInteger(odoAtService) || odoAtService < 0)
			return fail(400, { editError: 'Invalid odometer' });
		const costCents = raw.cost ? Math.round(Number(raw.cost) * 100) : null;
		const notes = String(raw.notes || '').trim() || null;
		const remark = raw.remark ? String(raw.remark).trim() : null;

		const vehicle = await getVehicleById(params.id, locals.user!.id);
		const prevMaxOdo = vehicle?.current_odometer ?? 0;

		updateServiceLog(id, params.id, locals.user!.id, {
			performed_at: performedAt,
			odometer_at_service: odoAtService,
			cost_cents: costCents,
			notes,
			remark
		});
		const trueOdo = await recomputeCurrentOdometer(params.id, locals.user!.id);
		await recomputeTrackerStatuses(params.id, trueOdo);
		runWorkflowChecks(locals.user!.id).catch(() => {});

		const warning =
			odoAtService < prevMaxOdo
				? `Odometer is lower than the highest recorded reading (${prevMaxOdo} km). Saved as a historical record.`
				: undefined;

		return { editedLog: true, warning };
	},

	deleteServiceLog: async ({ request, locals, params }) => {
		const raw = Object.fromEntries(await request.formData());
		await deleteServiceLog(String(raw.id), params.id, locals.user!.id);
		const trueOdo = await recomputeCurrentOdometer(params.id, locals.user!.id);
		await recomputeTrackerStatuses(params.id, trueOdo);
		runWorkflowChecks(locals.user!.id).catch(() => {});
		return { deletedLog: true };
	},

	editOdometerLog: async ({ request, locals, params }) => {
		const raw = Object.fromEntries(await request.formData());
		const id = String(raw.id);
		const odometerStr = String(raw.odometer || '');
		const recordedAt = String(raw.recorded_at || '');
		const remark = raw.remark ? String(raw.remark).trim() : null;

		// Note-only edit (no odometer field)
		if (!odometerStr || odometerStr === 'undefined') {
			if (!recordedAt.match(/^\d{4}-\d{2}-\d{2}$/)) {
				return fail(400, { editError: 'Invalid date' });
			}
			await updateOdometerLog(id, params.id, locals.user!.id, { recorded_at: recordedAt, remark });
			return { editedLog: true };
		}

		// Full odometer edit
		const odometer = Number(odometerStr);
		if (!Number.isInteger(odometer) || odometer < 0) {
			return fail(400, { editError: 'Invalid odometer' });
		}
		if (!recordedAt.match(/^\d{4}-\d{2}-\d{2}$/)) {
			return fail(400, { editError: 'Invalid date' });
		}

		const vehicle = await getVehicleById(params.id, locals.user!.id);
		const prevMaxOdo = vehicle?.current_odometer ?? 0;

		await updateOdometerLog(id, params.id, locals.user!.id, {
			odometer,
			recorded_at: recordedAt,
			remark
		});
		const trueOdo = await recomputeCurrentOdometer(params.id, locals.user!.id);
		await recomputeTrackerStatuses(params.id, trueOdo);
		runWorkflowChecks(locals.user!.id).catch(() => {});

		const warning =
			odometer < prevMaxOdo
				? `Odometer is lower than the highest recorded reading (${prevMaxOdo} km). Saved as a historical record.`
				: undefined;

		return { editedLog: true, warning };
	},

	deleteOdometerLog: async ({ request, locals, params }) => {
		const raw = Object.fromEntries(await request.formData());
		await deleteOdometerLog(String(raw.id), params.id, locals.user!.id);
		const trueOdo = await recomputeCurrentOdometer(params.id, locals.user!.id);
		await recomputeTrackerStatuses(params.id, trueOdo);
		runWorkflowChecks(locals.user!.id).catch(() => {});
		return { deletedLog: true };
	},

	logNote: async ({ request, locals, params }) => {
		const data = await request.formData();
		const recordedAt = String(data.get('recorded_at') || '').trim();
		const remark = String(data.get('remark') || '').trim();

		if (!recordedAt || !recordedAt.match(/^\d{4}-\d{2}-\d{2}$/)) {
			return fail(400, { noteError: 'Invalid date' });
		}
		if (!remark) {
			return fail(400, { noteError: 'Note is required' });
		}

		// Get current odometer to preserve it
		const vehicle = await getVehicleById(params.id, locals.user!.id);
		if (!vehicle) {
			return fail(400, { noteError: 'Vehicle not found' });
		}

		// Create log entry with remark but same odometer (note only)
		await insertOdometerLog(
			params.id,
			locals.user!.id,
			vehicle.current_odometer,
			remark,
			recordedAt,
			'note'
		);

		return { noteLogged: true };
	}
};
