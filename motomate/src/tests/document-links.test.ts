import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '$lib/db/schema.js';

let sqlite: InstanceType<typeof Database>;
let db: ReturnType<typeof drizzle<typeof schema>>;

vi.mock('$lib/db/index.js', () => ({
	get db() {
		return db;
	}
}));

vi.mock('$lib/db/repositories/vehicles.js', () => ({
	getVehicleById: async (vehicleId: string, userId: string) =>
		vehicleId === 'v1' && userId === 'u1' ? { id: 'v1' } : undefined
}));

import {
	getDocumentIdsForTarget,
	replaceDocumentLinks
} from '$lib/db/repositories/document-links.js';

beforeAll(() => {
	sqlite = new Database(':memory:');
	sqlite.exec(`
		CREATE TABLE documents (id text PRIMARY KEY, vehicle_id text NOT NULL, user_id text NOT NULL);
		CREATE TABLE service_logs (id text PRIMARY KEY, vehicle_id text NOT NULL);
		CREATE TABLE finance_transactions (id text PRIMARY KEY, vehicle_id text NOT NULL);
		CREATE TABLE document_links (
			id text PRIMARY KEY,
			vehicle_id text NOT NULL,
			document_id text NOT NULL,
			target_type text NOT NULL,
			target_id text NOT NULL,
			relation text DEFAULT 'attachment' NOT NULL,
			created_at text DEFAULT (datetime('now')) NOT NULL
		);
	`);
	db = drizzle(sqlite, { schema });
});

afterAll(() => sqlite.close());

beforeEach(() => {
	sqlite.exec('DELETE FROM document_links; DELETE FROM documents; DELETE FROM service_logs;');
	sqlite.prepare('INSERT INTO service_logs (id, vehicle_id) VALUES (?, ?)').run('s1', 'v1');
	sqlite
		.prepare('INSERT INTO documents (id, vehicle_id, user_id) VALUES (?, ?, ?)')
		.run('d1', 'v1', 'u1');
	sqlite
		.prepare('INSERT INTO documents (id, vehicle_id, user_id) VALUES (?, ?, ?)')
		.run('d2', 'v1', 'u1');
});

describe('document links', () => {
	it('replaces and de-duplicates attachments for an event', async () => {
		await replaceDocumentLinks({
			userId: 'u1',
			vehicleId: 'v1',
			targetType: 'service_log',
			targetId: 's1',
			documentIds: ['d1', 'd1', 'd2']
		});
		expect(await getDocumentIdsForTarget('service_log', 's1', 'v1')).toEqual(['d1', 'd2']);

		await replaceDocumentLinks({
			userId: 'u1',
			vehicleId: 'v1',
			targetType: 'service_log',
			targetId: 's1',
			documentIds: ['d2']
		});
		expect(await getDocumentIdsForTarget('service_log', 's1', 'v1')).toEqual(['d2']);
	});

	it('rejects a document owned by another user', async () => {
		sqlite
			.prepare('INSERT INTO documents (id, vehicle_id, user_id) VALUES (?, ?, ?)')
			.run('foreign', 'v1', 'u2');
		await expect(
			replaceDocumentLinks({
				userId: 'u1',
				vehicleId: 'v1',
				targetType: 'service_log',
				targetId: 's1',
				documentIds: ['foreign']
			})
		).rejects.toThrow('do not belong to this vehicle');
	});

	it('rejects a nonexistent polymorphic target', async () => {
		await expect(
			replaceDocumentLinks({
				userId: 'u1',
				vehicleId: 'v1',
				targetType: 'service_log',
				targetId: 'missing',
				documentIds: ['d1']
			})
		).rejects.toThrow('target not found');
	});
});
