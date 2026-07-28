import { and, eq, isNull } from 'drizzle-orm';
import { db } from '../index.js';
import {
	active_trackers,
	finance_transactions,
	odometer_logs,
	service_logs,
	task_templates,
	vehicles,
	workflow_rules
} from '../schema.js';
import { CreateVehicleSchema, UpdateVehicleSchema } from '../../validators/schemas.js';
import type { InsertVehicle, Vehicle, OdometerLog } from '../schema.js';
import { generateId } from '../../utils/id.js';
import {
	DEFAULT_ODOMETER_UNIT,
	convertDistanceValue,
	getMeasurementBasis,
	isDistanceUnit,
	isDistanceMeasurementValue,
	isMeasurementUnit,
	maxComparableMeasurement,
	resolveMeasurementValue,
	type MeasurementUnit,
	type MeasurementValue
} from '../../utils/measurement.js';

function resolveVehicleOdometerFields(
	vehicle: Pick<
		Vehicle,
		'current_measurement' | 'current_measurement_unit' | 'current_odometer' | 'odometer_unit'
	>
) {
	const canonicalMeasurement = resolveMeasurementValue(
		vehicle.current_measurement,
		vehicle.current_measurement_unit
	);
	const unit: MeasurementUnit =
		canonicalMeasurement?.unit ?? vehicle.odometer_unit ?? DEFAULT_ODOMETER_UNIT;
	return {
		current_odometer: canonicalMeasurement?.value ?? vehicle.current_odometer,
		odometer_unit: unit ?? DEFAULT_ODOMETER_UNIT
	};
}

export function resolveVehicleDistanceMeasurement(
	vehicle: Pick<
		Vehicle,
		'current_measurement' | 'current_measurement_unit' | 'current_odometer' | 'odometer_unit'
	>
): MeasurementValue {
	const canonicalMeasurement = resolveMeasurementValue(
		vehicle.current_measurement,
		vehicle.current_measurement_unit
	);
	if (isDistanceMeasurementValue(canonicalMeasurement)) {
		return canonicalMeasurement;
	}

	return (
		resolveMeasurementValue(vehicle.current_odometer, vehicle.odometer_unit) ?? {
			value: vehicle.current_odometer,
			unit: vehicle.odometer_unit ?? DEFAULT_ODOMETER_UNIT,
			basis: 'distance'
		}
	);
}

function hydrateVehicle(vehicle: Vehicle | undefined): Vehicle | undefined {
	if (!vehicle) return undefined;
	return { ...vehicle, ...resolveVehicleOdometerFields(vehicle) };
}

function hydrateOdometerLog(log: OdometerLog): OdometerLog {
	const odometer = log.measurement ?? log.odometer;
	return { ...log, odometer };
}

export async function createVehicle(userId: string, input: unknown): Promise<Vehicle> {
	const parsed = CreateVehicleSchema.parse(input);
	const id = generateId();
	const row: InsertVehicle = {
		...parsed,
		id,
		user_id: userId,
		current_measurement: parsed.current_odometer,
		current_measurement_unit: parsed.odometer_unit
	};
	await db.insert(vehicles).values(row);
	return hydrateVehicle(
		await db.query.vehicles.findFirst({ where: eq(vehicles.id, id) })
	) as Vehicle;
}

export async function getVehiclesByUser(
	userId: string,
	includeArchived = false
): Promise<Vehicle[]> {
	if (includeArchived) {
		const rows = await db.query.vehicles.findMany({
			where: eq(vehicles.user_id, userId),
			orderBy: (v, { asc }) => [asc(v.sort_order), asc(v.created_at)]
		});
		return rows.map((row) => hydrateVehicle(row) as Vehicle);
	}
	const rows = await db.query.vehicles.findMany({
		where: and(eq(vehicles.user_id, userId), isNull(vehicles.archived_at)),
		orderBy: (v, { asc }) => [asc(v.sort_order), asc(v.created_at)]
	});
	return rows.map((row) => hydrateVehicle(row) as Vehicle);
}

export async function getVehicleById(id: string, userId: string): Promise<Vehicle | undefined> {
	return hydrateVehicle(
		await db.query.vehicles.findFirst({
			where: and(eq(vehicles.id, id), eq(vehicles.user_id, userId))
		})
	);
}

export async function updateVehicle(id: string, userId: string, input: unknown): Promise<void> {
	const parsed = UpdateVehicleSchema.parse(input);
	if (parsed.odometer_unit !== undefined) {
		const existing = await getVehicleById(id, userId);
		if (!existing) return;
		if (
			isMeasurementUnit(existing.odometer_unit) &&
			getMeasurementBasis(existing.odometer_unit) !== getMeasurementBasis(parsed.odometer_unit)
		) {
			throw new Error('Vehicle measurement basis cannot be changed after creation');
		}
	}
	const patch: Partial<InsertVehicle> & { updated_at: string } = {
		...parsed,
		updated_at: new Date().toISOString()
	};
	if (parsed.current_odometer !== undefined) {
		patch.current_measurement = parsed.current_odometer;
	}
	if (parsed.odometer_unit !== undefined) {
		patch.current_measurement_unit = parsed.odometer_unit;
	}
	await db
		.update(vehicles)
		.set(patch)
		.where(and(eq(vehicles.id, id), eq(vehicles.user_id, userId)));
}

/**
 * Convert all distance data attached to one vehicle. This intentionally excludes hour-based
 * vehicles and runs as a single database transaction so labels and values cannot diverge.
 *
 * better-sqlite3 transactions require a synchronous callback. Drizzle's SQLite update builders
 * are lazy, so every update inside this callback must finish with `.run()` to execute before the
 * transaction commits.
 */
export async function convertVehicleDistanceUnit(
	id: string,
	userId: string,
	targetUnit: 'km' | 'mi'
): Promise<boolean> {
	const vehicle = await getVehicleById(id, userId);
	if (!vehicle || !isDistanceUnit(vehicle.odometer_unit)) return false;

	const sourceUnit = vehicle.odometer_unit;
	if (sourceUnit === targetUnit) return true;
	const convert = (value: number | null) =>
		value == null ? null : convertDistanceValue(value, sourceUnit, targetUnit);
	const updatedAt = new Date().toISOString();

	db.transaction((tx) => {
		tx.update(vehicles)
			.set({
				current_odometer: convert(vehicle.current_odometer)!,
				current_measurement: convert(vehicle.current_measurement)!,
				current_measurement_unit: targetUnit,
				odometer_unit: targetUnit,
				updated_at: updatedAt
			})
			.where(and(eq(vehicles.id, id), eq(vehicles.user_id, userId)))
			.run();

		const odometerRows = tx
			.select()
			.from(odometer_logs)
			.where(eq(odometer_logs.vehicle_id, id))
			.all();
		for (const row of odometerRows) {
			tx.update(odometer_logs)
				.set({
					odometer: convert(row.odometer)!,
					measurement: convert(row.measurement),
					measurement_unit: targetUnit
				})
				.where(eq(odometer_logs.id, row.id))
				.run();
		}

		const serviceRows = tx.select().from(service_logs).where(eq(service_logs.vehicle_id, id)).all();
		for (const row of serviceRows) {
			tx.update(service_logs)
				.set({
					odometer_at_service: convert(row.odometer_at_service)!,
					measurement_at_service: convert(row.measurement_at_service),
					measurement_unit: targetUnit
				})
				.where(eq(service_logs.id, row.id))
				.run();
		}

		const financeRows = tx
			.select()
			.from(finance_transactions)
			.where(eq(finance_transactions.vehicle_id, id))
			.all();
		for (const row of financeRows) {
			tx.update(finance_transactions)
				.set({
					odometer_at_transaction: convert(row.odometer_at_transaction),
					measurement_at_transaction: convert(row.measurement_at_transaction),
					measurement_unit: targetUnit,
					updated_at: updatedAt
				})
				.where(eq(finance_transactions.id, row.id))
				.run();
		}

		const trackerRows = tx
			.select()
			.from(active_trackers)
			.where(eq(active_trackers.vehicle_id, id))
			.all();
		for (const row of trackerRows) {
			tx.update(active_trackers)
				.set({
					last_done_odometer: convert(row.last_done_odometer),
					last_done_measurement: convert(row.last_done_measurement),
					next_due_odometer: convert(row.next_due_odometer),
					next_due_measurement: convert(row.next_due_measurement),
					measurement_unit: targetUnit,
					updated_at: updatedAt
				})
				.where(eq(active_trackers.id, row.id))
				.run();
		}

		const templateRows = tx
			.select()
			.from(task_templates)
			.where(eq(task_templates.vehicle_id, id))
			.all();
		for (const row of templateRows) {
			tx.update(task_templates)
				.set({
					interval_km: convert(row.interval_km),
					interval_measurement: convert(row.interval_measurement),
					interval_unit: targetUnit
				})
				.where(eq(task_templates.id, row.id))
				.run();
		}

		const ruleRows = tx
			.select()
			.from(workflow_rules)
			.where(and(eq(workflow_rules.vehicle_id, id), eq(workflow_rules.user_id, userId)))
			.all();
		for (const row of ruleRows) {
			const trigger = row.trigger as Record<string, unknown>;
			if (trigger.type === 'odometer_upcoming' && typeof trigger.km_before === 'number') {
				tx.update(workflow_rules)
					.set({
						trigger: {
							...trigger,
							km_before: convertDistanceValue(trigger.km_before, sourceUnit, targetUnit)
						} as any,
						updated_at: updatedAt
					})
					.where(eq(workflow_rules.id, row.id))
					.run();
			}
			if (trigger.type === 'odometer_overdue' && typeof trigger.km_past === 'number') {
				tx.update(workflow_rules)
					.set({
						trigger: {
							...trigger,
							km_past: convertDistanceValue(trigger.km_past, sourceUnit, targetUnit)
						} as any,
						updated_at: updatedAt
					})
					.where(eq(workflow_rules.id, row.id))
					.run();
			}
		}
	});

	return true;
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

export async function updateOdometer(
	id: string,
	userId: string,
	odometer: number,
	odometerUnit?: Vehicle['odometer_unit']
): Promise<void> {
	if (odometer < 0) throw new Error('Odometer cannot be negative');
	const resolvedOdometerUnit = odometerUnit ?? (await getVehicleById(id, userId))?.odometer_unit;
	if (!resolvedOdometerUnit) return;
	await db
		.update(vehicles)
		.set({
			current_odometer: odometer,
			current_measurement: odometer,
			current_measurement_unit: resolvedOdometerUnit,
			updated_at: new Date().toISOString()
		})
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
	const vehicle = await getVehicleById(vehicleId, userId);
	await db.insert(odometer_logs).values({
		id: generateId(),
		vehicle_id: vehicleId,
		user_id: userId,
		odometer,
		measurement: odometer,
		measurement_unit: vehicle?.odometer_unit ?? DEFAULT_ODOMETER_UNIT,
		remark: remark || null,
		kind,
		recorded_at: recordedAt ?? new Date().toISOString().slice(0, 10)
	});
}

export async function getOdometerLogs(vehicleId: string, userId: string): Promise<OdometerLog[]> {
	const vehicle = await getVehicleById(vehicleId, userId);
	if (!vehicle) return [];
	const rows = await db.query.odometer_logs.findMany({
		where: eq(odometer_logs.vehicle_id, vehicleId),
		orderBy: (o, { desc }) => [desc(o.recorded_at), desc(o.created_at)]
	});
	return rows.map(hydrateOdometerLog);
}

export async function updateOdometerLog(
	id: string,
	vehicleId: string,
	userId: string,
	data: { odometer?: number; remark?: string | null; recorded_at?: string }
): Promise<void> {
	const vehicle = await getVehicleById(vehicleId, userId);
	if (!vehicle) return;
	const patch: Partial<typeof odometer_logs.$inferInsert> = { ...data };
	if (data.odometer !== undefined) {
		patch.measurement = data.odometer;
		patch.measurement_unit = vehicle.odometer_unit;
	}
	await db
		.update(odometer_logs)
		.set(patch)
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
	const [vehicle, odoLogs, svcLogs] = await Promise.all([
		getVehicleById(vehicleId, userId),
		db.query.odometer_logs.findMany({
			where: and(eq(odometer_logs.vehicle_id, vehicleId), eq(odometer_logs.user_id, userId))
		}),
		db.query.service_logs.findMany({
			where: eq(service_logs.vehicle_id, vehicleId)
		})
	]);

	const vehicleMeasurement = vehicle
		? resolveVehicleDistanceMeasurement(vehicle)
		: { value: 0, unit: DEFAULT_ODOMETER_UNIT, basis: 'distance' as const };

	const maxMeasurement = maxComparableMeasurement(
		[
			...odoLogs.map((log) =>
				resolveMeasurementValue(
					log.measurement ?? log.odometer,
					log.measurement_unit ?? vehicleMeasurement.unit
				)
			),
			...svcLogs.map((log) =>
				resolveMeasurementValue(
					log.measurement_at_service ?? log.odometer_at_service,
					log.measurement_unit ?? vehicleMeasurement.unit
				)
			)
		],
		vehicleMeasurement
	);

	const newOdo = maxMeasurement?.value ?? 0;
	if (!vehicle) return newOdo;
	await db
		.update(vehicles)
		.set({
			current_odometer: newOdo,
			current_measurement: newOdo,
			current_measurement_unit: vehicleMeasurement.unit,
			updated_at: new Date().toISOString()
		})
		.where(and(eq(vehicles.id, vehicleId), eq(vehicles.user_id, userId)));

	return newOdo;
}

export async function deleteVehicle(id: string, userId: string): Promise<void> {
	await db.delete(vehicles).where(and(eq(vehicles.id, id), eq(vehicles.user_id, userId)));
}

export async function getVehicleByCoverImageKey(
	coverImageKey: string,
	userId: string
): Promise<Vehicle | undefined> {
	return hydrateVehicle(
		await db.query.vehicles.findFirst({
			where: and(eq(vehicles.cover_image_key, coverImageKey), eq(vehicles.user_id, userId))
		})
	);
}
