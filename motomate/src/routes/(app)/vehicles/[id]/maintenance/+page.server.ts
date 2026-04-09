import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import {
	getTrackersByVehicle,
	createTaskTemplate,
	createTracker,
	recomputeTrackerStatuses,
	updateTrackerState,
	deleteTracker,
	applyDefaultTrackersFromHistory
} from '$lib/db/repositories/maintenance.js';
import { getVehicleById, recomputeCurrentOdometer } from '$lib/db/repositories/vehicles.js';
import {
	createServiceLog,
	getServiceLogsByVehicle,
	getServiceLogsByTracker,
	updateServiceLog
} from '$lib/db/repositories/service-logs.js';
import { getOdometerLogs } from '$lib/db/repositories/vehicles.js';
import { CreateServiceLogSchema } from '$lib/validators/schemas.js';
import { runWorkflowChecks } from '$lib/workflow/engine.js';

export const load: PageServerLoad = async ({ parent, locals }) => {
	const { vehicle } = await parent();
	await recomputeTrackerStatuses(vehicle.id, vehicle.current_odometer);
	const trackers = await getTrackersByVehicle(vehicle.id, locals.user!.id);
	const odometerLogs = await getOdometerLogs(vehicle.id, locals.user!.id);
	const allServiceLogs = await getServiceLogsByVehicle(vehicle.id, locals.user!.id);
	return { trackers, odometerLogs, allServiceLogs };
};

export const actions: Actions = {
	// Log a service entry for a specific tracker
	log: async ({ request, locals, params }) => {
		const raw = Object.fromEntries(await request.formData());
		const currency = (locals.user as any)?.settings?.currency ?? 'EUR';
		const input = {
			vehicle_id: params.id,
			tracker_id: raw.tracker_id || undefined,
			performed_at: raw.performed_at as string,
			odometer_at_service: Number(raw.odometer_at_service),
			cost_cents: raw.cost ? Math.round(Number(raw.cost) * 100) : undefined,
			currency,
			notes: raw.notes || undefined,
			parts_used: raw.parts_used ? JSON.parse(raw.parts_used as string) : []
		};

		const parsed = CreateServiceLogSchema.safeParse(input);
		if (!parsed.success) {
			return fail(400, { error: parsed.error.issues[0]?.message ?? 'Invalid input' });
		}

		await createServiceLog(locals.user!.id, parsed.data);
		await recomputeTrackerStatuses(params.id, parsed.data.odometer_at_service);
		runWorkflowChecks(locals.user!.id).catch(() => {});

		return { logged: true };
	},

	// Add a custom maintenance task
	addTask: async ({ request, locals, params }) => {
		try {
			const raw = Object.fromEntries(await request.formData());
			const name = String(raw.name || '').trim();

			if (!name) {
				return fail(400, { taskError: 'Task name is required' });
			}

			const template = await createTaskTemplate(locals.user!.id, {
				vehicle_id: params.id,
				name,
				category: 'custom',
				description: raw.description ? String(raw.description).trim() : undefined,
				interval_km: raw.interval_km ? Number(raw.interval_km) : undefined,
				interval_months: raw.interval_months ? Number(raw.interval_months) : undefined
			});

			const vehicle = await getVehicleById(params.id, locals.user!.id);
			await createTracker(params.id, template.id, vehicle?.current_odometer ?? 0);

			return { added: true };
		} catch (err) {
			console.error('[addTask]', err);
			return fail(500, { taskError: 'Failed to create task' });
		}
	},

	updateTracker: async ({ request, locals, params }) => {
		const raw = Object.fromEntries(await request.formData());
		const id = String(raw.id);

		const intervalKm = raw.interval_km !== '' ? Number(raw.interval_km) : null;
		const intervalMonths = raw.interval_months !== '' ? Number(raw.interval_months) : null;
		const lastDoneAt = String(raw.last_done_at || '').trim() || null;
		const lastDoneOdo =
			String(raw.last_done_odometer || '').trim() !== '' ? Number(raw.last_done_odometer) : null;

		// Explicit overrides — undefined means "auto-compute"
		const nextDueOdoRaw = String(raw.next_due_odometer || '').trim();
		const nextDueAtRaw = String(raw.next_due_at || '').trim();
		const nextDueOdometer = nextDueOdoRaw !== '' ? Number(nextDueOdoRaw) : undefined;
		const nextDueAt = nextDueAtRaw !== '' ? nextDueAtRaw : undefined;

		if (lastDoneAt && !lastDoneAt.match(/^\d{4}-\d{2}-\d{2}$/))
			return fail(400, { trackerError: 'Invalid last done date' });
		if (nextDueAt && !nextDueAt.match(/^\d{4}-\d{2}-\d{2}$/))
			return fail(400, { trackerError: 'Invalid next due date' });

		await updateTrackerState(id, params.id, {
			interval_km: intervalKm,
			interval_months: intervalMonths,
			last_done_at: lastDoneAt,
			last_done_odometer: lastDoneOdo,
			next_due_odometer: nextDueOdometer,
			next_due_at: nextDueAt
		});

		const vehicle = await getVehicleById(params.id, locals.user!.id);
		if (vehicle) await recomputeTrackerStatuses(params.id, vehicle.current_odometer);

		return { trackerUpdated: true };
	},

	deleteTracker: async ({ request, params }) => {
		const raw = Object.fromEntries(await request.formData());
		await deleteTracker(String(raw.id), params.id);
		return { trackerDeleted: true };
	},

	editServiceLog: async ({ request, locals, params }) => {
		const raw = Object.fromEntries(await request.formData());
		const id = String(raw.id);

		await updateServiceLog(id, params.id, locals.user!.id, {
			performed_at: raw.performed_at ? String(raw.performed_at) : undefined,
			odometer_at_service: raw.odometer_at_service ? Number(raw.odometer_at_service) : undefined,
			cost_cents: raw.cost ? Math.round(Number(raw.cost) * 100) : undefined,
			notes: raw.notes ? String(raw.notes) : undefined,
			remark: raw.remark ? String(raw.remark) : undefined
		});

		// Handle tracker resets
		const resetTrackerIds = raw.reset_trackers
			? Array.isArray(raw.reset_trackers)
				? raw.reset_trackers
				: [raw.reset_trackers]
			: [];
		if (resetTrackerIds.length > 0) {
			const vehicle = await getVehicleById(params.id, locals.user!.id);
			const odometer = raw.odometer_at_service
				? Number(raw.odometer_at_service)
				: (vehicle?.current_odometer ?? 0);
			const performedAt = raw.performed_at
				? String(raw.performed_at)
				: new Date().toISOString().slice(0, 10);
			for (const trackerId of resetTrackerIds) {
				await updateTrackerState(trackerId, params.id, {
					last_done_at: performedAt,
					last_done_odometer: odometer
				});
			}
			await recomputeTrackerStatuses(params.id, odometer);
		}

		const trueOdo = await recomputeCurrentOdometer(params.id, locals.user!.id);
		await recomputeTrackerStatuses(params.id, trueOdo);

		return { logUpdated: true };
	},

	// Apply default trackers based on service history
	applyDefaults: async ({ locals, params }) => {
		try {
			const logs = await getServiceLogsByVehicle(params.id, locals.user!.id);
			const vehicle = await getVehicleById(params.id, locals.user!.id);
			const userLocale = (locals.user as any)?.settings?.locale ?? 'en';
			await applyDefaultTrackersFromHistory(params.id, locals.user!.id, logs, userLocale);
			await recomputeTrackerStatuses(params.id, vehicle?.current_odometer ?? 0);
			return { defaultsApplied: true };
		} catch (err) {
			console.error('[applyDefaults]', err);
			return fail(500, { defaultsError: 'Failed to apply default trackers' });
		}
	}
};
