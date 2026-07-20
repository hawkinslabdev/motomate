import { and, asc, eq, inArray, isNull, lte, or } from 'drizzle-orm';
import { db } from '../index.js';
import { documents, document_sync_jobs } from '../schema.js';
import type { DocumentSyncJob } from '../schema.js';
import { generateId } from '../../utils/id.js';
import { getDocumentById } from './documents.js';
import { getPaperlessClient } from './paperless-integrations.js';
import { thumbnailCacheKey } from '$lib/documents/thumbnail.js';
import { getStorage } from '../../storage/index.js';

export type DocumentSyncMode = 'mirror' | 'move';

export async function enqueueDocumentSync(
	documentId: string,
	userId: string,
	integrationId: string,
	mode: DocumentSyncMode
): Promise<DocumentSyncJob> {
	const document = await getDocumentById(documentId, userId);
	if (!document?.storage_key) throw new Error('Only locally stored documents can be synchronized');
	await getPaperlessClient(integrationId, userId);

	const active = await db.query.document_sync_jobs.findFirst({
		where: and(
			eq(document_sync_jobs.document_id, documentId),
			inArray(document_sync_jobs.state, ['queued', 'uploading', 'processing'])
		)
	});
	if (active) return active;

	const id = generateId();
	const now = new Date().toISOString();
	db.transaction((tx) => {
		tx.update(documents)
			.set({
				paperless_integration_id: integrationId,
				source: 'pending_paperless',
				sync_status: 'queued',
				sync_error: null
			})
			.where(and(eq(documents.id, documentId), eq(documents.user_id, userId)))
			.run();
		tx.insert(document_sync_jobs)
			.values({
				id,
				document_id: documentId,
				user_id: userId,
				mode,
				state: 'queued',
				created_at: now,
				updated_at: now
			})
			.run();
	});
	return db.query.document_sync_jobs.findFirst({
		where: eq(document_sync_jobs.id, id)
	}) as Promise<DocumentSyncJob>;
}

export async function processNextDocumentSyncJob(): Promise<DocumentSyncJob | undefined> {
	const now = new Date().toISOString();
	const job = await db.query.document_sync_jobs.findFirst({
		where: and(
			eq(document_sync_jobs.state, 'queued'),
			or(isNull(document_sync_jobs.next_attempt_at), lte(document_sync_jobs.next_attempt_at, now))
		),
		orderBy: [asc(document_sync_jobs.created_at)]
	});
	if (!job) return undefined;

	const claimed = db
		.update(document_sync_jobs)
		.set({ state: 'uploading', updated_at: now })
		.where(and(eq(document_sync_jobs.id, job.id), eq(document_sync_jobs.state, 'queued')))
		.run();
	if (claimed.changes !== 1) return undefined;

	try {
		const document = await getDocumentById(job.document_id, job.user_id);
		if (!document?.storage_key || !document.paperless_integration_id) {
			throw new Error('Document sync configuration is incomplete');
		}
		const data = await getStorage().getBuffer(document.storage_key);
		const client = await getPaperlessClient(document.paperless_integration_id, job.user_id);
		const taskId = await client.uploadDocument({
			data: new Blob([Uint8Array.from(data)], { type: document.mime_type }),
			filename: document.name,
			title: document.title,
			created: document.created_at
		});
		await db
			.update(document_sync_jobs)
			.set({ state: 'processing', paperless_task_id: taskId, updated_at: new Date().toISOString() })
			.where(eq(document_sync_jobs.id, job.id));
		await db
			.update(documents)
			.set({ sync_status: 'processing' })
			.where(eq(documents.id, document.id));
	} catch (error) {
		await failDocumentSyncJob(job, error);
	}

	return db.query.document_sync_jobs.findFirst({
		where: eq(document_sync_jobs.id, job.id)
	});
}

export async function pollProcessingDocumentSyncJobs(): Promise<number> {
	const jobs = await db.query.document_sync_jobs.findMany({
		where: eq(document_sync_jobs.state, 'processing'),
		orderBy: [asc(document_sync_jobs.created_at)]
	});
	let completed = 0;
	for (const job of jobs) {
		if (!job.paperless_task_id) continue;
		try {
			const document = await getDocumentById(job.document_id, job.user_id);
			if (!document?.paperless_integration_id) throw new Error('Paperless integration is missing');
			const client = await getPaperlessClient(document.paperless_integration_id, job.user_id);
			const task = await client.getTask(job.paperless_task_id);
			if (!task) continue;
			const status = task.status?.toUpperCase();
			if (status === 'FAILURE') {
				await failDocumentSyncJob(job, task.result ?? 'Paperless document processing failed');
				continue;
			}
			if (status !== 'SUCCESS' || task.related_document == null) continue;

			const localKeyToDelete = job.mode === 'move' ? document.storage_key : null;
			const finishedAt = new Date().toISOString();
			db.transaction((tx) => {
				tx.update(documents)
					.set({
						source: job.mode === 'move' ? 'paperless' : 'motomate',
						storage_key: job.mode === 'move' ? null : document.storage_key,
						paperless_document_id: task.related_document,
						sync_status: 'synced',
						sync_error: null,
						last_synced_at: finishedAt
					})
					.where(eq(documents.id, document.id))
					.run();
				tx.update(document_sync_jobs)
					.set({ state: 'complete', last_error: null, updated_at: finishedAt })
					.where(eq(document_sync_jobs.id, job.id))
					.run();
			});
			if (localKeyToDelete) {
				const storage = getStorage();
				await Promise.all([
					storage
						.delete(localKeyToDelete)
						.catch((error) =>
							console.error(`Paperless move left local object ${localKeyToDelete} behind:`, error)
						),
					storage.delete(thumbnailCacheKey(job.user_id, document.id)).catch(() => {})
				]);
			}
			completed += 1;
		} catch (error) {
			await failDocumentSyncJob(job, error);
		}
	}
	return completed;
}

async function failDocumentSyncJob(job: DocumentSyncJob, error: unknown): Promise<void> {
	const message = String(error instanceof Error ? error.message : error).slice(0, 500);
	const attemptCount = job.attempt_count + 1;
	const retry = attemptCount < 5;
	const nextAttempt = retry
		? new Date(Date.now() + Math.min(60, 2 ** attemptCount) * 60_000).toISOString()
		: null;
	const now = new Date().toISOString();
	db.transaction((tx) => {
		tx.update(document_sync_jobs)
			.set({
				state: retry ? 'queued' : 'failed',
				attempt_count: attemptCount,
				next_attempt_at: nextAttempt,
				last_error: message,
				updated_at: now
			})
			.where(eq(document_sync_jobs.id, job.id))
			.run();
		tx.update(documents)
			.set({ sync_status: retry ? 'queued' : 'failed', sync_error: message })
			.where(eq(documents.id, job.document_id))
			.run();
	});
}
