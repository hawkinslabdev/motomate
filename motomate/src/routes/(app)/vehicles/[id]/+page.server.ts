import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import {
	getServiceLogsByVehicle,
	createServiceLog,
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
	recomputeTrackerStatuses
} from '$lib/db/repositories/maintenance.js';
import { isReminderTracker } from '$lib/utils/reminder-only.js';
import { getDocumentsByVehicle, createDocument } from '$lib/db/repositories/documents.js';
import { getStorage } from '$lib/storage/index.js';
import { onDocumentCreated } from '$lib/server/integrations.js';
import { attachmentStorageKey } from '$lib/utils/storage.js';
import { CreateServiceLogSchema } from '$lib/validators/schemas.js';
import { runWorkflowChecks } from '$lib/workflow/engine.js';
import { applyServiceLogEdit } from '$lib/server/service-log-edit.js';
import { getTravelsForTimeline } from '$lib/db/repositories/travels.js';
import {
	getFinanceTransactionsByVehicle,
	createFinanceTransaction,
	updateFinanceTransaction,
	updateFinanceTransactionAttachments,
	deleteFinanceTransaction
} from '$lib/db/repositories/finance-transactions.js';
import { collectAttachmentIds, MAX_ATTACHMENT_SIZE } from '$lib/server/finance-attachments.js';

export const load: PageServerLoad = async ({ parent, locals }) => {
	const { vehicle } = await parent();

	// Ensure tracker statuses are fresh every time the timeline loads
	await recomputeTrackerStatuses(vehicle.id, vehicle.current_odometer);

	const [logs, odoLogs, trackers, travelEntries, allDocs, financeEntries] = await Promise.all([
		getServiceLogsByVehicle(vehicle.id, locals.user!.id),
		getOdometerLogs(vehicle.id, locals.user!.id),
		getTrackersByVehicle(vehicle.id, locals.user!.id),
		getTravelsForTimeline(vehicle.id, locals.user!.id),
		getDocumentsByVehicle(vehicle.id, locals.user!.id),
		getFinanceTransactionsByVehicle(vehicle.id, locals.user!.id)
	]);

	return {
		logs,
		odoLogs,
		trackers,
		vehicle,
		travelEntries,
		allDocs,
		financeEntries,
		currency: (locals.user as any)?.settings?.currency ?? 'EUR',
		timelinePrefs: locals.user!.settings?.page_prefs?.timeline ?? null,
		addMenuOrder: locals.user!.settings?.page_prefs?.global?.addMenuOrder ?? null
	};
};

export const actions: Actions = {
	logService: async ({ request, locals, params }) => {
		const formData = await request.formData();
		const raw = Object.fromEntries(formData);
		const currency = (locals.user as any)?.settings?.currency ?? 'EUR';

		// getAll() required > Object.fromEntries drops duplicate keys for multi-checkboxes
		const resetTrackerIds = formData.getAll('reset_trackers').map(String).filter(Boolean);
		const trackerId = (raw.tracker_id as string) || resetTrackerIds[0] || undefined;

		const input = {
			vehicle_id: params.id,
			tracker_id: trackerId,
			performed_at: raw.performed_at as string,
			odometer_at_service: Number(raw.odometer_at_service),
			cost_cents: raw.cost ? Math.round(Number(raw.cost) * 100) : undefined,
			currency,
			notes: raw.notes || undefined,
			remark: raw.remark ? String(raw.remark).trim() : undefined,
			parts_used: [],
			serviced_tracker_ids: resetTrackerIds.slice(1)
		};

		const parsed = CreateServiceLogSchema.safeParse(input);
		if (!parsed.success) {
			return fail(400, { error: parsed.error.issues[0]?.message ?? 'Invalid input' });
		}

		// Handle optional file attachment
		const attachmentFile = formData.get('attachment_file') as File | null;
		const attachmentDocIds: string[] = [];
		if (attachmentFile && attachmentFile.size > 0) {
			if (attachmentFile.size > MAX_ATTACHMENT_SIZE) {
				return fail(400, { error: 'Attachment too large (max 10 MB)' });
			}
			const key = attachmentStorageKey(locals.user!.id, params.id, attachmentFile.name);
			const buffer = Buffer.from(await attachmentFile.arrayBuffer());
			try {
				const storage = getStorage();
				await storage.put(key, buffer, attachmentFile.type || 'application/octet-stream');
			} catch (e) {
				console.error('Attachment upload failed:', e);
				return fail(500, { error: 'Attachment upload failed' });
			}
			const docName = String(raw.attachment_name || attachmentFile.name)
				.trim()
				.slice(0, 200);
			const docType = String(raw.attachment_type || 'service');
			const doc = await createDocument(locals.user!.id, {
				vehicle_id: params.id,
				name: docName,
				doc_type: docType,
				storage_key: key,
				mime_type: attachmentFile.type || 'application/octet-stream',
				size_bytes: attachmentFile.size
			});
			onDocumentCreated(locals.user!.id, doc);
			attachmentDocIds.push(doc.id);
		}

		const vehicle = await getVehicleById(params.id, locals.user!.id);
		const maxOdo = vehicle?.current_odometer ?? 0;
		const warning =
			parsed.data.odometer_at_service < maxOdo
				? `Odometer is lower than the highest recorded reading (${maxOdo} km). Saved as a historical record.`
				: undefined;

		// Collect any existing doc IDs linked from the picker in the new form
		const linkedDocIds = formData.getAll('linked_doc_id').map(String).filter(Boolean);

		const trackers = await getTrackersByVehicle(params.id, locals.user!.id);
		const primaryTracker = parsed.data.tracker_id
			? trackers.find((t) => t.id === parsed.data.tracker_id)
			: undefined;
		const isReminder = primaryTracker ? isReminderTracker(primaryTracker) : false;

		await createServiceLog(locals.user!.id, {
			...parsed.data,
			attachments: [...attachmentDocIds, ...linkedDocIds],
			is_reminder: isReminder
		});

		const trueOdo = await recomputeCurrentOdometer(params.id, locals.user!.id);
		await recomputeTrackerStatuses(params.id, trueOdo);
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
		const unit = vehicle?.odometer_unit ?? 'km';
		let warning: string | undefined;

		if (raw === maxOdo) {
			warning = `You already have a reading of ${raw} ${unit}. Saving anyway for your records.`;
		} else if (raw < maxOdo) {
			warning = `Lower than the highest recorded reading (${maxOdo} ${unit}). Saved as a historical record.`;
		} else {
			await updateOdometer(params.id, locals.user!.id, raw, vehicle?.odometer_unit);
		}

		await insertOdometerLog(params.id, locals.user!.id, raw, remark, recordedAt);
		await recomputeTrackerStatuses(params.id, Math.max(raw, maxOdo));
		runWorkflowChecks(locals.user!.id).catch(() => {});

		return { odoUpdated: true, warning };
	},

	editServiceLog: async ({ request, locals, params }) => {
		const result = await applyServiceLogEdit(await request.formData(), locals.user!.id, params.id);
		if ('error' in result) return fail(result.status, { editError: result.error });
		return { editedLog: true, warning: result.warning };
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
	},

	deleteFinanceEntry: async ({ request, locals, params }) => {
		const data = await request.formData();
		const id = String(data.get('id') ?? '');
		if (!id) return fail(400, { error: 'Missing ID' });
		await deleteFinanceTransaction(id, params.id, locals.user!.id);
		return { deletedLog: true };
	},

	addTransaction: async ({ request, locals, params }) => {
		const formData = await request.formData();
		const category = String(formData.get('category') || 'other');
		const amount = String(formData.get('amount') || '');
		const date = String(formData.get('date') || '');
		const odometer = formData.get('odometer') ? Number(formData.get('odometer')) : null;
		const notes = String(formData.get('notes') || '').trim() || null;

		if (!amount || !date) return fail(400, { error: 'Amount and date are required' });
		const amountCents = Math.round(parseFloat(amount) * 100);
		if (isNaN(amountCents) || amountCents <= 0) return fail(400, { error: 'Invalid amount' });
		if (!date.match(/^\d{4}-\d{2}-\d{2}$/)) return fail(400, { error: 'Invalid date format' });

		const validCategories = [
			'maintenance',
			'parts',
			'accessories',
			'administrative',
			'fuel',
			'other'
		];
		if (!validCategories.includes(category)) return fail(400, { error: 'Invalid category' });

		const attachments = await collectAttachmentIds(formData, locals.user!.id, params.id);
		if ('error' in attachments) return fail(attachments.status, { error: attachments.error });

		await createFinanceTransaction(locals.user!.id, {
			vehicle_id: params.id,
			category: category as
				| 'maintenance'
				| 'parts'
				| 'accessories'
				| 'administrative'
				| 'fuel'
				| 'other',
			amount_cents: amountCents,
			currency: (locals.user as any)?.settings?.currency || 'EUR',
			notes,
			performed_at: date,
			odometer_at_transaction: odometer,
			attachments: attachments.ids
		});

		return { created: true };
	},

	editTransaction: async ({ request, locals, params }) => {
		const formData = await request.formData();
		const id = String(formData.get('id') || '');
		const category = String(formData.get('category') || 'other');
		const amount = String(formData.get('amount') || '');
		const date = String(formData.get('date') || '');
		const odometer = formData.get('odometer') ? Number(formData.get('odometer')) : null;
		const notes = String(formData.get('notes') || '').trim() || null;

		if (!id || !amount || !date) return fail(400, { error: 'Missing required fields' });
		const amountCents = Math.round(parseFloat(amount) * 100);
		if (isNaN(amountCents) || amountCents <= 0) return fail(400, { error: 'Invalid amount' });
		if (!date.match(/^\d{4}-\d{2}-\d{2}$/)) return fail(400, { error: 'Invalid date format' });

		const validCategories = [
			'maintenance',
			'parts',
			'accessories',
			'administrative',
			'fuel',
			'other'
		];
		if (!validCategories.includes(category)) return fail(400, { error: 'Invalid category' });

		const attachments = await collectAttachmentIds(formData, locals.user!.id, params.id);
		if ('error' in attachments) return fail(attachments.status, { error: attachments.error });

		await updateFinanceTransaction(id, params.id, locals.user!.id, {
			category: category as
				| 'maintenance'
				| 'parts'
				| 'accessories'
				| 'administrative'
				| 'fuel'
				| 'other',
			amount_cents: amountCents,
			notes,
			performed_at: date,
			odometer_at_transaction: odometer
		});

		// The form submits the attachments it kept plus anything newly linked, so replace the list
		await updateFinanceTransactionAttachments(id, params.id, locals.user!.id, attachments.ids);

		return { edited: true };
	}
};
