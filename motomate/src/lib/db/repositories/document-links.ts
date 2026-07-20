import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../index.js';
import { document_links, documents, finance_transactions, service_logs } from '../schema.js';
import type { DocumentLinkRelation, DocumentLinkTargetType } from '../schema.js';
import { generateId } from '../../utils/id.js';
import { getVehicleById } from './vehicles.js';

type ReplaceDocumentLinksInput = {
	userId: string;
	vehicleId: string;
	targetType: DocumentLinkTargetType;
	targetId: string;
	documentIds: string[];
	relation?: DocumentLinkRelation;
};

export async function getDocumentIdsForTarget(
	targetType: DocumentLinkTargetType,
	targetId: string,
	vehicleId: string,
	relation: DocumentLinkRelation = 'attachment'
): Promise<string[]> {
	const rows = await db
		.select({ documentId: document_links.document_id })
		.from(document_links)
		.where(
			and(
				eq(document_links.target_type, targetType),
				eq(document_links.target_id, targetId),
				eq(document_links.vehicle_id, vehicleId),
				eq(document_links.relation, relation)
			)
		)
		.orderBy(document_links.created_at);
	return rows.map((row) => row.documentId);
}

export async function getDocumentIdsForTargets(
	targetType: DocumentLinkTargetType,
	targetIds: string[],
	relation: DocumentLinkRelation = 'attachment'
): Promise<Map<string, string[]>> {
	const result = new Map<string, string[]>();
	if (targetIds.length === 0) return result;

	const rows = await db
		.select({ targetId: document_links.target_id, documentId: document_links.document_id })
		.from(document_links)
		.where(
			and(
				eq(document_links.target_type, targetType),
				inArray(document_links.target_id, targetIds),
				eq(document_links.relation, relation)
			)
		)
		.orderBy(document_links.created_at);

	for (const row of rows) {
		const ids = result.get(row.targetId) ?? [];
		ids.push(row.documentId);
		result.set(row.targetId, ids);
	}
	return result;
}

export async function deleteDocumentLinksForTarget(
	targetType: DocumentLinkTargetType,
	targetId: string,
	vehicleId: string
): Promise<void> {
	await db
		.delete(document_links)
		.where(
			and(
				eq(document_links.target_type, targetType),
				eq(document_links.target_id, targetId),
				eq(document_links.vehicle_id, vehicleId)
			)
		);
}

export async function replaceDocumentLinks({
	userId,
	vehicleId,
	targetType,
	targetId,
	documentIds,
	relation = 'attachment'
}: ReplaceDocumentLinksInput): Promise<void> {
	const vehicle = await getVehicleById(vehicleId, userId);
	if (!vehicle) throw new Error('Vehicle not found');
	await assertLinkTargetExists(targetType, targetId, vehicleId);
	const uniqueDocumentIds = await validateDocumentIds(userId, vehicleId, documentIds);

	db.transaction((tx) => {
		tx.delete(document_links)
			.where(
				and(
					eq(document_links.target_type, targetType),
					eq(document_links.target_id, targetId),
					eq(document_links.vehicle_id, vehicleId),
					eq(document_links.relation, relation)
				)
			)
			.run();

		if (uniqueDocumentIds.length > 0) {
			tx.insert(document_links)
				.values(
					uniqueDocumentIds.map((documentId) => ({
						id: generateId(),
						vehicle_id: vehicleId,
						document_id: documentId,
						target_type: targetType,
						target_id: targetId,
						relation
					}))
				)
				.run();
		}
	});
}

export async function validateDocumentIds(
	userId: string,
	vehicleId: string,
	documentIds: string[]
): Promise<string[]> {
	const uniqueDocumentIds = [...new Set(documentIds)];
	if (uniqueDocumentIds.length > 0) {
		const ownedDocuments = await db
			.select({ id: documents.id })
			.from(documents)
			.where(
				and(
					inArray(documents.id, uniqueDocumentIds),
					eq(documents.user_id, userId),
					eq(documents.vehicle_id, vehicleId)
				)
			);
		if (ownedDocuments.length !== uniqueDocumentIds.length) {
			throw new Error('One or more documents do not belong to this vehicle');
		}
	}
	return uniqueDocumentIds;
}

async function assertLinkTargetExists(
	targetType: DocumentLinkTargetType,
	targetId: string,
	vehicleId: string
): Promise<void> {
	if (targetType === 'vehicle') {
		if (targetId !== vehicleId) throw new Error('Document link target does not belong to vehicle');
		return;
	}

	const target =
		targetType === 'service_log'
			? await db
					.select({ id: service_logs.id })
					.from(service_logs)
					.where(and(eq(service_logs.id, targetId), eq(service_logs.vehicle_id, vehicleId)))
					.limit(1)
			: await db
					.select({ id: finance_transactions.id })
					.from(finance_transactions)
					.where(
						and(
							eq(finance_transactions.id, targetId),
							eq(finance_transactions.vehicle_id, vehicleId)
						)
					)
					.limit(1);
	if (target.length === 0) throw new Error('Document link target not found');
}
