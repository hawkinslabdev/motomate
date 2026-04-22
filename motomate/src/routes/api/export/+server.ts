import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';
import { zipSync, strToU8 } from 'fflate';
import { getVehiclesByUser, getOdometerLogs } from '$lib/db/repositories/vehicles.js';
import { getServiceLogsByVehicle } from '$lib/db/repositories/service-logs.js';
import { getTrackersByVehicle, getTemplatesByUser } from '$lib/db/repositories/maintenance.js';
import { getFinanceTransactionsByVehicle } from '$lib/db/repositories/finance-transactions.js';
import { getDocumentsByVehicle } from '$lib/db/repositories/documents.js';
import { getWorkflowRulesByUser } from '$lib/db/repositories/workflow.js';
import { getNotifications } from '$lib/workflow/channels/inapp.js';
import { getStorage } from '$lib/storage/index.js';

export const GET: RequestHandler = async ({ locals, url }) => {
	if (!locals.user) error(401, 'Unauthorized');

	const userId = locals.user.id;
	const format = url.searchParams.get('format') === 'zip' ? 'zip' : 'json';
	const dateStr = new Date().toISOString().slice(0, 10);

	const [vehicles, templates, workflowRules, notifications] = await Promise.all([
		getVehiclesByUser(userId, true),
		getTemplatesByUser(userId),
		getWorkflowRulesByUser(userId),
		getNotifications(userId, 10000, 0, 'all')
	]);

	const vehicleData = await Promise.all(
		vehicles.map(async (v) => {
			const [odometerLogs, serviceLogs, trackers, financeTransactions, documents] =
				await Promise.all([
					getOdometerLogs(v.id, userId),
					getServiceLogsByVehicle(v.id, userId),
					getTrackersByVehicle(v.id, userId),
					getFinanceTransactionsByVehicle(v.id, userId),
					getDocumentsByVehicle(v.id, userId)
				]);
			return { vehicle: v, odometerLogs, serviceLogs, trackers, financeTransactions, documents };
		})
	);

	// Strip sensitive fields from user profile
	const { password_hash: _pw, ...safeUser } = locals.user as typeof locals.user & {
		password_hash?: string;
	};

	const exportData = {
		meta: {
			exportedAt: new Date().toISOString(),
			format: '1.0',
			userId
		},
		profile: safeUser,
		vehicles: vehicleData,
		taskTemplates: templates,
		workflowRules,
		notifications
	};

	if (format === 'json') {
		const body = JSON.stringify(exportData, null, 2);
		return new Response(body, {
			headers: {
				'Content-Type': 'application/json',
				'Content-Disposition': `attachment; filename="motomate-export-${dateStr}.json"`,
				'Cache-Control': 'no-store'
			}
		});
	}

	const storage = getStorage();
	const now = new Date();
	const zipFiles: Record<string, [Uint8Array, { mtime: Date }]> = {};

	// export.json in root
	zipFiles['export.json'] = [strToU8(JSON.stringify(exportData, null, 2)), { mtime: now }];

	// Fetch document files — organised by vehicle / doc_type / filename
	for (const { vehicle, documents } of vehicleData) {
		for (const doc of documents) {
			try {
				const buf = await storage.getBuffer(doc.storage_key);
				const ext = doc.storage_key.split('.').pop() ?? 'bin';
				const safeName = doc.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);
				const path = `documents/${vehicle.id}/${doc.doc_type}/${doc.id}-${safeName}.${ext}`;
				const mtime = new Date(doc.created_at);
				zipFiles[path] = [new Uint8Array(buf), { mtime }];
			} catch {
				// File missing from storage — skip gracefully
			}
		}
	}

	const zipped = zipSync(zipFiles, { level: 6 });

	return new Response(zipped.buffer as ArrayBuffer, {
		headers: {
			'Content-Type': 'application/zip',
			'Content-Disposition': `attachment; filename="motomate-export-${dateStr}.zip"`,
			'Content-Length': zipped.length.toString(),
			'Cache-Control': 'no-store'
		}
	});
};
