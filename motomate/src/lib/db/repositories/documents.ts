import { eq, and, sql, inArray, or, like } from 'drizzle-orm';
import { db } from '../index.js';
import { documents } from '../schema.js';
import { CreateDocumentSchema } from '../../validators/schemas.js';
import { getVehicleById } from './vehicles.js';
import type { InsertDocument, Document } from '../schema.js';
import { generateId } from '../../utils/id.js';
import { getPaperlessClient } from './paperless-integrations.js';
import { getStorage, storageKey } from '../../storage/index.js';

export type PaperlessImportMode = 'link' | 'copy';

export async function createDocument(userId: string, input: unknown): Promise<Document> {
	const parsed = CreateDocumentSchema.parse(input);
	const id = generateId();
	const row: InsertDocument = { ...parsed, id, user_id: userId };
	await db.insert(documents).values(row);
	return db.query.documents.findFirst({ where: eq(documents.id, id) }) as Promise<Document>;
}

export async function importPaperlessDocumentReference(
	userId: string,
	vehicleId: string,
	integrationId: string,
	paperlessDocumentId: number,
	mode: PaperlessImportMode = 'link'
): Promise<Document> {
	const vehicle = await getVehicleById(vehicleId, userId);
	if (!vehicle) throw new Error('Vehicle not found');

	const existing = await db.query.documents.findFirst({
		where: and(
			eq(documents.paperless_integration_id, integrationId),
			eq(documents.paperless_document_id, paperlessDocumentId),
			eq(documents.vehicle_id, vehicleId),
			eq(documents.user_id, userId)
		)
	});
	const client = await getPaperlessClient(integrationId, userId);
	if (existing) {
		if (mode === 'copy' && !existing.storage_key) {
			const downloaded = await client.downloadDocument(paperlessDocumentId);
			const key = storageKey(`files/${userId}`, existing.id, existing.name);
			await getStorage().put(key, downloaded.data, downloaded.contentType ?? existing.mime_type);
			try {
				await db
					.update(documents)
					.set({
						source: 'motomate',
						storage_key: key,
						mime_type: downloaded.contentType ?? existing.mime_type,
						size_bytes: downloaded.data.length,
						last_synced_at: new Date().toISOString()
					})
					.where(and(eq(documents.id, existing.id), eq(documents.user_id, userId)));
			} catch (cause) {
				await getStorage()
					.delete(key)
					.catch(() => {});
				throw cause;
			}
		} else if (existing.size_bytes === 0) {
			const metadata = await client.getDocumentDownloadMetadata(paperlessDocumentId);
			await db
				.update(documents)
				.set({
					mime_type: metadata.contentType ?? existing.mime_type,
					size_bytes: metadata.sizeBytes ?? existing.size_bytes
				})
				.where(and(eq(documents.id, existing.id), eq(documents.user_id, userId)));
		}
		return db.query.documents.findFirst({
			where: eq(documents.id, existing.id)
		}) as Promise<Document>;
	}

	const remote = await client.getDocument(paperlessDocumentId);
	const id = generateId();
	const filename =
		remote.original_file_name ??
		remote.archived_file_name ??
		`${remote.title || `document-${remote.id}`}.pdf`;
	const downloaded = mode === 'copy' ? await client.downloadDocument(paperlessDocumentId) : null;
	const metadata = downloaded
		? null
		: await client.getDocumentDownloadMetadata(paperlessDocumentId);
	const key = downloaded ? storageKey(`files/${userId}`, id, filename) : null;
	const mimeType =
		downloaded?.contentType ??
		metadata?.contentType ??
		remote.mime_type ??
		'application/octet-stream';
	const sizeBytes =
		downloaded?.data.length ?? metadata?.sizeBytes ?? remote.original_file_size ?? 0;
	if (downloaded && key) await getStorage().put(key, downloaded.data, mimeType);
	try {
		await db.insert(documents).values({
			id,
			vehicle_id: vehicleId,
			user_id: userId,
			name: filename,
			title: remote.title || null,
			doc_type: 'other',
			source: downloaded ? 'motomate' : 'paperless',
			storage_key: key,
			mime_type: mimeType,
			size_bytes: sizeBytes,
			paperless_integration_id: integrationId,
			paperless_document_id: remote.id,
			sync_status: 'synced',
			last_synced_at: new Date().toISOString()
		});
	} catch (cause) {
		if (key)
			await getStorage()
				.delete(key)
				.catch(() => {});
		throw cause;
	}
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

export async function getDocumentById(id: string, userId: string): Promise<Document | undefined> {
	return db.query.documents.findFirst({
		where: and(eq(documents.id, id), eq(documents.user_id, userId))
	});
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
