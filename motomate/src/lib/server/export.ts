import { zipSync, strToU8 } from 'fflate';
import { getVehiclesByUser, getOdometerLogs } from '$lib/db/repositories/vehicles.js';
import { getServiceLogsByVehicle } from '$lib/db/repositories/service-logs.js';
import { getTrackersByVehicle, getTemplatesByUser } from '$lib/db/repositories/maintenance.js';
import { getFinanceTransactionsByVehicle } from '$lib/db/repositories/finance-transactions.js';
import { getDocumentsByVehicle } from '$lib/db/repositories/documents.js';
import { getNotesByVehicle } from '$lib/db/repositories/notes.js';
import { getWorkflowRulesByUser } from '$lib/db/repositories/workflow.js';
import { getNotifications } from '$lib/workflow/channels/inapp.js';
import { getDocumentContent } from '$lib/server/document-content.js';

export async function buildExportData(userId: string) {
	const [vehicles, templates, workflowRules, notifications] = await Promise.all([
		getVehiclesByUser(userId, true),
		getTemplatesByUser(userId),
		getWorkflowRulesByUser(userId),
		getNotifications(userId, 10000, 0, 'all')
	]);

	const vehicleData = await Promise.all(
		vehicles.map(async (v) => {
			const [odometerLogs, serviceLogs, trackers, financeTransactions, documents, notes] =
				await Promise.all([
					getOdometerLogs(v.id, userId),
					getServiceLogsByVehicle(v.id, userId),
					getTrackersByVehicle(v.id, userId),
					getFinanceTransactionsByVehicle(v.id, userId),
					getDocumentsByVehicle(v.id, userId),
					getNotesByVehicle(v.id, userId)
				]);
			return {
				vehicle: v,
				odometerLogs,
				serviceLogs,
				trackers,
				financeTransactions,
				documents,
				notes
			};
		})
	);

	return { vehicleData, templates, workflowRules, notifications };
}

export async function generateJsonExport(
	userId: string,
	_userEmail: string,
	safeProfile: Record<string, unknown>
): Promise<{ body: string; filename: string }> {
	const { vehicleData, templates, workflowRules, notifications } = await buildExportData(userId);
	const dateStr = new Date().toISOString().slice(0, 10);

	const exportData = {
		meta: { exportedAt: new Date().toISOString(), format: '1.0', userId },
		profile: safeProfile,
		vehicles: vehicleData,
		taskTemplates: templates,
		workflowRules,
		notifications
	};

	return {
		body: JSON.stringify(exportData, null, 2),
		filename: `motomate-export-${dateStr}.json`
	};
}

export async function generateZipExport(
	userId: string,
	safeProfile: Record<string, unknown>
): Promise<{ buffer: Uint8Array; filename: string }> {
	const { vehicleData, templates, workflowRules, notifications } = await buildExportData(userId);
	const dateStr = new Date().toISOString().slice(0, 10);
	const now = new Date();

	const exportData = {
		meta: { exportedAt: new Date().toISOString(), format: '1.0', userId },
		profile: safeProfile,
		vehicles: vehicleData,
		taskTemplates: templates,
		workflowRules,
		notifications
	};

	const zipFiles: Record<string, [Uint8Array, { mtime: Date }]> = {};
	zipFiles['export.json'] = [strToU8(JSON.stringify(exportData, null, 2)), { mtime: now }];

	for (const { vehicle, documents } of vehicleData) {
		for (const doc of documents) {
			try {
				const { data: buf } = await getDocumentContent(doc, userId);
				const ext = doc.name.split('.').pop() ?? 'bin';
				const safeName = doc.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);
				const path = `documents/${vehicle.id}/${doc.doc_type}/${doc.id}-${safeName}.${ext}`;
				zipFiles[path] = [new Uint8Array(buf), { mtime: new Date(doc.created_at) }];
			} catch {
				// File missing from storage
			}
		}
	}

	const zipped = zipSync(zipFiles, { level: 6 });
	return { buffer: zipped, filename: `motomate-export-${dateStr}.zip` };
}
