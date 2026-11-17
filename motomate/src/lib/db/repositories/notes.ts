import { eq, and, desc } from 'drizzle-orm';
import { db } from '../index.js';
import { vehicle_notes } from '../schema.js';
import { getVehicleById } from './vehicles.js';
import { ownedDocumentIds } from './documents.js';
import { generateId } from '../../utils/id.js';
import type { VehicleNote } from '../schema.js';

export type CreateNoteInput = {
	vehicle_id: string;
	title?: string | null;
	content: string;
	doc_refs?: string[];
};

export type UpdateNoteInput = {
	title?: string | null;
	content?: string;
	doc_refs?: string[];
};

export async function getNotesByVehicle(vehicleId: string, userId: string): Promise<VehicleNote[]> {
	const vehicle = await getVehicleById(vehicleId, userId);
	if (!vehicle) return [];
	return db.query.vehicle_notes.findMany({
		where: eq(vehicle_notes.vehicle_id, vehicleId),
		orderBy: [desc(vehicle_notes.updated_at)]
	});
}

export async function getNoteById(
	id: string,
	vehicleId: string,
	userId: string
): Promise<VehicleNote | undefined> {
	const vehicle = await getVehicleById(vehicleId, userId);
	if (!vehicle) return undefined;
	return db.query.vehicle_notes.findFirst({
		where: and(eq(vehicle_notes.id, id), eq(vehicle_notes.vehicle_id, vehicleId))
	});
}

export async function createNote(userId: string, input: CreateNoteInput): Promise<VehicleNote> {
	const vehicle = await getVehicleById(input.vehicle_id, userId);
	if (!vehicle) throw new Error('Vehicle not found');
	const docRefs = input.doc_refs ?? [];
	const owned = await ownedDocumentIds(docRefs, userId);
	const id = generateId();
	const now = new Date().toISOString();
	await db.insert(vehicle_notes).values({
		id,
		vehicle_id: input.vehicle_id,
		user_id: userId,
		title: input.title ?? null,
		content: input.content,
		doc_refs: docRefs.filter((d) => owned.has(d)),
		created_at: now,
		updated_at: now
	});
	return db.query.vehicle_notes.findFirst({
		where: eq(vehicle_notes.id, id)
	}) as Promise<VehicleNote>;
}

export async function updateNote(
	id: string,
	vehicleId: string,
	userId: string,
	input: UpdateNoteInput
): Promise<void> {
	const vehicle = await getVehicleById(vehicleId, userId);
	if (!vehicle) return;
	const now = new Date().toISOString();
	const patch: Record<string, unknown> = { updated_at: now };
	if ('title' in input) patch.title = input.title ?? null;
	if ('content' in input) patch.content = input.content;
	if (input.doc_refs) {
		const owned = await ownedDocumentIds(input.doc_refs, userId);
		patch.doc_refs = input.doc_refs.filter((d) => owned.has(d));
	}
	await db
		.update(vehicle_notes)
		.set(patch)
		.where(and(eq(vehicle_notes.id, id), eq(vehicle_notes.vehicle_id, vehicleId)));
}

export async function deleteNote(id: string, vehicleId: string, userId: string): Promise<void> {
	const vehicle = await getVehicleById(vehicleId, userId);
	if (!vehicle) return;
	await db
		.delete(vehicle_notes)
		.where(and(eq(vehicle_notes.id, id), eq(vehicle_notes.vehicle_id, vehicleId)));
}
