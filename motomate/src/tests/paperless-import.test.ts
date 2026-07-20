import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '$lib/db/schema.js';

let sqlite: InstanceType<typeof Database>;
let db: ReturnType<typeof drizzle<typeof schema>>;

const getDocument = vi.fn(async () => ({
	id: 42,
	title: 'Service receipt',
	created: '2026-07-20',
	original_file_name: 'receipt.pdf',
	mime_type: 'application/pdf'
}));
const getDocumentDownloadMetadata = vi.fn(async () => ({
	contentType: 'application/pdf',
	sizeBytes: 455972
}));
const downloadDocument = vi.fn(async () => ({
	data: Buffer.from('paperless document'),
	contentType: 'application/pdf'
}));
const putObject = vi.fn(async () => undefined);
const deleteObject = vi.fn(async () => undefined);

vi.mock('$lib/db/index.js', () => ({
	get db() {
		return db;
	}
}));

vi.mock('$lib/db/repositories/vehicles.js', () => ({
	getVehicleById: async (vehicleId: string, userId: string) =>
		vehicleId === 'v1' && userId === 'u1' ? { id: 'v1' } : undefined
}));

vi.mock('$lib/db/repositories/paperless-integrations.js', () => ({
	getPaperlessClient: async () => ({
		getDocument,
		getDocumentDownloadMetadata,
		downloadDocument
	})
}));

vi.mock('$lib/storage/index.js', () => ({
	getStorage: () => ({ put: putObject, delete: deleteObject }),
	storageKey: (prefix: string, id: string, filename: string) =>
		`${prefix}/${id}.${filename.split('.').pop()}`
}));

import { importPaperlessDocumentReference } from '$lib/db/repositories/documents.js';

beforeAll(() => {
	sqlite = new Database(':memory:');
	sqlite.exec(`
		CREATE TABLE documents (
			id text PRIMARY KEY,
			vehicle_id text NOT NULL,
			user_id text NOT NULL,
			name text NOT NULL,
			title text,
			doc_type text NOT NULL DEFAULT 'service',
			source text NOT NULL DEFAULT 'motomate',
			storage_key text,
			mime_type text NOT NULL,
			size_bytes integer NOT NULL,
			paperless_integration_id text,
			paperless_document_id integer,
			sync_status text NOT NULL DEFAULT 'none',
			sync_error text,
			last_synced_at text,
			expires_at text,
			created_at text NOT NULL DEFAULT (datetime('now'))
		);
	`);
	db = drizzle(sqlite, { schema });
});

afterAll(() => sqlite.close());

beforeEach(() => {
	sqlite.exec('DELETE FROM documents;');
	getDocument.mockClear();
	getDocumentDownloadMetadata.mockClear();
	downloadDocument.mockClear();
	putObject.mockClear();
	deleteObject.mockClear();
});

describe('Paperless document import', () => {
	it('stores a link with size metadata from the download HEAD response', async () => {
		const document = await importPaperlessDocumentReference('u1', 'v1', 'p1', 42, 'link');

		expect(document).toMatchObject({
			source: 'paperless',
			storage_key: null,
			mime_type: 'application/pdf',
			size_bytes: 455972,
			paperless_document_id: 42,
			sync_status: 'synced'
		});
		expect(getDocumentDownloadMetadata).toHaveBeenCalledWith(42);
		expect(downloadDocument).not.toHaveBeenCalled();
		expect(putObject).not.toHaveBeenCalled();
	});

	it('can retain a local MotoMate copy of a Paperless document', async () => {
		const document = await importPaperlessDocumentReference('u1', 'v1', 'p1', 42, 'copy');

		expect(document).toMatchObject({
			source: 'motomate',
			storage_key: expect.stringMatching(/^files\/u1\/.+\.pdf$/),
			size_bytes: Buffer.byteLength('paperless document'),
			paperless_document_id: 42,
			sync_status: 'synced'
		});
		expect(downloadDocument).toHaveBeenCalledWith(42);
		expect(putObject).toHaveBeenCalledOnce();
		expect(getDocumentDownloadMetadata).not.toHaveBeenCalled();
	});

	it('backfills the size of an existing link', async () => {
		sqlite
			.prepare(
				'INSERT INTO documents (id, vehicle_id, user_id, name, source, storage_key, mime_type, size_bytes, paperless_integration_id, paperless_document_id, sync_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
			)
			.run(
				'd1',
				'v1',
				'u1',
				'receipt.pdf',
				'paperless',
				null,
				'application/pdf',
				0,
				'p1',
				42,
				'synced'
			);

		const document = await importPaperlessDocumentReference('u1', 'v1', 'p1', 42, 'link');

		expect(document.size_bytes).toBe(455972);
		expect(getDocument).not.toHaveBeenCalled();
		expect(getDocumentDownloadMetadata).toHaveBeenCalledWith(42);
	});
});
