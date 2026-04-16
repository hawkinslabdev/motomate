import { eq, and, inArray, desc } from 'drizzle-orm';
import { db } from '../index.js';
import { service_logs, vehicles } from '../schema.js';
import { CreateServiceLogSchema } from '../../validators/schemas.js';
import { updateTrackerAfterService } from './maintenance.js';
import { updateOdometer, getVehicleById } from './vehicles.js';
import { active_trackers, task_templates } from '../schema.js';
import type { InsertServiceLog, ServiceLog } from '../schema.js';
import { generateId } from '../../utils/id.js';

export async function createServiceLog(userId: string, input: unknown): Promise<ServiceLog> {
	const parsed = CreateServiceLogSchema.parse(input);
	const id = generateId();
	const row: InsertServiceLog = { ...parsed, id };

	// Insert the log (sync — better-sqlite3)
	db.insert(service_logs).values(row).run();

	// Reset primary tracker
	if (parsed.tracker_id) {
		await updateTrackerAfterService(
			parsed.tracker_id,
			parsed.performed_at,
			parsed.odometer_at_service
		);
	}

	// Reset any additional trackers selected alongside this entry
	for (const id of parsed.serviced_tracker_ids) {
		if (id !== parsed.tracker_id) {
			await updateTrackerAfterService(id, parsed.performed_at, parsed.odometer_at_service);
		}
	}

	// Only advance the vehicle odometer — never move it backwards.
	// Logging historical entries (e.g. "oil change 400 km ago") must not
	// overwrite a higher current reading.
	const vehicle = await getVehicleById(parsed.vehicle_id, userId);
	if (vehicle && parsed.odometer_at_service > vehicle.current_odometer) {
		await updateOdometer(parsed.vehicle_id, userId, parsed.odometer_at_service);
	}

	return db.query.service_logs.findFirst({ where: eq(service_logs.id, id) }) as Promise<ServiceLog>;
}

export async function getServiceLogsByVehicle(
	vehicleId: string,
	userId: string
): Promise<ServiceLog[]> {
	const vehicle = await getVehicleById(vehicleId, userId);
	if (!vehicle) return [];
	return db.query.service_logs.findMany({
		where: eq(service_logs.vehicle_id, vehicleId),
		orderBy: (s, { desc }) => [desc(s.performed_at)]
	});
}

export async function getRecentLogsAcrossVehicles(
	vehicleIds: string[],
	limit = 5
): Promise<(ServiceLog & { trackerName: string | null })[]> {
	if (vehicleIds.length === 0) return [];
	const rows = db
		.select({
			log: service_logs,
			trackerName: task_templates.name
		})
		.from(service_logs)
		.leftJoin(active_trackers, eq(service_logs.tracker_id, active_trackers.id))
		.leftJoin(task_templates, eq(active_trackers.template_id, task_templates.id))
		.where(inArray(service_logs.vehicle_id, vehicleIds))
		.orderBy(desc(service_logs.performed_at))
		.limit(limit)
		.all();
	return rows.map(({ log, trackerName }) => ({ ...log, trackerName: trackerName ?? null }));
}

export async function getServiceLogById(id: string): Promise<ServiceLog | undefined> {
	return db.query.service_logs.findFirst({ where: eq(service_logs.id, id) });
}

export async function getServiceLogsByTracker(
	trackerId: string,
	vehicleId: string,
	userId: string,
	limit: number = 12
): Promise<ServiceLog[]> {
	const vehicle = await getVehicleById(vehicleId, userId);
	if (!vehicle) return [];
	return db.query.service_logs.findMany({
		where: and(eq(service_logs.vehicle_id, vehicleId), eq(service_logs.tracker_id, trackerId)),
		orderBy: (s, { desc }) => [desc(s.performed_at)],
		limit
	});
}

export async function updateServiceLog(
	id: string,
	vehicleId: string,
	userId: string,
	data: {
		performed_at?: string;
		odometer_at_service?: number;
		cost_cents?: number | null;
		notes?: string | null;
		remark?: string | null;
		serviced_tracker_ids?: string[];
	}
): Promise<void> {
	const vehicle = await getVehicleById(vehicleId, userId);
	if (!vehicle) return;
	db.update(service_logs)
		.set(data)
		.where(and(eq(service_logs.id, id), eq(service_logs.vehicle_id, vehicleId)))
		.run();
}

export async function deleteServiceLog(
	id: string,
	vehicleId: string,
	userId: string
): Promise<void> {
	const vehicle = await getVehicleById(vehicleId, userId);
	if (!vehicle) return;
	db.delete(service_logs)
		.where(and(eq(service_logs.id, id), eq(service_logs.vehicle_id, vehicleId)))
		.run();
}

export async function updateServiceLogAttachments(
	id: string,
	vehicleId: string,
	userId: string,
	documentIds: string[]
): Promise<void> {
	const vehicle = await getVehicleById(vehicleId, userId);
	if (!vehicle) return;
	db.update(service_logs)
		.set({ attachments: documentIds })
		.where(and(eq(service_logs.id, id), eq(service_logs.vehicle_id, vehicleId)))
		.run();
}
