import { eq, and, sql, inArray, or, like } from 'drizzle-orm';
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

type DocFilterOptions = {
	limit?: number;
	offset?: number;
	search?: string;
	docType?: string;
	sortBy?: 'newest' | 'oldest' | 'name';
};

function buildDocWhere(vehicleId: string, search?: string, docType?: string) {
	const clauses = [eq(documents.vehicle_id, vehicleId)];
	if (search) {
		const s = `%${search}%`;
		const clause = or(like(documents.name, s), like(documents.title, s));
		if (clause) clauses.push(clause);
	}
	if (docType && docType !== 'all')
		clauses.push(eq(documents.doc_type, docType as Document['doc_type']));
	return and(...clauses);
}

export async function getDocumentsByVehicle(
	vehicleId: string,
	userId: string,
	options: DocFilterOptions = {}
): Promise<Document[]> {
	const vehicle = await getVehicleById(vehicleId, userId);
	if (!vehicle) return [];
	const { limit, offset, search, docType, sortBy = 'newest' } = options;
	return db.query.documents.findMany({
		where: buildDocWhere(vehicleId, search, docType),
		orderBy: (d, { desc, asc }) => {
			if (sortBy === 'oldest') return [asc(d.created_at)];
			if (sortBy === 'name') return [asc(d.name)];
			return [desc(d.created_at)];
		},
		limit,
		offset
	});
}

export async function getDocumentsByVehicleTotal(
	vehicleId: string,
	userId: string,
	options: { search?: string; docType?: string } = {}
): Promise<number> {
	const vehicle = await getVehicleById(vehicleId, userId);
	if (!vehicle) return 0;
	const { search, docType } = options;
	const [{ count }] = await db
		.select({ count: sql<number>`count(*)` })
		.from(documents)
		.where(buildDocWhere(vehicleId, search, docType));
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

export async function getDocumentsByIds(ids: string[], userId: string): Promise<Document[]> {
	if (ids.length === 0) return [];
	return db.query.documents.findMany({
		where: and(inArray(documents.id, ids), eq(documents.user_id, userId))
	}) as Promise<Document[]>;
}

export async function getRouteDocumentsByVehicle(
	vehicleId: string,
	userId: string
): Promise<Document[]> {
	const vehicle = await getVehicleById(vehicleId, userId);
	if (!vehicle) return [];
	return db.query.documents.findMany({
		where: and(eq(documents.vehicle_id, vehicleId), eq(documents.doc_type, 'route')),
		orderBy: (d, { desc }) => [desc(d.created_at)]
	});
}
