import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import {
	createTaskTemplate,
	createTracker,
	recomputeTrackerStatuses,
	updateTrackerState,
	deleteTracker,
	applyDefaultTrackersFromHistory,
	getTrackersByVehicle
} from '$lib/db/repositories/maintenance.js';
import { getVehicleById, recomputeCurrentOdometer } from '$lib/db/repositories/vehicles.js';
import {
	createServiceLog,
	getServiceLogsByVehicle,
	updateServiceLog
} from '$lib/db/repositories/service-logs.js';
import { getOdometerLogs } from '$lib/db/repositories/vehicles.js';
import { CreateServiceLogSchema } from '$lib/validators/schemas.js';
import { runWorkflowChecks } from '$lib/workflow/engine.js';
import { addMonths, parseISO, formatISO } from 'date-fns';

export const load: PageServerLoad = async ({ parent, locals }) => {
	const { vehicle } = await parent();
	const currentOdometer = await recomputeCurrentOdometer(vehicle.id, locals.user!.id);
	const trackers = await recomputeTrackerStatuses(vehicle.id, currentOdometer);
	const [odometerLogs, allServiceLogs] = await Promise.all([
		getOdometerLogs(vehicle.id, locals.user!.id),
		getServiceLogsByVehicle(vehicle.id, locals.user!.id)
	]);
	return {
		trackers,
		odometerLogs,
		allServiceLogs,
		page_prefs: locals.user!.settings?.page_prefs?.maintenance ?? null
	};
};

export const actions: Actions = {
	// Log a service entry for a specific tracker
	log: async ({ request, locals, params }) => {
		const formData = await request.formData();
		const raw = Object.fromEntries(formData);
		const currency = (locals.user as any)?.settings?.currency ?? 'EUR';
		const additionalTrackerIds = formData
			.getAll('additional_tracker_ids')
			.map(String)
			.filter(Boolean);
		const input = {
			vehicle_id: params.id,
			tracker_id: raw.tracker_id || undefined,
			performed_at: raw.performed_at as string,
			odometer_at_service: Number(raw.odometer_at_service),
			cost_cents: raw.cost ? Math.round(Number(raw.cost) * 100) : undefined,
			currency,
			notes: raw.notes || undefined,
			parts_used: raw.parts_used ? JSON.parse(raw.parts_used as string) : [],
			serviced_tracker_ids: additionalTrackerIds
		};

		const parsed = CreateServiceLogSchema.safeParse(input);
		if (!parsed.success) {
			return fail(400, { error: parsed.error.issues[0]?.message ?? 'Invalid input' });
		}

		await createServiceLog(locals.user!.id, parsed.data);
		const trueOdo = await recomputeCurrentOdometer(params.id, locals.user!.id);
		await recomputeTrackerStatuses(params.id, trueOdo);
		runWorkflowChecks(locals.user!.id).catch(() => {});

		return { logged: true };
	},

	skipTracker: async ({ request, locals, params }) => {
		const raw = Object.fromEntries(await request.formData());
		const trackerId = String(raw.tracker_id);

		const trackers = await getTrackersByVehicle(params.id, locals.user!.id);
		const tracker = trackers.find((t) => t.id === trackerId);
		if (!tracker) return fail(404, { error: 'Tracker not found' });

		const tmpl = tracker.template;
		const nextDueOdometer =
			tracker.next_due_odometer !== null && tmpl.interval_km
				? tracker.next_due_odometer + tmpl.interval_km
				: tracker.next_due_odometer;
		const nextDueAt =
			tracker.next_due_at && tmpl.interval_months
				? formatISO(addMonths(parseISO(tracker.next_due_at), tmpl.interval_months), {
						representation: 'date'
					})
				: tracker.next_due_at;

		await updateTrackerState(trackerId, params.id, {
			next_due_odometer: nextDueOdometer,
			next_due_at: nextDueAt
		});

		const vehicle = await getVehicleById(params.id, locals.user!.id);
		await recomputeTrackerStatuses(params.id, vehicle?.current_odometer ?? 0);
		runWorkflowChecks(locals.user!.id).catch(() => {});

		return { skipped: true };
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

		const name = String(raw.name || '').trim();
		const description = String(raw.description || '').trim() || null;

		if (!name) return fail(400, { trackerError: 'Name is required' });

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
			name,
			description,
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
		const formData = await request.formData();
		const raw = Object.fromEntries(formData);
		const id = String(raw.id);

		// Must use getAll() — Object.fromEntries drops duplicate keys for multi-checkboxes
		const resetTrackerIds = formData.getAll('reset_trackers').map(String);

		await updateServiceLog(id, params.id, locals.user!.id, {
			performed_at: raw.performed_at ? String(raw.performed_at) : undefined,
			odometer_at_service: raw.odometer_at_service ? Number(raw.odometer_at_service) : undefined,
			cost_cents: raw.cost ? Math.round(Number(raw.cost) * 100) : undefined,
			notes: raw.notes ? String(raw.notes) : undefined,
			remark: raw.remark ? String(raw.remark) : undefined,
			serviced_tracker_ids: resetTrackerIds.length > 0 ? resetTrackerIds : undefined
		});
		let vehicle: Awaited<ReturnType<typeof getVehicleById>>;
		if (resetTrackerIds.length > 0) {
			vehicle = await getVehicleById(params.id, locals.user!.id);
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
			await applyDefaultTrackersFromHistory(
				params.id,
				locals.user!.id,
				logs,
				userLocale,
				vehicle?.type ?? 'motorcycle'
			);
			await recomputeTrackerStatuses(params.id, vehicle?.current_odometer ?? 0);
			return { defaultsApplied: true };
		} catch (err) {
			console.error('[applyDefaults]', err);
			return fail(500, { defaultsError: 'Failed to apply default trackers' });
		}
	}
};
