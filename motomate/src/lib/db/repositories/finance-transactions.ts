import { eq, and } from 'drizzle-orm';
import { db } from '../index.js';
import { finance_transactions } from '../schema.js';
import { getVehicleById } from './vehicles.js';
import type { InsertFinanceTransaction, FinanceTransaction } from '../schema.js';
import { generateId } from '../../utils/id.js';
import {
	deleteDocumentLinksForTarget,
	getDocumentIdsForTarget,
	getDocumentIdsForTargets,
	replaceDocumentLinks,
	validateDocumentIds
} from './document-links.js';

function hydrateFinanceTransaction(
	transaction: FinanceTransaction,
	attachments: string[] = []
): FinanceTransaction {
	return {
		...transaction,
		attachments,
		odometer_at_transaction:
			transaction.measurement_at_transaction ?? transaction.odometer_at_transaction
	};
}

export async function createFinanceTransaction(
	userId: string,
	input: Omit<InsertFinanceTransaction, 'id' | 'user_id' | 'created_at' | 'updated_at'>
): Promise<FinanceTransaction> {
	const vehicle = await getVehicleById(input.vehicle_id, userId);
	await validateDocumentIds(userId, input.vehicle_id, input.attachments ?? []);
	const id = generateId();
	const now = new Date().toISOString();
	const row: InsertFinanceTransaction = {
		...input,
		id,
		user_id: userId,
		attachments: [],
		measurement_at_transaction: input.odometer_at_transaction,
		measurement_unit:
			input.odometer_at_transaction != null ? (vehicle?.odometer_unit ?? null) : null,
		created_at: now,
		updated_at: now
	};

	await db.insert(finance_transactions).values(row);
	await replaceDocumentLinks({
		userId,
		vehicleId: input.vehicle_id,
		targetType: 'finance_transaction',
		targetId: id,
		documentIds: input.attachments ?? []
	});

	const created = (await db.query.finance_transactions.findFirst({
		where: eq(finance_transactions.id, id)
	})) as FinanceTransaction;
	return hydrateFinanceTransaction(created, input.attachments ?? []);
}

export async function getFinanceTransactionsByVehicle(
	vehicleId: string,
	userId: string
): Promise<FinanceTransaction[]> {
	const vehicle = await getVehicleById(vehicleId, userId);
	if (!vehicle) return [];
	const rows = await db.query.finance_transactions.findMany({
		where: eq(finance_transactions.vehicle_id, vehicleId),
		orderBy: (t, { desc }) => [desc(t.performed_at), desc(t.created_at)]
	});
	const attachmentIds = await getDocumentIdsForTargets(
		'finance_transaction',
		rows.map((row) => row.id)
	);
	return rows.map((row) => hydrateFinanceTransaction(row, attachmentIds.get(row.id) ?? []));
}

export async function getFinanceTransactionById(
	id: string,
	vehicleId: string,
	userId: string
): Promise<FinanceTransaction | undefined> {
	const vehicle = await getVehicleById(vehicleId, userId);
	if (!vehicle) return undefined;
	const transaction = await db.query.finance_transactions.findFirst({
		where: and(eq(finance_transactions.id, id), eq(finance_transactions.vehicle_id, vehicleId))
	});
	if (!transaction) return undefined;
	const attachmentIds = await getDocumentIdsForTarget('finance_transaction', id, vehicleId);
	return hydrateFinanceTransaction(transaction, attachmentIds);
}

export async function updateFinanceTransaction(
	id: string,
	vehicleId: string,
	userId: string,
	data: {
		category?: 'other' | 'maintenance' | 'parts' | 'accessories' | 'administrative' | 'fuel';
		amount_cents?: number;
		notes?: string | null;
		performed_at?: string;
		odometer_at_transaction?: number | null;
	}
): Promise<void> {
	const vehicle = await getVehicleById(vehicleId, userId);
	if (!vehicle) return;
	const now = new Date().toISOString();
	const patch: Partial<InsertFinanceTransaction> = { ...data, updated_at: now };
	if (data.odometer_at_transaction !== undefined) {
		patch.measurement_at_transaction = data.odometer_at_transaction;
		patch.measurement_unit = data.odometer_at_transaction != null ? vehicle.odometer_unit : null;
	}
	await db
		.update(finance_transactions)
		.set(patch)
		.where(and(eq(finance_transactions.id, id), eq(finance_transactions.vehicle_id, vehicleId)));
}

export async function updateFinanceTransactionAttachments(
	id: string,
	vehicleId: string,
	userId: string,
	documentIds: string[]
): Promise<void> {
	const vehicle = await getVehicleById(vehicleId, userId);
	if (!vehicle) return;
	await replaceDocumentLinks({
		userId,
		vehicleId,
		targetType: 'finance_transaction',
		targetId: id,
		documentIds
	});
	await db
		.update(finance_transactions)
		.set({ updated_at: new Date().toISOString() })
		.where(and(eq(finance_transactions.id, id), eq(finance_transactions.vehicle_id, vehicleId)));
}

export async function deleteFinanceTransaction(
	id: string,
	vehicleId: string,
	userId: string
): Promise<void> {
	const vehicle = await getVehicleById(vehicleId, userId);
	if (!vehicle) return;
	await deleteDocumentLinksForTarget('finance_transaction', id, vehicleId);
	await db
		.delete(finance_transactions)
		.where(and(eq(finance_transactions.id, id), eq(finance_transactions.vehicle_id, vehicleId)));
}
