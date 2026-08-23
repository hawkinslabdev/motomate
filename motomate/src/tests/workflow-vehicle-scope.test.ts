import { vi, describe, it, expect, afterAll } from 'vitest';

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
import { users, vehicles, workflow_rules, notifications } from '$lib/db/schema.js';
import { runWorkflowChecks } from '$lib/workflow/engine.js';
import { generateId } from '$lib/utils/id.js';
import type { RuleTrigger } from '$lib/db/schema.js';

const staleCreatedAt = new Date(Date.now() - 30 * 86_400_000).toISOString();

function vehicleRow(userId: string, id: string, name: string, archived: boolean) {
	return {
		id,
		user_id: userId,
		name,
		make: 'Honda',
		model: 'CB',
		year: 2020,
		archived_at: archived ? new Date().toISOString() : null,
		created_at: staleCreatedAt,
		updated_at: staleCreatedAt
	};
}

function ruleRow(userId: string, overrides: Partial<typeof workflow_rules.$inferInsert>) {
	return {
		id: generateId(),
		user_id: userId,
		name: 'settings.workflows.presets.odometerNudge',
		trigger: { type: 'no_odometer_update', days: 1 } satisfies RuleTrigger,
		actions: { title: 'Reminder', body: 'Update the odometer' },
		enabled: true,
		...overrides
	};
}

async function notifiedVehicleIds(userId: string): Promise<Set<string | null>> {
	const rows = await db.query.notifications.findMany({ where: eq(notifications.user_id, userId) });
	return new Set(rows.map((r) => r.vehicle_id));
}

afterAll(() => sqlite.close());

describe('rule vehicle scoping', () => {
	it('never fires for an archived vehicle', async () => {
		const user = 'u_archived_case';
		await db.insert(users).values({ id: user, email: `${user}@example.com` });
		const included = vehicleRow(user, 'v_arch_included', 'Included', false);
		const archived = vehicleRow(user, 'v_arch_archived', 'Archived', true);
		await db.insert(vehicles).values([included, archived]);
		await db.insert(workflow_rules).values(ruleRow(user, {}));

		await runWorkflowChecks(user);

		const fired = await notifiedVehicleIds(user);
		expect(fired.has(included.id)).toBe(true);
		expect(fired.has(archived.id)).toBe(false);
	});

	it('skips a vehicle explicitly excluded from the rule, opt-out style', async () => {
		const user = 'u_excluded_case';
		await db.insert(users).values({ id: user, email: `${user}@example.com` });
		const kept = vehicleRow(user, 'v_excl_kept', 'Kept', false);
		const excluded = vehicleRow(user, 'v_excl_excluded', 'Excluded', false);
		await db.insert(vehicles).values([kept, excluded]);
		await db.insert(workflow_rules).values(ruleRow(user, { excluded_vehicle_ids: [excluded.id] }));

		await runWorkflowChecks(user);

		const fired = await notifiedVehicleIds(user);
		expect(fired.has(kept.id)).toBe(true);
		expect(fired.has(excluded.id)).toBe(false);
	});

	it('defaults excluded_vehicle_ids to an empty list for rules created before the migration', async () => {
		const user = 'u_legacy_case';
		await db.insert(users).values({ id: user, email: `${user}@example.com` });
		await db.insert(workflow_rules).values(ruleRow(user, { id: 'rule_legacy' }));

		const row = await db.query.workflow_rules.findFirst({
			where: eq(workflow_rules.id, 'rule_legacy')
		});
		expect(row?.excluded_vehicle_ids).toEqual([]);
	});

	it('opt-out wins even when the excluded vehicle is the rule’s single scoped vehicle', async () => {
		const user = 'u_solo_case';
		await db.insert(users).values({ id: user, email: `${user}@example.com` });
		const solo = vehicleRow(user, 'v_solo_excluded', 'Solo', false);
		await db.insert(vehicles).values(solo);
		await db
			.insert(workflow_rules)
			.values(ruleRow(user, { vehicle_id: solo.id, excluded_vehicle_ids: [solo.id] }));

		await runWorkflowChecks(user);

		const fired = await notifiedVehicleIds(user);
		expect(fired.has(solo.id)).toBe(false);
	});
});
