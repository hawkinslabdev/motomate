import { vi, describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

// Real SQLite from the shipped migrations; storage, integrations and the workflow engine are faked
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
vi.mock('#lib/server/integrations.js', () => ({
	onDocumentCreated: vi.fn(),
	onDocumentRenamed: vi.fn(),
	mirrorPut: vi.fn(),
	mirrorDelete: vi.fn()
}));
vi.mock('#lib/storage/index.js', () => ({
	getStorage: () => ({
		put: vi.fn(),
		delete: vi.fn(),
		getBuffer: vi.fn(async () => Buffer.from('OWNER_SECRET'))
	})
}));
vi.mock('#lib/workflow/engine.js', () => ({
	runWorkflowChecks: vi.fn(async () => ({ evaluated: 0, fired: 0 }))
}));

import { db, sqlite } from '#lib/db/index.js';
import {
	users,
	vehicles,
	service_logs,
	odometer_logs,
	finance_transactions,
	vehicle_notes,
	documents,
	travels,
	notifications,
	push_subscriptions
} from '#lib/db/schema.js';
import {
	createTaskTemplate,
	createTracker,
	recomputeTrackerStatuses
} from '#lib/db/repositories/maintenance.js';
import { createApiKey } from '#lib/db/repositories/api-keys.js';
import { seedPresetRulesForUser } from '#lib/db/repositories/workflow.js';

const OWNER = 'uowner';
const STRANGER = 'ustranger';
const V = 'vowner';
const SV = 'vstranger';
const SECRET = 'OWNER_SECRET';

const ids = {
	vehicle: V,
	tracker: '',
	template: '',
	log: 'logowner',
	odo: 'odoowner',
	tx: 'txowner',
	note: 'noteowner',
	doc: 'docowner',
	travel: 'travelowner',
	rule: '',
	key: '',
	notification: 'notifowner'
};
const DOC_KEY = `files/${OWNER}/${V}/docowner.pdf`;

const v1 = import.meta.glob('../routes/api/v1/**/+server.ts');
const appActions = import.meta.glob('../routes/**/+page.server.ts');

function vehicleRow(id: string, userId: string, name: string) {
	return {
		id,
		user_id: userId,
		name,
		make: 'Honda',
		model: 'CB',
		year: 2020,
		current_odometer: 1490
	};
}

// Every table, minus rows the stranger owns: the stranger may write their own data, never the owner's
function ownerSnapshot() {
	const tables = sqlite
		.prepare(
			"select name from sqlite_master where type='table' and name not like '\\_\\_%' escape '\\' and name not like 'sqlite_%'"
		)
		.all() as { name: string }[];
	return Object.fromEntries(
		tables.map(({ name }) => [
			name,
			(sqlite.prepare(`select * from "${name}"`).all() as Record<string, unknown>[]).filter(
				(r) => r.user_id !== STRANGER && r.vehicle_id !== SV && r.id !== STRANGER
			)
		])
	);
}

function strangerRows() {
	const tables = sqlite
		.prepare("select name from sqlite_master where type='table' and name not like 'sqlite_%'")
		.all() as { name: string }[];
	return Object.fromEntries(
		tables.map(({ name }) => [
			name,
			(sqlite.prepare(`select * from "${name}"`).all() as Record<string, unknown>[]).filter(
				(r) => r.user_id === STRANGER || r.vehicle_id === SV
			)
		])
	);
}

function stranger() {
	return {
		id: STRANGER,
		email: 'stranger@example.com',
		settings: { currency: 'EUR', locale: 'en' }
	} as never;
}

function form() {
	const fd = new FormData();
	const fields: Record<string, string> = {
		performed_at: '2026-01-01',
		recorded_at: '2026-01-01',
		date: '2026-01-01',
		start_date: '2026-01-01',
		duration_days: '1',
		odometer: '99999',
		odometer_at_service: '99999',
		amount: '10',
		cost: '10',
		category: 'parts',
		title: 'x',
		name: 'x',
		content: 'x',
		remark: 'x',
		notes: 'x',
		enabled: 'false',
		day_index: '0',
		target_unit: 'mi',
		tracker_id: ids.tracker,
		key_id: ids.key,
		vehicle_id: V,
		linked_doc_id: ids.doc,
		doc_refs: ids.doc,
		doc_id: ids.doc,
		reset_trackers: ids.tracker,
		additional_tracker_ids: ids.tracker,
		gpx_existing_doc_0: ids.doc,
		remove_gpx_slot_0: ids.doc,
		storage_key: DOC_KEY,
		excluded_vehicle_ids: JSON.stringify([V]),
		trigger: JSON.stringify({ type: 'tracker_overdue' }),
		hidden_tabs: 'finance'
	};
	for (const [k, v] of Object.entries(fields)) fd.append(k, v);
	return fd;
}

async function settle(fn: () => unknown): Promise<string> {
	try {
		const out = await fn();
		if (out instanceof Response) return `${out.status} ${await out.text()}`;
		return JSON.stringify(out ?? null);
	} catch (e) {
		return `threw ${(e as { status?: number }).status ?? ''} ${String((e as Error).message ?? e)}`;
	}
}

beforeAll(async () => {
	vi.spyOn(console, 'error').mockImplementation(() => {});
	await db.insert(users).values([
		{ id: OWNER, email: 'owner@example.com' },
		{ id: STRANGER, email: 'stranger@example.com' }
	]);
	await db
		.insert(vehicles)
		.values([vehicleRow(V, OWNER, SECRET), vehicleRow(SV, STRANGER, 'Mine')]);
	const tmpl = await createTaskTemplate(OWNER, { vehicle_id: V, name: SECRET, interval_km: 500 });
	ids.template = tmpl.id;
	ids.tracker = (await createTracker(V, tmpl.id, 1000)).id;
	await db.insert(service_logs).values({
		id: ids.log,
		vehicle_id: V,
		tracker_id: ids.tracker,
		performed_at: '2025-06-01',
		odometer_at_service: 800,
		notes: SECRET,
		currency: 'EUR'
	});
	await db.insert(odometer_logs).values({
		id: ids.odo,
		vehicle_id: V,
		user_id: OWNER,
		odometer: 1490,
		remark: SECRET,
		recorded_at: '2025-07-01'
	});
	await db.insert(finance_transactions).values({
		id: ids.tx,
		vehicle_id: V,
		user_id: OWNER,
		category: 'parts',
		amount_cents: 1234,
		currency: 'EUR',
		performed_at: '2025-06-01',
		notes: SECRET
	});
	await db.insert(vehicle_notes).values({
		id: ids.note,
		vehicle_id: V,
		user_id: OWNER,
		content: SECRET
	});
	await db.insert(documents).values({
		id: ids.doc,
		vehicle_id: V,
		user_id: OWNER,
		name: SECRET + '.pdf',
		doc_type: 'other',
		storage_key: DOC_KEY,
		mime_type: 'application/pdf',
		size_bytes: 10
	});
	await db.insert(travels).values({
		id: ids.travel,
		vehicle_id: V,
		user_id: OWNER,
		start_date: '2025-05-01',
		duration_days: 1,
		title: SECRET,
		currency: 'EUR',
		gpx_document_ids: [ids.doc]
	});
	await db.insert(notifications).values({
		id: ids.notification,
		user_id: OWNER,
		vehicle_id: V,
		type: 'info',
		title: SECRET,
		body: SECRET
	});
	await db.insert(push_subscriptions).values({
		id: 'pushowner',
		user_id: OWNER,
		endpoint: 'https://push.example.com/owner',
		keys: { p256dh: 'x', auth: 'x' }
	});
	await seedPresetRulesForUser(OWNER);
	ids.rule = (await db.query.workflow_rules.findFirst())!.id;
	ids.key = (await createApiKey(OWNER, SECRET, 'read_write')).record.id;
	await recomputeTrackerStatuses(V, 1490);
});

afterAll(() => sqlite.close());

describe('route coverage', () => {
	it('guards the vehicle in every exported handler under /api/v1/vehicles/[id]', () => {
		const root = 'src/routes/api/v1/vehicles/[id]';
		const walk = (dir: string): string[] =>
			readdirSync(dir).flatMap((f) => {
				const p = join(dir, f);
				return statSync(p).isDirectory() ? walk(p) : f === '+server.ts' ? [p] : [];
			});
		for (const file of walk(root)) {
			const src = readFileSync(file, 'utf8');
			const handlers = src.match(/^export const (GET|POST|PATCH|PUT|DELETE)\b/gm) ?? [];
			const guards = src.match(/guardVehicle\(params\.id!, locals\.user!\.id\)/g) ?? [];
			expect(guards.length, file).toBe(handlers.length);
		}
	});
});

describe('a stranger acting on the owner’s data', () => {
	let before: ReturnType<typeof ownerSnapshot>;
	const results: [string, string][] = [];

	beforeAll(async () => {
		before = ownerSnapshot();
		const childIds = Object.values(ids);

		for (const [path, load] of Object.entries(v1)) {
			const mod = (await load()) as Record<string, (e: unknown) => unknown>;
			for (const method of ['GET', 'POST', 'PATCH', 'DELETE'] as const) {
				if (!mod[method]) continue;
				for (const vehicleId of [V, SV]) {
					const params = {
						id: vehicleId,
						logId: ids.log,
						noteId: ids.note,
						transactionId: ids.tx
					};
					const body = {
						performed_at: '2026-01-01',
						odometer_at_service: 99999,
						odometer: 99999,
						recorded_at: '2026-01-01',
						amount_cents: 100,
						category: 'parts',
						content: 'x',
						tracker_ids: [ids.tracker]
					};
					results.push([
						`${method} ${path} ${vehicleId}`,
						await settle(() =>
							mod[method]({
								locals: { user: stranger(), session: null, apiKeyScope: 'read_write' },
								params,
								url: new URL('http://localhost/?limit=200'),
								request: new Request('http://localhost', {
									method: method === 'GET' ? 'GET' : 'POST',
									body: method === 'GET' ? undefined : JSON.stringify(body),
									headers: { 'Content-Type': 'application/json' }
								})
							})
						)
					]);
				}
			}
		}

		for (const [path, load] of Object.entries(appActions)) {
			const mod = (await load()) as { actions?: Record<string, (e: unknown) => unknown> };
			for (const [name, action] of Object.entries(mod.actions ?? {})) {
				for (const vehicleId of [V, SV]) {
					for (const id of childIds) {
						await db
							.insert(vehicles)
							.values(vehicleRow(SV, STRANGER, 'Mine'))
							.onConflictDoNothing();
						const fd = form();
						fd.append('id', id);
						results.push([
							`${path} ?/${name} ${vehicleId} id=${id}`,
							await settle(() =>
								action({
									request: new Request('http://localhost', { method: 'POST', body: fd }),
									locals: { user: stranger() },
									params: { id: vehicleId },
									url: new URL('http://localhost/'),
									cookies: { get: () => undefined, set: () => {}, delete: () => {} }
								})
							)
						]);
					}
				}
			}
		}
	}, 60_000);

	it('leaves every owner row untouched', () => {
		expect(ownerSnapshot()).toEqual(before);
	});

	it('never links owner records into the stranger’s own rows', () => {
		const ownerIds = Object.values(ids).filter((id) => id !== V);
		const links = Object.values(strangerRows())
			.flat()
			.map((r) => JSON.stringify(r))
			.filter((row) => ownerIds.some((id) => row.includes(id)));
		expect(links).toEqual([]);
	});

	it('never returns owner content', () => {
		const leaks = results.filter(([, out]) => out.includes(SECRET)).map(([call]) => call);
		expect(leaks).toEqual([]);
	});

	it('answers 404 on every v1 vehicle route for the owner’s vehicle', () => {
		const vehicleRoutes = results.filter(([call]) =>
			/^\w+ .*\/vehicles\/\[id\].* vowner$/.test(call)
		);
		expect(vehicleRoutes.length).toBeGreaterThan(0);
		for (const [call, out] of vehicleRoutes) expect(out.slice(0, 3), call).toBe('404');
	});
});

describe('stranger reads outside /vehicles/[id]', () => {
	it('lists only their own vehicles', async () => {
		const { GET } = await import('../routes/api/v1/vehicles/+server.js');
		const out = await settle(() =>
			GET({ locals: { user: stranger() }, url: new URL('http://localhost/') } as never)
		);
		expect(out).not.toContain(SECRET);
	});

	it('cannot fetch the owner’s document file', async () => {
		const { GET } = await import('../routes/api/files/+server.js');
		const out = await settle(() =>
			GET({
				url: new URL(`http://localhost/api/files?key=${encodeURIComponent(DOC_KEY)}`),
				locals: { user: stranger() },
				request: new Request('http://localhost')
			} as never)
		);
		expect(out).toMatch(/^threw 403/);
	});

	it('cannot render the owner’s maintenance report', async () => {
		const { GET } = await import('../routes/api/vehicles/[id]/report/+server.js');
		const out = await settle(() =>
			GET({
				locals: { user: stranger() },
				params: { id: V },
				url: new URL('http://localhost/'),
				request: new Request('http://localhost')
			} as never)
		);
		expect(out).toMatch(/^threw 404/);
	});

	it('exports none of the owner’s data', async () => {
		const { GET } = await import('../routes/api/export/+server.js');
		const out = await settle(() =>
			GET({ locals: { user: stranger() }, url: new URL('http://localhost/') } as never)
		);
		expect(out).not.toContain(SECRET);
		expect(out).not.toContain(V + '"');
	});

	it('cannot mark, unsubscribe or load the owner’s notifications', async () => {
		const notif = await import('../routes/api/notifications/+server.js');
		const push = await import('../routes/api/push/subscribe/+server.js');
		const before = ownerSnapshot();
		const listed = await settle(() =>
			notif.GET({
				locals: { user: stranger() },
				url: new URL('http://localhost/?limit=10')
			} as never)
		);
		await notif.POST({
			locals: { user: stranger() },
			request: new Request('http://localhost', {
				method: 'POST',
				body: JSON.stringify({ id: ids.notification })
			})
		} as never);
		await push.DELETE({
			locals: { user: stranger() },
			request: new Request('http://localhost', {
				method: 'DELETE',
				body: JSON.stringify({ endpoint: 'https://push.example.com/owner' })
			})
		} as never);
		expect(listed).not.toContain(SECRET);
		expect(ownerSnapshot()).toEqual(before);
	});

	it('cannot open the owner’s vehicle layout', async () => {
		const { load } = await import('../routes/(app)/vehicles/[id]/+layout.server.js');
		const out = await settle(() =>
			load({ params: { id: V }, locals: { user: stranger() } } as never)
		);
		expect(out).toMatch(/^threw 404/);
	});
});
