import { vi, describe, it, expect, beforeAll, afterAll } from 'vitest';

// Real SQLite built from the shipped migrations; only object storage is faked
vi.mock('#lib/db/index.js', async () => {
	const { default: Database } = await import('better-sqlite3');
	const { drizzle } = await import('drizzle-orm/better-sqlite3');
	const { migrate } = await import('drizzle-orm/better-sqlite3/migrator');
	const schema = await import('#lib/db/schema.js');
	const sqlite = new Database(':memory:');
	sqlite.pragma('foreign_keys = ON');
	const db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: 'drizzle' });
	return { db, sqlite };
});
vi.mock('#lib/server/integrations.js', () => ({
	onDocumentCreated: vi.fn(),
	mirrorPut: vi.fn(),
	mirrorDelete: vi.fn()
}));
vi.mock('#lib/storage/index.js', () => ({ getStorage: vi.fn() }));

import { eq } from 'drizzle-orm';
import { db, sqlite } from '#lib/db/index.js';
import { users, vehicles, documents } from '#lib/db/schema.js';
import { getStorage } from '#lib/storage/index.js';
import { actions } from '../routes/(app)/vehicles/[id]/documents/+page.server.js';

const OWNER = 'u_owner';
const STRANGER = 'u_stranger';
const VEHICLE = 'v_1';
const VICTIM_KEY = 'files/u_owner/secret.pdf';

const del = vi.fn();

function event(fd: FormData, userId: string) {
	return {
		request: { formData: async () => fd },
		locals: { user: { id: userId } },
		params: { id: VEHICLE }
	} as never;
}

beforeAll(async () => {
	vi.mocked(getStorage).mockReturnValue({ delete: del } as never);
	await db.insert(users).values([
		{ id: OWNER, email: 'owner@example.com' },
		{ id: STRANGER, email: 'stranger@example.com' }
	]);
	await db.insert(vehicles).values({
		id: VEHICLE,
		user_id: OWNER,
		name: 'Vespa',
		make: 'Piaggio',
		model: 'GTS',
		year: 2020
	});
	await db.insert(documents).values({
		id: 'doc_owner',
		user_id: OWNER,
		vehicle_id: VEHICLE,
		name: 'secret.pdf',
		doc_type: 'other',
		storage_key: VICTIM_KEY,
		mime_type: 'application/pdf',
		size_bytes: 10
	});
});

afterAll(() => sqlite.close());

describe('document delete ownership', () => {
	it('ignores a storage_key supplied by the caller', async () => {
		del.mockClear();
		const fd = new FormData();
		fd.append('id', 'doc_owner');
		fd.append('storage_key', 'files/u_other/someone-elses.pdf');

		await actions.delete!(event(fd, OWNER));

		expect(del).toHaveBeenCalledWith(VICTIM_KEY);
		expect(del).not.toHaveBeenCalledWith('files/u_other/someone-elses.pdf');
	});

	it('does not delete another user’s file', async () => {
		del.mockClear();
		await db.insert(documents).values({
			id: 'doc_victim',
			user_id: OWNER,
			vehicle_id: VEHICLE,
			name: 'victim.pdf',
			doc_type: 'other',
			storage_key: VICTIM_KEY,
			mime_type: 'application/pdf',
			size_bytes: 10
		});

		const fd = new FormData();
		fd.append('id', 'doc_victim');
		fd.append('storage_key', VICTIM_KEY);

		const result = await actions.delete!(event(fd, STRANGER));

		expect((result as { status?: number }).status).toBe(404);
		expect(del).not.toHaveBeenCalled();
		expect(
			await db.query.documents.findFirst({ where: eq(documents.id, 'doc_victim') })
		).toBeTruthy();
	});
});
