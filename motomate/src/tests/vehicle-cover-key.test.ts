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
vi.mock('$lib/server/integrations.js', () => ({ mirrorPut: vi.fn(), mirrorDelete: vi.fn() }));
vi.mock('$lib/storage/index.js', () => ({ getStorage: vi.fn() }));

import { eq } from 'drizzle-orm';
import { db, sqlite } from '$lib/db/index.js';
import { users, vehicles } from '$lib/db/schema.js';
import { actions } from '../routes/(app)/vehicles/[id]/edit/+page.server.js';

const OWN_KEY = 'avatars/u_attacker/v_1.png';
const VICTIM_KEY = 'avatars/u_victim/v_9.png';

beforeAll(async () => {
	await db.insert(users).values([
		{ id: 'u_attacker', email: 'a@example.com' },
		{ id: 'u_victim', email: 'v@example.com' }
	]);
	await db.insert(vehicles).values({
		id: 'v_1',
		user_id: 'u_attacker',
		name: 'Vespa',
		make: 'Piaggio',
		model: 'GTS',
		year: 2020,
		cover_image_key: OWN_KEY
	});
});

afterAll(() => sqlite.close());

describe('vehicle update action', () => {
	it('ignores a submitted cover_image_key', async () => {
		const fd = new FormData();
		fd.set('name', 'Renamed');
		fd.set('year', '2021');
		fd.set('cover_image_key', VICTIM_KEY);
		await actions.update!({
			request: { formData: async () => fd },
			locals: { user: { id: 'u_attacker', settings: {} } },
			params: { id: 'v_1' }
		} as never);
		const row = db.select().from(vehicles).where(eq(vehicles.id, 'v_1')).get();
		expect(row?.name).toBe('Renamed');
		expect(row?.cover_image_key).toBe(OWN_KEY);
	});
});
