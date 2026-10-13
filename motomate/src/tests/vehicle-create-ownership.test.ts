import { vi, describe, it, expect, beforeAll, afterAll } from 'vitest';

vi.mock('$lib/db/index.js', async () => {
	const { default: Database } = await import('better-sqlite3');
	const { drizzle } = await import('drizzle-orm/better-sqlite3');
	const { migrate } = await import('drizzle-orm/better-sqlite3/migrator');
	const schema = await import('$lib/db/schema.js');
	const sqlite = new Database(':memory:');
	sqlite.pragma('foreign_keys = ON');
	const db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: 'drizzle' });
	return { db, sqlite };
});

import { db, sqlite } from '$lib/db/index.js';
import { users, vehicles, service_logs, documents, odometer_logs } from '$lib/db/schema.js';
import { createServiceLog } from '$lib/db/repositories/service-logs.js';
import { createDocument } from '$lib/db/repositories/documents.js';
import { createFinanceTransaction } from '$lib/db/repositories/finance-transactions.js';
import { insertOdometerLog } from '$lib/db/repositories/vehicles.js';
import { createTaskTemplate } from '$lib/db/repositories/maintenance.js';

const VEHICLE = 'v_1';

beforeAll(async () => {
	await db.insert(users).values([
		{ id: 'u_owner', email: 'owner@example.com' },
		{ id: 'u_stranger', email: 'stranger@example.com' }
	]);
	await db.insert(vehicles).values({
		id: VEHICLE,
		user_id: 'u_owner',
		name: 'Vespa',
		make: 'Piaggio',
		model: 'GTS',
		year: 2020
	});
});

afterAll(() => sqlite.close());

describe('create functions reject a vehicle the user does not own', () => {
	const attempts: [string, (userId: string) => Promise<unknown>][] = [
		[
			'createServiceLog',
			(u) =>
				createServiceLog(u, {
					vehicle_id: VEHICLE,
					performed_at: '2026-01-01',
					odometer_at_service: 100
				})
		],
		[
			'createDocument',
			(u) =>
				createDocument(u, {
					vehicle_id: VEHICLE,
					name: 'a.pdf',
					doc_type: 'other',
					storage_key: 'files/x/y/z.pdf',
					mime_type: 'application/pdf',
					size_bytes: 1
				})
		],
		[
			'createFinanceTransaction',
			(u) =>
				createFinanceTransaction(u, {
					vehicle_id: VEHICLE,
					category: 'fuel',
					amount_cents: 100,
					currency: 'EUR',
					performed_at: '2026-01-01'
				} as never)
		],
		['insertOdometerLog', (u) => insertOdometerLog(VEHICLE, u, 100)],
		['createTaskTemplate', (u) => createTaskTemplate(u, { vehicle_id: VEHICLE, name: 'Oil' })]
	];

	it.each(attempts)('%s', async (_name, run) => {
		await expect(run('u_stranger')).rejects.toThrow('Vehicle not found');
		expect(db.select().from(service_logs).all()).toHaveLength(0);
		expect(db.select().from(documents).all()).toHaveLength(0);
		expect(db.select().from(odometer_logs).all()).toHaveLength(0);
	});

	it('still accepts the owner', async () => {
		await expect(attempts[3][1]('u_owner')).resolves.toBeUndefined();
	});
});
