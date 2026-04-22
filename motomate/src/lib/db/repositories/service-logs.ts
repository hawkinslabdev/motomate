import { eq, and, inArray, desc } from 'drizzle-orm';
import { db } from '../index.js';
import { service_logs, vehicles } from '../schema.js';
import { CreateServiceLogSchema } from '../../validators/schemas.js';
import { updateTrackerAfterService } from './maintenance.js';
import { updateOdometer, getVehicleById } from './vehicles.js';
import { active_trackers, task_templates } from '../schema.js';
import type { InsertServiceLog, ServiceLog } from '../schema.js';
import { generateId } from '../../utils/id.js';
import {
	compareMeasurements,
	isDistanceMeasurementValue,
	resolveMeasurementValue
} from '../../utils/measurement.js';

function hydrateServiceLog(log: ServiceLog): ServiceLog {
	return {
		...log,
		odometer_at_service: log.measurement_at_service ?? log.odometer_at_service
	};
}

export async function createServiceLog(userId: string, input: unknown): Promise<ServiceLog> {
	const parsed = CreateServiceLogSchema.parse(input);
	const vehicle = await getVehicleById(parsed.vehicle_id, userId);
	const id = generateId();
	const row: InsertServiceLog = {
		...parsed,
		id,
		measurement_at_service: parsed.odometer_at_service,
		measurement_unit: vehicle?.odometer_unit
	};

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

	// Only advance the vehicle odometer/hours — never move it backwards.
	// Logging historical entries (e.g. "oil change 400 km ago") must not
	// overwrite a higher current reading.
	const serviceMeasurement = resolveMeasurementValue(
		row.measurement_at_service,
		row.measurement_unit ?? null
	);
	const vehicleMeasurement = vehicle
		? resolveMeasurementValue(vehicle.current_measurement, vehicle.current_measurement_unit)
		: null;
	if ((compareMeasurements(serviceMeasurement, vehicleMeasurement) ?? 0) > 0) {
		await updateOdometer(
			parsed.vehicle_id,
			userId,
			parsed.odometer_at_service,
			isDistanceMeasurementValue(serviceMeasurement)
				? serviceMeasurement.unit
				: vehicle?.odometer_unit
		);
	}

	return hydrateServiceLog(
		(await db.query.service_logs.findFirst({ where: eq(service_logs.id, id) })) as ServiceLog
	);
}

export async function getServiceLogsByVehicle(
	vehicleId: string,
	userId: string
): Promise<ServiceLog[]> {
	const vehicle = await getVehicleById(vehicleId, userId);
	if (!vehicle) return [];
	const rows = await db.query.service_logs.findMany({
		where: eq(service_logs.vehicle_id, vehicleId),
		orderBy: (s, { desc }) => [desc(s.performed_at)]
	});
	return rows.map(hydrateServiceLog);
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
	return rows.map(({ log, trackerName }) => ({
		...hydrateServiceLog(log),
		trackerName: trackerName ?? null
	}));
}

export async function getServiceLogById(id: string): Promise<ServiceLog | undefined> {
	const log = await db.query.service_logs.findFirst({ where: eq(service_logs.id, id) });
	return log ? hydrateServiceLog(log) : undefined;
}

export async function getServiceLogsByTracker(
	trackerId: string,
	vehicleId: string,
	userId: string,
	limit: number = 12
): Promise<ServiceLog[]> {
	const vehicle = await getVehicleById(vehicleId, userId);
	if (!vehicle) return [];
	const rows = await db.query.service_logs.findMany({
		where: and(eq(service_logs.vehicle_id, vehicleId), eq(service_logs.tracker_id, trackerId)),
		orderBy: (s, { desc }) => [desc(s.performed_at)],
		limit
	});
	return rows.map(hydrateServiceLog);
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
	const patch: Partial<InsertServiceLog> = { ...data };
	if (data.odometer_at_service !== undefined) {
		patch.measurement_at_service = data.odometer_at_service;
		patch.measurement_unit = vehicle.odometer_unit;
	}
	db.update(service_logs)
		.set(patch)
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
