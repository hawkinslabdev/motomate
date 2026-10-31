import { vi, describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';

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
import { users, vehicles, documents, finance_transactions } from '#lib/db/schema.js';
import { getStorage } from '#lib/storage/index.js';
import { actions } from '../routes/(app)/vehicles/[id]/finance/+page.server.js';

const OWNER = 'u_owner';
const STRANGER = 'u_stranger';
const VEHICLE = 'v_1';
const TX = 'ft_1';

const put = vi.fn();

function event(fd: FormData, userId = OWNER, vehicleId = VEHICLE) {
	return {
		request: { formData: async () => fd },
		locals: { user: { id: userId, settings: { currency: 'EUR' } } },
		params: { id: vehicleId }
	} as never;
}

function editForm(extra: [string, string | File][] = []) {
	const fd = new FormData();
	fd.append('id', TX);
	fd.append('category', 'parts');
	fd.append('amount', '25.50');
	fd.append('date', '2026-08-01');
	fd.append('notes', 'Chain kit');
	for (const [k, v] of extra) fd.append(k, v);
	return fd;
}

function storedTx() {
	return db.query.finance_transactions.findFirst({ where: eq(finance_transactions.id, TX) });
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
		year: 2020
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
});

beforeEach(async () => {
	vi.clearAllMocks();
	vi.mocked(getStorage).mockReturnValue({ put } as never);
	await db.delete(finance_transactions);
	await db.insert(finance_transactions).values({
		id: TX,
		vehicle_id: VEHICLE,
		user_id: OWNER,
		category: 'maintenance',
		amount_cents: 5000,
		currency: 'EUR',
		notes: 'Original',
		performed_at: '2026-01-05',
		attachments: ['doc_a', 'doc_b']
	});
});

afterAll(() => sqlite.close());

describe('editTransaction against the database', () => {
	it('writes the edited fields and keeps the attachments the form resubmits', async () => {
		await actions.editTransaction(
			event(
				editForm([
					['linked_doc_id', 'doc_a'],
					['linked_doc_id', 'doc_b']
				])
			)
		);

		const tx = await storedTx();
		expect(tx).toMatchObject({
			category: 'parts',
			amount_cents: 2550,
			performed_at: '2026-08-01',
			notes: 'Chain kit'
		});
		expect(tx!.attachments).toEqual(['doc_a', 'doc_b']);
	});

	it('drops an attachment the user removed and adds one they linked', async () => {
		await actions.editTransaction(
			event(
				editForm([
					['linked_doc_id', 'doc_b'],
					['linked_doc_id', 'doc_c']
				])
			)
		);

		expect((await storedTx())!.attachments).toEqual(['doc_b', 'doc_c']);
	});

	it('stores an uploaded file as a document and attaches it first', async () => {
		await actions.editTransaction(
			event(
				editForm([
					['attachment_file', new File(['receipt'], 'receipt.pdf', { type: 'application/pdf' })],
					['attachment_type', 'quotation'],
					['linked_doc_id', 'doc_a']
				])
			)
		);

		const attachments = (await storedTx())!.attachments as string[];
		expect(attachments).toHaveLength(2);
		expect(attachments[1]).toBe('doc_a');
		expect(put).toHaveBeenCalledOnce();

		const uploaded = await db.query.documents.findFirst({
			where: eq(documents.id, attachments[0])
		});
		expect(uploaded).toMatchObject({
			vehicle_id: VEHICLE,
			name: 'receipt.pdf',
			doc_type: 'quotation',
			mime_type: 'application/pdf'
		});
	});

	it('leaves the transaction untouched for a user who does not own the vehicle', async () => {
		await actions.editTransaction(event(editForm([['linked_doc_id', 'doc_c']]), STRANGER));

		const tx = await storedTx();
		expect(tx).toMatchObject({ category: 'maintenance', amount_cents: 5000 });
		expect(tx!.attachments).toEqual(['doc_a', 'doc_b']);
	});

	it('rejects an invalid amount without writing anything', async () => {
		const fd = editForm();
		fd.set('amount', '0');
		const result = await actions.editTransaction(event(fd));

		expect((result as { status: number }).status).toBe(400);
		const tx = await storedTx();
		expect(tx).toMatchObject({ category: 'maintenance', amount_cents: 5000 });
		expect(tx!.attachments).toEqual(['doc_a', 'doc_b']);
	});
});

describe('addTransaction against the database', () => {
	it('creates a transaction carrying its linked attachments', async () => {
		const fd = new FormData();
		fd.append('category', 'fuel');
		fd.append('amount', '19.99');
		fd.append('date', '2026-08-02');
		fd.append('linked_doc_id', 'doc_c');

		await actions.addTransaction(event(fd));

		const created = await db.query.finance_transactions.findMany({
			where: eq(finance_transactions.performed_at, '2026-08-02')
		});
		expect(created).toHaveLength(1);
		expect(created[0]).toMatchObject({ category: 'fuel', amount_cents: 1999 });
		expect(created[0].attachments).toEqual(['doc_c']);
	});
});
