import { vi, describe, it, expect, beforeEach, afterAll } from 'vitest';

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
vi.mock('$app/env', () => ({ dev: false, building: false }));
vi.mock('$app/env/private', () => new Proxy({ AUTH_SECRET: 'x'.repeat(32) }, { has: () => true }));
vi.mock(
	'$app/env/public',
	() => new Proxy({ PUBLIC_DEMO_ENABLED: 'false', PUBLIC_APP_URL: '' }, { has: () => true })
);

const dispatch = vi.hoisted(() => ({ calls: 0, during: null as null | (() => Promise<void>) }));
vi.mock('#lib/workflow/channels/inapp.js', () => ({
	dispatchInApp: async () => {
		dispatch.calls++;
		await new Promise((r) => setTimeout(r, 20));
		await dispatch.during?.();
	}
}));

import { eq } from 'drizzle-orm';
import { db, sqlite } from '#lib/db/index.js';
import {
	users,
	vehicles,
	task_templates,
	active_trackers,
	workflow_rules
} from '#lib/db/schema.js';
import { runWorkflowChecks } from '#lib/workflow/engine.js';

const U = 'u1';
const T = 't1';

async function notifiedBy() {
	const t = await db.query.active_trackers.findFirst({ where: eq(active_trackers.id, T) });
	return (t!.state as { notified_by?: Record<string, string> }).notified_by ?? {};
}

beforeEach(async () => {
	sqlite.exec('delete from workflow_rules; delete from vehicles; delete from users;');
	dispatch.calls = 0;
	dispatch.during = null;
	await db.insert(users).values({ id: U, email: 'u@example.com' });
	await db.insert(vehicles).values({
		id: 'v1',
		user_id: U,
		name: 'Bike',
		make: 'Honda',
		model: 'CB',
		year: 2020,
		current_odometer: 2000,
		current_measurement: 2000
	});
	await db.insert(task_templates).values({
		id: 'tmpl1',
		user_id: U,
		vehicle_id: 'v1',
		name: 'Oil',
		category: 'oil',
		interval_km: 1000,
		interval_measurement: 1000,
		interval_unit: 'km'
	});
	await db.insert(active_trackers).values({
		id: T,
		vehicle_id: 'v1',
		template_id: 'tmpl1',
		last_done_odometer: 0,
		last_done_measurement: 0,
		next_due_odometer: 1000,
		next_due_measurement: 1000,
		measurement_unit: 'km'
	});
	await db.insert(workflow_rules).values({
		id: 'r1',
		user_id: U,
		name: 'Overdue',
		trigger: { type: 'odometer_overdue', km_past: 0 },
		actions: { title: 'Overdue', body: 'Overdue' }
	});
});

afterAll(() => sqlite.close());

describe('workflow notifications', () => {
	it('notifies once when two runs overlap', async () => {
		await Promise.all([runWorkflowChecks(U), runWorkflowChecks(U)]);
		expect(dispatch.calls).toBe(1);
		expect(await notifiedBy()).toEqual({ r1: 'overdue' });
	});

	it('skips the notified flag write after a service log during dispatch', async () => {
		dispatch.during = async () => {
			await db
				.update(active_trackers)
				.set({ status: 'ok', state: { notified_by: {} }, updated_at: new Date().toISOString() })
				.where(eq(active_trackers.id, T));
		};
		await runWorkflowChecks(U);
		expect(dispatch.calls).toBe(1);
		expect(await notifiedBy()).toEqual({});
	});
});
