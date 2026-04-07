import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import {
	getServiceLogsByVehicle,
	createServiceLog,
	updateServiceLog,
	deleteServiceLog,
	getServiceLogById,
	updateServiceLogAttachments
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
import {
	getDocumentsByVehicle,
	createDocument
} from '$lib/db/repositories/documents.js';
import { getStorage } from '$lib/storage/index.js';
import { generateId } from '$lib/utils/id.js';
import { CreateServiceLogSchema } from '$lib/validators/schemas.js';
import { runWorkflowChecks } from '$lib/workflow/engine.js';
import { getTravelsForTimeline } from '$lib/db/repositories/travels.js';

const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024; // 10 MB

function attachmentStorageKey(userId: string, filename: string): string {
	const ext =
		filename
			.split('.')
			.pop()
			?.replace(/[^a-zA-Z0-9]/g, '') ?? 'bin';
	return `files/${userId}/${generateId()}.${ext}`;
}

export const load: PageServerLoad = async ({ parent, locals }) => {
	const { vehicle } = await parent();

	// Ensure tracker statuses are fresh every time the timeline loads
	await recomputeTrackerStatuses(vehicle.id, vehicle.current_odometer);

	const [logs, odoLogs, trackers, travelEntries, allDocs] = await Promise.all([
		getServiceLogsByVehicle(vehicle.id, locals.user!.id),
		getOdometerLogs(vehicle.id, locals.user!.id),
		getTrackersByVehicle(vehicle.id, locals.user!.id),
		getTravelsForTimeline(vehicle.id, locals.user!.id),
		getDocumentsByVehicle(vehicle.id, locals.user!.id)
	]);

	return { logs, odoLogs, trackers, vehicle, travelEntries, allDocs };
};

export const actions: Actions = {
	logService: async ({ request, locals, params }) => {
		const formData = await request.formData();
		const raw = Object.fromEntries(formData);
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

		// Handle optional file attachment
		const attachmentFile = formData.get('attachment_file') as File | null;
		const attachmentDocIds: string[] = [];
		if (attachmentFile && attachmentFile.size > 0) {
			if (attachmentFile.size > MAX_ATTACHMENT_SIZE) {
				return fail(400, { error: 'Attachment too large (max 10 MB)' });
			}
			const key = attachmentStorageKey(locals.user!.id, attachmentFile.name);
			const buffer = Buffer.from(await attachmentFile.arrayBuffer());
			try {
				const storage = getStorage();
				await storage.put(key, buffer, attachmentFile.type || 'application/octet-stream');
			} catch (e) {
				console.error('Attachment upload failed:', e);
				return fail(500, { error: 'Attachment upload failed' });
			}
			const docName = String(raw.attachment_name || attachmentFile.name).trim().slice(0, 200);
			const docType = String(raw.attachment_type || 'service');
			const doc = await createDocument(locals.user!.id, {
				vehicle_id: params.id,
				name: docName,
				doc_type: docType,
				storage_key: key,
				mime_type: attachmentFile.type || 'application/octet-stream',
				size_bytes: attachmentFile.size
			});
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

		const serviceLog = await createServiceLog(locals.user!.id, {
			...parsed.data,
			attachments: [...attachmentDocIds, ...linkedDocIds]
		});

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

	linkDocument: async ({ request, locals, params }) => {
		const data = await request.formData();
		const serviceLogId = String(data.get('service_log_id') ?? '');
		const documentId = String(data.get('document_id') ?? '');
		if (!serviceLogId || !documentId) return fail(400, { error: 'Missing fields' });

		const log = await getServiceLogById(serviceLogId);
		if (!log || log.vehicle_id !== params.id) return fail(404, { error: 'Not found' });

		// Verify vehicle ownership
		const vehicle = await getVehicleById(params.id, locals.user!.id);
		if (!vehicle) return fail(403, { error: 'Forbidden' });

		const current = (log.attachments as string[]) ?? [];
		if (!current.includes(documentId)) {
			await updateServiceLogAttachments(serviceLogId, params.id, locals.user!.id, [
				...current,
				documentId
			]);
		}
		return { linked: true };
	},

	unlinkDocument: async ({ request, locals, params }) => {
		const data = await request.formData();
		const serviceLogId = String(data.get('service_log_id') ?? '');
		const documentId = String(data.get('document_id') ?? '');
		if (!serviceLogId || !documentId) return fail(400, { error: 'Missing fields' });

		const log = await getServiceLogById(serviceLogId);
		if (!log || log.vehicle_id !== params.id) return fail(404, { error: 'Not found' });

		const vehicle = await getVehicleById(params.id, locals.user!.id);
		if (!vehicle) return fail(403, { error: 'Forbidden' });

		const current = (log.attachments as string[]) ?? [];
		await updateServiceLogAttachments(
			serviceLogId,
			params.id,
			locals.user!.id,
			current.filter((id) => id !== documentId)
		);
		return { unlinked: true };
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
	},

	uploadToLog: async ({ request, locals, params }) => {
		const formData = await request.formData();
		const serviceLogId = String(formData.get('service_log_id') ?? '');
		const file = formData.get('file') as File | null;

		if (!serviceLogId) return fail(400, { uploadError: 'Missing service log ID' });
		if (!file || file.size === 0) return fail(400, { uploadError: 'No file selected' });
		if (file.size > MAX_ATTACHMENT_SIZE) return fail(400, { uploadError: 'File too large (max 10 MB)' });

		const log = await getServiceLogById(serviceLogId);
		if (!log || log.vehicle_id !== params.id) return fail(404, { uploadError: 'Not found' });

		const vehicle = await getVehicleById(params.id, locals.user!.id);
		if (!vehicle) return fail(403, { uploadError: 'Forbidden' });

		const key = attachmentStorageKey(locals.user!.id, file.name);
		const buffer = Buffer.from(await file.arrayBuffer());
		try {
			const storage = getStorage();
			await storage.put(key, buffer, file.type || 'application/octet-stream');
		} catch (e) {
			console.error('Attachment upload failed:', e);
			return fail(500, { uploadError: 'Upload failed' });
		}

		const docName = String(formData.get('doc_name') || file.name).trim().slice(0, 200);
		const docType = String(formData.get('doc_type') || 'service');
		const doc = await createDocument(locals.user!.id, {
			vehicle_id: params.id,
			name: docName,
			doc_type: docType,
			storage_key: key,
			mime_type: file.type || 'application/octet-stream',
			size_bytes: file.size
		});

		const current = (log.attachments as string[]) ?? [];
		await updateServiceLogAttachments(serviceLogId, params.id, locals.user!.id, [
			...current,
			doc.id
		]);
		return { attachUploaded: true };
	}
};
