import { eq, and, desc, inArray, lte, sql } from 'drizzle-orm';
import { db } from '../index.js';
import { travels } from '../schema.js';
import { getVehicleById } from './vehicles.js';
import type { Travel, InsertTravel } from '../schema.js';
import { generateId } from '../../utils/id.js';

export type CreateTravelInput = {
	vehicle_id: string;
	start_date: string; // YYYY-MM-DD
	duration_days: number;
	title: string;
	remark?: string | null;
	total_expenses_cents?: number | null;
	currency: string;
	gpx_document_ids: (string | null)[]; // null = empty slot, preserves day positions
	excluded_gpx_days?: number[]; // day indices (0-based) to hide from map
};

export type UpdateTravelInput = Partial<Omit<CreateTravelInput, 'vehicle_id'>>;

export type TravelTimelineEntry = Pick<
	Travel,
	| 'id'
	| 'start_date'
	| 'duration_days'
	| 'title'
	| 'total_expenses_cents'
	| 'currency'
	| 'created_at'
>;

export async function createTravel(userId: string, input: CreateTravelInput): Promise<Travel> {
	const vehicle = await getVehicleById(input.vehicle_id, userId);
	if (!vehicle) throw new Error('Vehicle not found');

	const id = generateId();
	const now = new Date().toISOString();
	const row: InsertTravel = {
		...input,
		id,
		user_id: userId,
		remark: input.remark ?? null,
		total_expenses_cents: input.total_expenses_cents ?? null,
		created_at: now,
		updated_at: now
	};

	await db.insert(travels).values(row);
	return db.query.travels.findFirst({ where: eq(travels.id, id) }) as Promise<Travel>;
}

export async function getTravelsByVehicle(vehicleId: string, userId: string): Promise<Travel[]> {
	const vehicle = await getVehicleById(vehicleId, userId);
	if (!vehicle) return [];
	return db.query.travels.findMany({
		where: eq(travels.vehicle_id, vehicleId),
		orderBy: [desc(travels.start_date), desc(travels.created_at)]
	});
}

export async function getTravelById(id: string, userId: string): Promise<Travel | undefined> {
	return db.query.travels.findFirst({
		where: and(eq(travels.id, id), eq(travels.user_id, userId))
	});
}

export async function updateTravel(
	id: string,
	vehicleId: string,
	userId: string,
	input: UpdateTravelInput
): Promise<void> {
	const vehicle = await getVehicleById(vehicleId, userId);
	if (!vehicle) return;
	const now = new Date().toISOString();
	await db
		.update(travels)
		.set({ ...input, updated_at: now })
		.where(and(eq(travels.id, id), eq(travels.vehicle_id, vehicleId)));
}

export async function deleteTravel(id: string, vehicleId: string, userId: string): Promise<void> {
	const vehicle = await getVehicleById(vehicleId, userId);
	if (!vehicle) return;
	await db.delete(travels).where(and(eq(travels.id, id), eq(travels.vehicle_id, vehicleId)));
}

export async function getTravelsForTimeline(
	vehicleId: string,
	userId: string
): Promise<TravelTimelineEntry[]> {
	const vehicle = await getVehicleById(vehicleId, userId);
	if (!vehicle) return [];
	return db
		.select({
			id: travels.id,
			start_date: travels.start_date,
			duration_days: travels.duration_days,
			title: travels.title,
			total_expenses_cents: travels.total_expenses_cents,
			currency: travels.currency,
			created_at: travels.created_at
		})
		.from(travels)
		.where(and(eq(travels.vehicle_id, vehicleId), lte(travels.start_date, sql`date('now')`)))
		.orderBy(desc(travels.start_date));
}
