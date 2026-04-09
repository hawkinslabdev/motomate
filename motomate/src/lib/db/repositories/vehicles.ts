import { eq, and, isNull } from 'drizzle-orm';
import { db } from '../index.js';
import { vehicles, odometer_logs, service_logs } from '../schema.js';
import { CreateVehicleSchema, UpdateVehicleSchema } from '../../validators/schemas.js';
import type { InsertVehicle, Vehicle, OdometerLog } from '../schema.js';
import { generateId } from '../../utils/id.js';

export async function createVehicle(userId: string, input: unknown): Promise<Vehicle> {
	const parsed = CreateVehicleSchema.parse(input);
	const id = generateId();
	const row: InsertVehicle = { ...parsed, id, user_id: userId };
	await db.insert(vehicles).values(row);
	return db.query.vehicles.findFirst({ where: eq(vehicles.id, id) }) as Promise<Vehicle>;
}

export async function getVehiclesByUser(
	userId: string,
	includeArchived = false
): Promise<Vehicle[]> {
	if (includeArchived) {
		return db.query.vehicles.findMany({
			where: eq(vehicles.user_id, userId),
			orderBy: (v, { asc }) => [asc(v.sort_order), asc(v.created_at)]
		});
	}
	return db.query.vehicles.findMany({
		where: and(eq(vehicles.user_id, userId), isNull(vehicles.archived_at)),
		orderBy: (v, { asc }) => [asc(v.sort_order), asc(v.created_at)]
	});
}

export async function getVehicleById(id: string, userId: string): Promise<Vehicle | undefined> {
	return db.query.vehicles.findFirst({
		where: and(eq(vehicles.id, id), eq(vehicles.user_id, userId))
	});
}

export async function updateVehicle(id: string, userId: string, input: unknown): Promise<void> {
	const parsed = UpdateVehicleSchema.parse(input);
	await db
		.update(vehicles)
		.set({ ...parsed, updated_at: new Date().toISOString() })
		.where(and(eq(vehicles.id, id), eq(vehicles.user_id, userId)));
}

export async function archiveVehicle(id: string, userId: string): Promise<void> {
	await db
		.update(vehicles)
		.set({ archived_at: new Date().toISOString(), updated_at: new Date().toISOString() })
		.where(and(eq(vehicles.id, id), eq(vehicles.user_id, userId)));
}

export async function unarchiveVehicle(id: string, userId: string): Promise<void> {
	await db
		.update(vehicles)
		.set({ archived_at: null, updated_at: new Date().toISOString() })
		.where(and(eq(vehicles.id, id), eq(vehicles.user_id, userId)));
}

export async function updateOdometer(id: string, userId: string, odometer: number): Promise<void> {
	if (odometer < 0) throw new Error('Odometer cannot be negative');
	await db
		.update(vehicles)
		.set({ current_odometer: odometer, updated_at: new Date().toISOString() })
		.where(and(eq(vehicles.id, id), eq(vehicles.user_id, userId)));
}

export async function insertOdometerLog(
	vehicleId: string,
	userId: string,
	odometer: number,
	remark?: string,
	recordedAt?: string,
	kind: 'odometer' | 'note' = 'odometer'
): Promise<void> {
	if (odometer < 0) {
		throw new Error('Odometer cannot be negative');
	}
	await db.insert(odometer_logs).values({
		id: generateId(),
		vehicle_id: vehicleId,
		user_id: userId,
		odometer,
		remark: remark || null,
		kind,
		recorded_at: recordedAt ?? new Date().toISOString().slice(0, 10)
	});
}

export async function getOdometerLogs(vehicleId: string, userId: string): Promise<OdometerLog[]> {
	const vehicle = await getVehicleById(vehicleId, userId);
	if (!vehicle) return [];
	return db.query.odometer_logs.findMany({
		where: eq(odometer_logs.vehicle_id, vehicleId),
		orderBy: (o, { desc }) => [desc(o.recorded_at), desc(o.created_at)]
	});
}

export async function getMaxOdometer(vehicleId: string, userId: string): Promise<number> {
	const vehicle = await getVehicleById(vehicleId, userId);
	if (!vehicle) return 0;
	const result = await db.query.odometer_logs.findFirst({
		where: eq(odometer_logs.vehicle_id, vehicleId),
		orderBy: (o, { desc }) => [desc(o.odometer)],
		columns: { odometer: true }
	});
	return result?.odometer ?? 0;
}

export async function updateOdometerLog(
	id: string,
	vehicleId: string,
	userId: string,
	data: { odometer?: number; remark?: string | null; recorded_at?: string }
): Promise<void> {
	const vehicle = await getVehicleById(vehicleId, userId);
	if (!vehicle) return;
	await db
		.update(odometer_logs)
		.set(data)
		.where(and(eq(odometer_logs.id, id), eq(odometer_logs.vehicle_id, vehicleId)));
}

export async function deleteOdometerLog(
	id: string,
	vehicleId: string,
	userId: string
): Promise<void> {
	const vehicle = await getVehicleById(vehicleId, userId);
	if (!vehicle) return;
	await db
		.delete(odometer_logs)
		.where(and(eq(odometer_logs.id, id), eq(odometer_logs.vehicle_id, vehicleId)));
}

/**
 * Recomputes `current_odometer` as the max reading across all odometer_logs
 * and service_logs for the vehicle. Safe to call after any log edit or delete.
 * If no logs remain, resets to 0 so the vehicle can accept any new reading.
 * Returns the new odometer value.
 */
export async function recomputeCurrentOdometer(vehicleId: string, userId: string): Promise<number> {
	const [odoLogs, svcLogs] = await Promise.all([
		db.query.odometer_logs.findMany({ where: eq(odometer_logs.vehicle_id, vehicleId) }),
		db.query.service_logs.findMany({ where: eq(service_logs.vehicle_id, vehicleId) })
	]);

	const readings = [
		...odoLogs.map((l) => l.odometer),
		...svcLogs.map((l) => l.odometer_at_service)
	];

	const newOdo = readings.length === 0 ? 0 : Math.max(...readings);
	await db
		.update(vehicles)
		.set({ current_odometer: newOdo, updated_at: new Date().toISOString() })
		.where(and(eq(vehicles.id, vehicleId), eq(vehicles.user_id, userId)));

	return newOdo;
}

export async function deleteVehicle(id: string, userId: string): Promise<void> {
	await db.delete(vehicles).where(and(eq(vehicles.id, id), eq(vehicles.user_id, userId)));
}

export async function getVehicleByCoverImageKey(
	coverImageKey: string
): Promise<Vehicle | undefined> {
	return db.query.vehicles.findFirst({
		where: eq(vehicles.cover_image_key, coverImageKey)
	});
}
