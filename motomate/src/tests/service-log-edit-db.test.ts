import { vi, describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';

// Real SQLite built from the shipped migrations; only object storage is faked
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
vi.mock('$lib/server/integrations.js', () => ({
	onDocumentCreated: vi.fn(),
	mirrorPut: vi.fn(),
	mirrorDelete: vi.fn()
}));
vi.mock('$lib/storage/index.js', () => ({ getStorage: vi.fn() }));
vi.mock('$lib/workflow/engine.js', () => ({
	runWorkflowChecks: vi.fn().mockResolvedValue(undefined)
}));

import { eq } from 'drizzle-orm';
import { db, sqlite } from '$lib/db/index.js';
import {
	users,
	vehicles,
	documents,
	service_logs,
	task_templates,
	active_trackers
} from '$lib/db/schema.js';
import { getStorage } from '$lib/storage/index.js';
import { actions as timelineActions } from '../routes/(app)/vehicles/[id]/+page.server.js';
import { actions as maintenanceActions } from '../routes/(app)/vehicles/[id]/maintenance/+page.server.js';

const OWNER = 'u_owner';
const STRANGER = 'u_stranger';
const VEHICLE = 'v_1';
const LOG = 'sl_1';
const TRACKER_OIL = 'tr_oil';
const TRACKER_CHAIN = 'tr_chain';

const put = vi.fn();

function event(fd: FormData, userId = OWNER) {
	return {
		request: { formData: async () => fd },
		locals: { user: { id: userId, settings: { currency: 'EUR' } } },
		params: { id: VEHICLE }
	} as never;
}

function editForm(extra: [string, string | File][] = []) {
	const fd = new FormData();
	fd.append('id', LOG);
	fd.append('performed_at', '2026-08-01');
	fd.append('odometer_at_service', '14000');
	fd.append('notes', 'Oil and filter');
	fd.append('remark', 'Dealer');
	fd.append('cost', '129.50');
	for (const [k, v] of extra) fd.append(k, v);
	return fd;
}

function storedLog() {
	return db.query.service_logs.findFirst({ where: eq(service_logs.id, LOG) });
}

beforeAll(async () => {
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
		year: 2020,
		current_odometer: 15000
	});
	await db.insert(documents).values(
		['doc_a', 'doc_b', 'doc_c'].map((id) => ({
			id,
			user_id: OWNER,
			vehicle_id: VEHICLE,
			name: id + '.pdf',
			doc_type: 'other' as const,
			storage_key: 'k/' + id,
			mime_type: 'application/pdf',
			size_bytes: 10
		}))
	);
	await db.insert(task_templates).values([
		{ id: 'tpl_oil', user_id: OWNER, name: 'Oil change', interval_km: 5000 },
		{ id: 'tpl_chain', user_id: OWNER, name: 'Chain', interval_km: 1000 }
	]);
	await db.insert(active_trackers).values([
		{ id: TRACKER_OIL, vehicle_id: VEHICLE, template_id: 'tpl_oil', status: 'ok' },
		{ id: TRACKER_CHAIN, vehicle_id: VEHICLE, template_id: 'tpl_chain', status: 'ok' }
	]);
});

beforeEach(async () => {
	vi.clearAllMocks();
	vi.mocked(getStorage).mockReturnValue({ put } as never);
	await db.delete(service_logs);
	await db.insert(service_logs).values({
		id: LOG,
		vehicle_id: VEHICLE,
		tracker_id: TRACKER_OIL,
		performed_at: '2026-01-05',
		odometer_at_service: 12000,
		cost_cents: 5000,
		currency: 'EUR',
		notes: 'Original',
		attachments: ['doc_a', 'doc_b']
	});
});

afterAll(() => sqlite.close());

describe('editServiceLog from the maintenance history', () => {
	it('writes the edited fields and keeps the resubmitted attachments', async () => {
		await maintenanceActions.editServiceLog(
			event(
				editForm([
					['reset_trackers', TRACKER_OIL],
					['linked_doc_id', 'doc_a'],
					['linked_doc_id', 'doc_b']
				])
			)
		);

		const log = await storedLog();
		expect(log).toMatchObject({
			performed_at: '2026-08-01',
			odometer_at_service: 14000,
			cost_cents: 12950,
			notes: 'Oil and filter',
			remark: 'Dealer'
		});
		expect(log!.attachments).toEqual(['doc_a', 'doc_b']);
	});

	it('resets the trackers the form checked', async () => {
		await maintenanceActions.editServiceLog(
			event(
				editForm([
					['reset_trackers', TRACKER_OIL],
					['reset_trackers', TRACKER_CHAIN]
				])
			)
		);

		expect((await storedLog())!.serviced_tracker_ids).toEqual([TRACKER_OIL, TRACKER_CHAIN]);
		const trackers = await db.query.active_trackers.findMany();
		for (const tracker of trackers) {
			expect(tracker.last_done_at).toBe('2026-08-01');
			expect(tracker.last_done_odometer).toBe(14000);
		}
	});

	it('drops an attachment the user removed and adds one they linked', async () => {
		await maintenanceActions.editServiceLog(
			event(
				editForm([
					['linked_doc_id', 'doc_b'],
					['linked_doc_id', 'doc_c']
				])
			)
		);

		expect((await storedLog())!.attachments).toEqual(['doc_b', 'doc_c']);
	});

	it('stores an uploaded file as a document and attaches it first', async () => {
		await maintenanceActions.editServiceLog(
			event(
				editForm([
					['attachment_file', new File(['invoice'], 'invoice.pdf', { type: 'application/pdf' })],
					['attachment_type', 'service'],
					['linked_doc_id', 'doc_a']
				])
			)
		);

		const attachments = (await storedLog())!.attachments as string[];
		expect(attachments).toHaveLength(2);
		expect(attachments[1]).toBe('doc_a');
		expect(put).toHaveBeenCalledOnce();

		const uploaded = await db.query.documents.findFirst({
			where: eq(documents.id, attachments[0])
		});
		expect(uploaded).toMatchObject({ name: 'invoice.pdf', doc_type: 'service' });
	});

	it('rejects an invalid date without writing anything', async () => {
		const fd = editForm();
		fd.set('performed_at', '01-08-2026');
		const result = await maintenanceActions.editServiceLog(event(fd));

		expect((result as { status: number }).status).toBe(400);
		expect(await storedLog()).toMatchObject({ performed_at: '2026-01-05', cost_cents: 5000 });
	});

	it('leaves the log untouched for a user who does not own the vehicle', async () => {
		const result = await maintenanceActions.editServiceLog(event(editForm(), STRANGER));

		expect((result as { status: number }).status).toBe(404);
		expect(await storedLog()).toMatchObject({ performed_at: '2026-01-05', notes: 'Original' });
	});
});

describe('editServiceLog from the vehicle timeline', () => {
	it('applies the same edit as the maintenance page', async () => {
		await timelineActions.editServiceLog(
			event(
				editForm([
					['reset_trackers', TRACKER_CHAIN],
					['linked_doc_id', 'doc_c']
				])
			)
		);

		const log = await storedLog();
		expect(log).toMatchObject({ performed_at: '2026-08-01', cost_cents: 12950 });
		expect(log!.serviced_tracker_ids).toEqual([TRACKER_CHAIN]);
		expect(log!.attachments).toEqual(['doc_c']);
	});

	it('warns when the odometer goes below the highest reading', async () => {
		const fd = editForm();
		fd.set('odometer_at_service', '100');
		const result = (await timelineActions.editServiceLog(event(fd))) as { warning?: string };

		expect(result.warning).toContain('lower than the highest recorded reading');
	});
});

describe('trackers follow the newest service log, not the edited one', () => {
	const NEWER = 'sl_newer';

	beforeEach(async () => {
		await db.insert(service_logs).values({
			id: NEWER,
			vehicle_id: VEHICLE,
			serviced_tracker_ids: [TRACKER_CHAIN],
			performed_at: '2026-09-09',
			odometer_at_service: 18010,
			currency: 'EUR'
		});
	});

	it('keeps the tracker on the newer log when an older log is edited', async () => {
		await maintenanceActions.editServiceLog(
			event(editForm([['reset_trackers', TRACKER_CHAIN]]))
		);

		const chain = await db.query.active_trackers.findFirst({
			where: eq(active_trackers.id, TRACKER_CHAIN)
		});
		expect(chain).toMatchObject({
			last_done_at: '2026-09-09',
			last_done_odometer: 18010,
			next_due_odometer: 19010
		});
	});

	it('falls back to the older log once the newer one is deleted', async () => {
		await db.delete(service_logs).where(eq(service_logs.id, LOG));
		await db.insert(service_logs).values({
			id: LOG,
			vehicle_id: VEHICLE,
			serviced_tracker_ids: [TRACKER_CHAIN],
			performed_at: '2026-01-05',
			odometer_at_service: 12000,
			currency: 'EUR'
		});
		const { deleteServiceLog } = await import('$lib/db/repositories/service-logs.js');
		await deleteServiceLog(NEWER, VEHICLE, OWNER);

		const chain = await db.query.active_trackers.findFirst({
			where: eq(active_trackers.id, TRACKER_CHAIN)
		});
		expect(chain).toMatchObject({
			last_done_at: '2026-01-05',
			last_done_odometer: 12000,
			next_due_odometer: 13000
		});
	});
});
