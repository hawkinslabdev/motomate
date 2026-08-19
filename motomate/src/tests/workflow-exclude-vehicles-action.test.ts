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

import { eq } from 'drizzle-orm';
import { db, sqlite } from '$lib/db/index.js';
import { users, workflow_rules } from '$lib/db/schema.js';
import { actions } from '../routes/(app)/settings/workflows/+page.server.js';

const OWNER = 'u_owner';
const STRANGER = 'u_stranger';
const RULE = 'rule_1';

function event(fd: FormData, userId: string) {
	return {
		request: { formData: async () => fd },
		locals: { user: { id: userId } }
	} as never;
}

beforeAll(async () => {
	await db.insert(users).values([
		{ id: OWNER, email: 'owner@example.com' },
		{ id: STRANGER, email: 'stranger@example.com' }
	]);
	await db.insert(workflow_rules).values({
		id: RULE,
		user_id: OWNER,
		name: 'A rule',
		trigger: { type: 'no_odometer_update', days: 7 },
		actions: { title: 'Reminder', body: 'Body' }
	});
});

afterAll(() => sqlite.close());

describe('setExcludedVehicles action', () => {
	it('stores the excluded vehicle ids for the owner', async () => {
		const fd = new FormData();
		fd.append('id', RULE);
		fd.append('excluded_vehicle_ids', JSON.stringify(['v1', 'v2']));

		await actions.setExcludedVehicles!(event(fd, OWNER));

		const row = await db.query.workflow_rules.findFirst({ where: eq(workflow_rules.id, RULE) });
		expect(row?.excluded_vehicle_ids).toEqual(['v1', 'v2']);
	});

	it('does not let another user modify the rule', async () => {
		const fd = new FormData();
		fd.append('id', RULE);
		fd.append('excluded_vehicle_ids', JSON.stringify(['v3']));

		await actions.setExcludedVehicles!(event(fd, STRANGER));

		const row = await db.query.workflow_rules.findFirst({ where: eq(workflow_rules.id, RULE) });
		expect(row?.excluded_vehicle_ids).toEqual(['v1', 'v2']);
	});

	it('rejects malformed vehicle selections', async () => {
		const fd = new FormData();
		fd.append('id', RULE);
		fd.append('excluded_vehicle_ids', 'not-json');

		const result = await actions.setExcludedVehicles!(event(fd, OWNER));

		expect((result as { status?: number }).status).toBe(400);
	});
});
