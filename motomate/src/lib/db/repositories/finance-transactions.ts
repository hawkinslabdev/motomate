import { eq, and } from 'drizzle-orm';
import { db } from '../index.js';
import { finance_transactions } from '../schema.js';
import { getVehicleById } from './vehicles.js';
import type { InsertFinanceTransaction, FinanceTransaction } from '../schema.js';
import { generateId } from '../../utils/id.js';

export async function createFinanceTransaction(
	userId: string,
	input: Omit<InsertFinanceTransaction, 'id' | 'user_id' | 'created_at' | 'updated_at'>
): Promise<FinanceTransaction> {
	const id = generateId();
	const now = new Date().toISOString();
	const row: InsertFinanceTransaction = {
		...input,
		id,
		user_id: userId,
		created_at: now,
		updated_at: now
	};

	await db.insert(finance_transactions).values(row);

	return db.query.finance_transactions.findFirst({
		where: eq(finance_transactions.id, id)
	}) as Promise<FinanceTransaction>;
}

export async function getFinanceTransactionsByVehicle(
	vehicleId: string,
	userId: string
): Promise<FinanceTransaction[]> {
	const vehicle = await getVehicleById(vehicleId, userId);
	if (!vehicle) return [];
	return db.query.finance_transactions.findMany({
		where: eq(finance_transactions.vehicle_id, vehicleId),
		orderBy: (t, { desc }) => [desc(t.performed_at), desc(t.created_at)]
	});
}

export async function getFinanceTransactionById(
	id: string
): Promise<FinanceTransaction | undefined> {
	return db.query.finance_transactions.findFirst({
		where: eq(finance_transactions.id, id)
	});
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
	await db
		.update(finance_transactions)
		.set({ ...data, updated_at: now })
		.where(and(eq(finance_transactions.id, id), eq(finance_transactions.vehicle_id, vehicleId)));
}

export async function deleteFinanceTransaction(
	id: string,
	vehicleId: string,
	userId: string
): Promise<void> {
	const vehicle = await getVehicleById(vehicleId, userId);
	if (!vehicle) return;
	await db
		.delete(finance_transactions)
		.where(and(eq(finance_transactions.id, id), eq(finance_transactions.vehicle_id, vehicleId)));
}
