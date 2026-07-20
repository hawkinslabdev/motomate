import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '$lib/db/schema.js';

let sqlite: InstanceType<typeof Database>;
let db: ReturnType<typeof drizzle<typeof schema>>;

const uploadDocument = vi.fn(async () => 'task-1');
const getTask = vi.fn(async () => ({
	task_id: 'task-1',
	status: 'SUCCESS',
	related_document: 77
}));
const deleteObject = vi.fn(async () => undefined);

vi.mock('$lib/db/index.js', () => ({
	get db() {
		return db;
	}
}));

vi.mock('$lib/db/repositories/documents.js', () => ({
	getDocumentById: async (id: string, userId: string) =>
		sqlite.prepare('SELECT * FROM documents WHERE id = ? AND user_id = ?').get(id, userId)
}));

vi.mock('$lib/db/repositories/paperless-integrations.js', () => ({
	getPaperlessClient: async () => ({ uploadDocument, getTask })
}));

vi.mock('$lib/storage/index.js', () => ({
	getStorage: () => ({
		getBuffer: async () => Buffer.from('document'),
		delete: deleteObject
	})
}));

import {
	enqueueDocumentSync,
	pollProcessingDocumentSyncJobs,
	processNextDocumentSyncJob
} from '$lib/db/repositories/document-sync-jobs.js';

beforeAll(() => {
	sqlite = new Database(':memory:');
	sqlite.exec(`
		CREATE TABLE documents (
			id text PRIMARY KEY,
			user_id text NOT NULL,
			storage_key text,
			name text NOT NULL,
			title text,
			mime_type text NOT NULL,
			created_at text NOT NULL,
			paperless_integration_id text,
			paperless_document_id integer,
			source text NOT NULL DEFAULT 'motomate',
			sync_status text NOT NULL DEFAULT 'none',
			sync_error text,
			last_synced_at text
		);
		CREATE TABLE document_sync_jobs (
			id text PRIMARY KEY,
			document_id text NOT NULL,
			user_id text NOT NULL,
			mode text NOT NULL,
			state text NOT NULL DEFAULT 'queued',
			paperless_task_id text,
			attempt_count integer NOT NULL DEFAULT 0,
			next_attempt_at text,
			last_error text,
			created_at text NOT NULL,
			updated_at text NOT NULL
		);
	`);
	db = drizzle(sqlite, { schema });
});

afterAll(() => sqlite.close());

beforeEach(() => {
	sqlite.exec('DELETE FROM document_sync_jobs; DELETE FROM documents;');
	sqlite
		.prepare(
			'INSERT INTO documents (id, user_id, storage_key, name, title, mime_type, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
		)
		.run('d1', 'u1', 'files/u1/d1.pdf', 'receipt.pdf', 'Receipt', 'application/pdf', '2026-01-01');
	uploadDocument.mockClear();
	getTask.mockClear();
	deleteObject.mockClear();
});

describe('document sync jobs', () => {
	it('moves local content only after Paperless reports successful processing', async () => {
		const queued = await enqueueDocumentSync('d1', 'u1', 'p1', 'move');
		expect(queued.state).toBe('queued');
		expect(
			sqlite.prepare('SELECT source, sync_status FROM documents WHERE id = ?').get('d1')
		).toEqual({ source: 'pending_paperless', sync_status: 'queued' });

		const processing = await processNextDocumentSyncJob();
		expect(processing?.state).toBe('processing');
		expect(uploadDocument).toHaveBeenCalledOnce();
		expect(deleteObject).not.toHaveBeenCalled();

		await expect(pollProcessingDocumentSyncJobs()).resolves.toBe(1);
		expect(
			sqlite
				.prepare(
					'SELECT source, storage_key, paperless_document_id, sync_status FROM documents WHERE id = ?'
				)
				.get('d1')
		).toEqual({
			source: 'paperless',
			storage_key: null,
			paperless_document_id: 77,
			sync_status: 'synced'
		});
		expect(deleteObject).toHaveBeenCalledWith('files/u1/d1.pdf');
		expect(sqlite.prepare('SELECT state FROM document_sync_jobs').get()).toEqual({
			state: 'complete'
		});
	});
});
