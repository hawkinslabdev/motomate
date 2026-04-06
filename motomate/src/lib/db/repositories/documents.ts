import { eq, and, sql } from 'drizzle-orm';
import { db } from '../index.js';
import { documents } from '../schema.js';
import { CreateDocumentSchema } from '../../validators/schemas.js';
import { getVehicleById } from './vehicles.js';
import type { InsertDocument, Document } from '../schema.js';
import { generateId } from '../../utils/id.js';

export async function createDocument(userId: string, input: unknown): Promise<Document> {
	const parsed = CreateDocumentSchema.parse(input);
	const id = generateId();
	const row: InsertDocument = { ...parsed, id, user_id: userId };
	await db.insert(documents).values(row);
	return db.query.documents.findFirst({ where: eq(documents.id, id) }) as Promise<Document>;
}

export async function getDocumentsByVehicle(
	vehicleId: string,
	userId: string,
	limit?: number,
	offset?: number
): Promise<Document[]> {
	const vehicle = await getVehicleById(vehicleId, userId);
	if (!vehicle) return [];
	return db.query.documents.findMany({
		where: eq(documents.vehicle_id, vehicleId),
		orderBy: (d, { desc }) => [desc(d.created_at)],
		limit,
		offset
	});
}

export async function getDocumentsByVehicleTotal(
	vehicleId: string,
	userId: string
): Promise<number> {
	const vehicle = await getVehicleById(vehicleId, userId);
	if (!vehicle) return 0;
	const [{ count }] = await db
		.select({ count: sql<number>`count(*)` })
		.from(documents)
		.where(eq(documents.vehicle_id, vehicleId));
	return count;
}

export async function getDocumentByStorageKey(storageKey: string): Promise<Document | undefined> {
	return db.query.documents.findFirst({
		where: eq(documents.storage_key, storageKey)
	});
}

export async function deleteDocument(id: string, userId: string): Promise<void> {
	await db.delete(documents).where(and(eq(documents.id, id), eq(documents.user_id, userId)));
}

export async function updateDocumentName(id: string, userId: string, name: string): Promise<void> {
	await db
		.update(documents)
		.set({ name: name.slice(0, 200) })
		.where(and(eq(documents.id, id), eq(documents.user_id, userId)));
}
