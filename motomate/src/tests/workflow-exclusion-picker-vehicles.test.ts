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
import { users, vehicles } from '$lib/db/schema.js';
import { load } from '../routes/(app)/settings/workflows/+page.server.js';

const USER = 'u_picker';

function event() {
	return { locals: { user: { id: USER } } } as never;
}

beforeAll(async () => {
	await db.insert(users).values({ id: USER, email: 'picker@example.com' });
	await db.insert(vehicles).values([
		{ id: 'v_zebra', user_id: USER, name: 'Zebra', make: 'Honda', model: 'CB', year: 2020 },
		{
			id: 'v_archived_apple',
			user_id: USER,
			name: 'Apple',
			make: 'Honda',
			model: 'CB',
			year: 2019,
			archived_at: new Date().toISOString()
		},
		{ id: 'v_mango', user_id: USER, name: 'Mango', make: 'Honda', model: 'CB', year: 2021 }
	]);
});

afterAll(() => sqlite.close());

describe('workflows page vehicle picker data', () => {
	it('excludes archived vehicles, since they never notify regardless of exclusion settings', async () => {
		const result = (await load(event())) as { vehicles: { id: string }[] };
		expect(result.vehicles.map((v) => v.id)).not.toContain('v_archived_apple');
	});

	it('sorts the picker list ascending by name', async () => {
		const result = (await load(event())) as { vehicles: { name: string }[] };
		expect(result.vehicles.map((v) => v.name)).toEqual(['Mango', 'Zebra']);
	});
});
