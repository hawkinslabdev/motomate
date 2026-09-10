import {
	getUserById,
	getUserIdsWithIntegrations,
	updateUserSettings
} from '$lib/db/repositories/users.js';
import { getDocumentsByUser } from '$lib/db/repositories/documents.js';
import { getVehiclesByUser, getVehicleById } from '$lib/db/repositories/vehicles.js';
import { raiseSystemAlert, clearSystemAlert } from '$lib/workflow/channels/inapp.js';
import { getStorage } from '$lib/storage/index.js';
import { s3Put, s3Exists, s3MarkDeleted, type S3Config } from '$lib/storage/s3.js';
import {
	paperlessPost,
	paperlessSupports,
	paperlessResolveTag,
	paperlessResolveCorrespondent,
	paperlessDocumentExists,
	paperlessFindId,
	paperlessUpdateTitle,
	PaperlessRejection,
	type PaperlessConfig
} from './paperless.js';
import { decryptSecret } from './secrets.js';
import { serverT } from '$lib/i18n/server.js';
import type { Document, Integrations, User, UserSettings } from '$lib/db/schema.js';

export type IntegrationTarget = 's3' | 'paperless';

export type ResolvedIntegrations = {
	s3: S3Config | null;
	paperless: PaperlessConfig | null;
};

export function resolveIntegrations(settings: UserSettings | undefined): ResolvedIntegrations {
	const cfg: Integrations = settings?.integrations ?? {};
	const s3 = cfg.s3;
	const paperless = cfg.paperless;

	return {
		s3:
			s3?.enabled && s3.bucket && s3.access_key && s3.secret_key
				? {
						endpoint: s3.endpoint || undefined,
						region: s3.region || undefined,
						bucket: s3.bucket,
						access_key: s3.access_key,
						secret_key: decryptSecret(s3.secret_key)
					}
				: null,
		paperless:
			paperless?.enabled && paperless.url && paperless.token
				? { url: paperless.url, token: decryptSecret(paperless.token) }
				: null
	};
}

async function resolveForUser(
	userId: string
): Promise<ResolvedIntegrations & { user: User | undefined }> {
	const user = await getUserById(userId);
	return { user, ...resolveIntegrations(user?.settings) };
}

function reason(e: unknown): string {
	return e instanceof Error ? e.message : String(e);
}

// Alerts are self-healing: a failure raises one, the next success removes it.
async function reportFailure(user: User | undefined, target: IntegrationTarget, e: unknown) {
	console.error(`[integrations] ${target} failed`, e);
	if (!user) return;
	const locale = user.settings?.locale ?? 'en';
	const title = await serverT(`notifications.integration.${target}.title`, locale);
	const body = await serverT(`notifications.integration.${target}.body`, locale);
	await raiseSystemAlert(
		user.id,
		target,
		title,
		`${body} (${reason(e)})`,
		'/settings/integrations'
	).catch(() => {});
}

async function reportSuccess(userId: string, target: IntegrationTarget) {
	await clearSystemAlert(userId, target).catch(() => {});
}

const MIME_BY_EXT: Record<string, string> = {
	pdf: 'application/pdf',
	jpg: 'image/jpeg',
	jpeg: 'image/jpeg',
	png: 'image/png',
	webp: 'image/webp',
	gif: 'image/gif',
	gpx: 'application/gpx+xml'
};

// Generated reports are regenerable output, so the archive skips them on the Author stamp
async function isGeneratedReport(buffer: Buffer, mime: string): Promise<boolean> {
	if (mime.toLowerCase() !== 'application/pdf') return false;
	try {
		const { PDFDocument } = await import('pdf-lib');
		const pdf = await PDFDocument.load(buffer, { updateMetadata: false });
		return pdf.getAuthor() === 'MotoMate';
	} catch {
		return false;
	}
}

async function skipReason(
	doc: Document,
	buffer: Buffer,
	includeReports: boolean
): Promise<'report' | 'unsupported' | null> {
	if (!paperlessSupports(doc.mime_type, doc.name)) return 'unsupported';
	if (!includeReports && (await isGeneratedReport(buffer, doc.mime_type))) return 'report';
	return null;
}

// Title prefix handles fast search/sorting without extra API calls, while tags handle actual filtering.
function paperlessTitle(vehicleName: string | undefined, doc: Document): string {
	const title = doc.title || doc.name;
	return vehicleName ? `${vehicleName} - ${title}` : title;
}

// Embeds our own document id in the uploaded filename so a later resend can match it via paperlessDocumentExists.
function paperlessFilename(doc: Document): string {
	return `${doc.id}__${doc.name}`;
}

// Identify author/correspondent for all uploads, for proper filtering/search in Paperlesss
const PAPERLESS_CORRESPONDENT = 'MotoMate';

// Best-effort: a failed lookup/check must never block the document upload itself.
async function bestEffort<T>(label: string, fn: () => Promise<T>): Promise<T | undefined> {
	try {
		return await fn();
	} catch (e) {
		console.warn(`[integrations] paperless ${label} failed`, reason(e));
		return undefined;
	}
}

function mimeForKey(key: string): string {
	return MIME_BY_EXT[key.split('.').pop()?.toLowerCase() ?? ''] ?? 'application/octet-stream';
}

async function copyToS3(cfg: S3Config, key: string, mime: string): Promise<void> {
	const buffer = await getStorage().getBuffer(key);
	await s3Put(cfg, key, buffer, mime);
}

// Best effort: a failing backup target must never fail the upload the rider just made.
export function mirrorPut(userId: string, key: string, mime?: string): void {
	void (async () => {
		const { user, s3 } = await resolveForUser(userId);
		if (!s3) return;
		try {
			await copyToS3(s3, key, mime ?? mimeForKey(key));
			await reportSuccess(userId, 's3');
		} catch (e) {
			await reportFailure(user, 's3', e);
		}
	})().catch((e) => console.error('[integrations] mirror put hook failed', key, e));
}

// Not every S3 server supports tagging and an outliving object is harmless, so failures only log
export function mirrorDelete(userId: string, key: string): void {
	void (async () => {
		const { s3 } = await resolveForUser(userId);
		if (!s3) return;
		await s3MarkDeleted(s3, key);
	})().catch((e) => console.warn('[integrations] could not tag deleted object', key, e));
}

export function onDocumentCreated(userId: string, doc: Document): void {
	void (async () => {
		const { user, s3, paperless } = await resolveForUser(userId);
		if (!s3 && !paperless) return;
		const buffer = await getStorage().getBuffer(doc.storage_key);

		if (s3) {
			try {
				await s3Put(s3, doc.storage_key, buffer, doc.mime_type);
				await reportSuccess(userId, 's3');
			} catch (e) {
				await reportFailure(user, 's3', e);
			}
		}
		const includeReports = user?.settings?.integrations?.paperless?.include_reports ?? false;
		if (paperless && !(await skipReason(doc, buffer, includeReports))) {
			try {
				const vehicle = await getVehicleById(doc.vehicle_id, userId);
				const tagId = vehicle
					? await bestEffort('tag', () => paperlessResolveTag(paperless, vehicle.name))
					: undefined;
				const correspondentId = await bestEffort('correspondent', () =>
					paperlessResolveCorrespondent(paperless, PAPERLESS_CORRESPONDENT)
				);
				await paperlessPost(paperless, {
					buffer,
					filename: paperlessFilename(doc),
					mime: doc.mime_type,
					title: paperlessTitle(vehicle?.name, doc),
					created: doc.created_at.slice(0, 10),
					tags: tagId !== undefined ? [tagId] : undefined,
					correspondent: correspondentId
				});
				await advancePaperlessCursor(userId, doc.created_at);
				await reportSuccess(userId, 'paperless');
			} catch (e) {
				if (e instanceof PaperlessRejection)
					console.warn('[integrations] paperless skipped', doc.name, e.message);
				else await reportFailure(user, 'paperless', e);
			}
		}
	})().catch((e) => console.error('[integrations] document hook failed', doc.id, e));
}

// renames require an explicit push to Paperless; S3 storage keys are unaffected
export function onDocumentRenamed(userId: string, doc: Document): void {
	void (async () => {
		const { user, paperless } = await resolveForUser(userId);
		if (!paperless) return;
		try {
			const remoteId = await paperlessFindId(paperless, `${doc.id}__`);
			if (remoteId === null) return; // never made it there (unsupported type, or a sync still pending)
			const vehicle = await getVehicleById(doc.vehicle_id, userId);
			await paperlessUpdateTitle(paperless, remoteId, paperlessTitle(vehicle?.name, doc));
			await reportSuccess(userId, 'paperless');
		} catch (e) {
			await reportFailure(user, 'paperless', e);
		}
	})().catch((e) => console.error('[integrations] rename hook failed', doc.id, e));
}

// Keeps the backfill cursor level with what the live hook already sent, so a later sync does not repost it.
async function advancePaperlessCursor(userId: string, createdAt: string): Promise<void> {
	const user = await getUserById(userId);
	const current = user?.settings?.integrations;
	if (!current?.paperless) return;
	if (current.paperless.last_sync_at && current.paperless.last_sync_at >= createdAt) return;
	await updateUserSettings(userId, {
		integrations: { ...current, paperless: { ...current.paperless, last_sync_at: createdAt } }
	});
}

export type SyncSummary = {
	filesUploaded: number;
	filesSkipped: number;
	filesFailed: number;
	docsPushed: number;
	docsAlreadySent: number;
	docsSkipped: number;
	docsFailed: number;
	skipped: string[];
	errors: string[];
};

// Hourly repair pass for whatever the live hooks could not deliver; alerts are deduped per target so nothing spams
export async function runIntegrationSync(): Promise<void> {
	const userIds = await getUserIdsWithIntegrations();
	for (const userId of userIds) {
		try {
			await syncAll(userId);
		} catch (e) {
			console.error('[integrations] scheduled sync failed', userId, e);
		}
	}
}

// Re-runnable backfill: S3 objects already there are skipped, paperless gets anything since the last run unless resend is set
export async function syncAll(
	userId: string,
	opts: { resend?: boolean } = {}
): Promise<SyncSummary> {
	const summary: SyncSummary = {
		filesUploaded: 0,
		filesSkipped: 0,
		filesFailed: 0,
		docsPushed: 0,
		docsAlreadySent: 0,
		docsSkipped: 0,
		docsFailed: 0,
		skipped: [],
		errors: []
	};

	const user = await getUserById(userId);
	if (!user) return summary;
	const { s3, paperless } = resolveIntegrations(user.settings);
	if (!s3 && !paperless) return summary;

	const documents = await getDocumentsByUser(userId);
	const vehicles = await getVehiclesByUser(userId, true);
	const vehicleName = new Map(vehicles.map((v) => [v.id, v.name]));
	// Constant name, so resolve it once for the whole run rather than once per document.
	const correspondentId = paperless
		? await bestEffort('correspondent', () =>
				paperlessResolveCorrespondent(paperless, PAPERLESS_CORRESPONDENT)
			)
		: undefined;
	const storage = getStorage();
	let lastS3Error: unknown = null;
	let lastPaperlessError: unknown = null;

	const note = (msg: string) => {
		if (summary.errors.length < 10) summary.errors.push(msg);
	};

	const locale = user.settings?.locale ?? 'en';
	const includeReports = user.settings?.integrations?.paperless?.include_reports ?? false;
	const noteSkipped = async (doc: Document, why: 'report' | 'unsupported') => {
		summary.docsSkipped++;
		if (summary.skipped.length >= 10) return;
		const reason = await serverT(`settings.integrations.sync.reason.${why}`, locale);
		summary.skipped.push(`${doc.name}: ${reason}`);
	};

	const paperlessSince = opts.resend
		? null
		: (user.settings?.integrations?.paperless?.last_sync_at ?? null);

	// ponytail: one sequential pass, both targets fed from a single read; move to a background job if a library ever holds thousands of files
	for (const doc of documents) {
		let buffer: Buffer | null = null;
		const load = async () => (buffer ??= await storage.getBuffer(doc.storage_key));

		if (s3) {
			try {
				if (await s3Exists(s3, doc.storage_key)) {
					summary.filesSkipped++;
				} else {
					await s3Put(s3, doc.storage_key, await load(), doc.mime_type);
					summary.filesUploaded++;
				}
			} catch (e) {
				summary.filesFailed++;
				lastS3Error = e;
				note(`${doc.storage_key}: ${reason(e)}`);
			}
		}

		if (!paperless) continue;
		if (paperlessSince && doc.created_at <= paperlessSince) {
			summary.docsAlreadySent++;
			continue;
		}
		try {
			const bytes = await load();
			const skip = await skipReason(doc, bytes, includeReports);
			if (skip) {
				await noteSkipped(doc, skip);
				continue;
			}
			// resend skips the cursor above, so check paperless directly instead for an existing match
			if (opts.resend) {
				const already =
					(await bestEffort('duplicate check', () =>
						paperlessDocumentExists(paperless, `${doc.id}__`)
					)) ||
					(await bestEffort('duplicate check', () => paperlessDocumentExists(paperless, doc.name)));
				if (already) {
					summary.docsAlreadySent++;
					continue;
				}
			}
			const vName = vehicleName.get(doc.vehicle_id);
			const tagId = vName
				? await bestEffort('tag', () => paperlessResolveTag(paperless, vName))
				: undefined;
			await paperlessPost(paperless, {
				buffer: bytes,
				filename: paperlessFilename(doc),
				mime: doc.mime_type,
				title: paperlessTitle(vName, doc),
				created: doc.created_at.slice(0, 10),
				tags: tagId !== undefined ? [tagId] : undefined,
				correspondent: correspondentId
			});
			summary.docsPushed++;
		} catch (e) {
			if (e instanceof PaperlessRejection) {
				await noteSkipped(doc, 'unsupported');
				continue;
			}
			summary.docsFailed++;
			lastPaperlessError = e;
			note(`${doc.name}: ${reason(e)}`);
		}
	}

	// Avatars and cover images are not documents, so they only ever go to the bucket.
	if (s3) {
		const imageKeys = [
			...vehicles.filter((v) => v.cover_image_key).map((v) => v.cover_image_key as string),
			...(user.settings?.avatar_key ? [user.settings.avatar_key] : [])
		];

		for (const key of imageKeys) {
			try {
				if (await s3Exists(s3, key)) {
					summary.filesSkipped++;
					continue;
				}
				await copyToS3(s3, key, mimeForKey(key));
				summary.filesUploaded++;
			} catch (e) {
				summary.filesFailed++;
				lastS3Error = e;
				note(`${key}: ${reason(e)}`);
			}
		}
	}

	if (s3) {
		if (summary.filesFailed > 0) await reportFailure(user, 's3', lastS3Error);
		else await reportSuccess(userId, 's3');
	}
	if (paperless) {
		if (summary.docsFailed > 0) await reportFailure(user, 'paperless', lastPaperlessError);
		else await reportSuccess(userId, 'paperless');
	}

	const now = new Date().toISOString();
	const current = user.settings?.integrations ?? {};
	await updateUserSettings(userId, {
		integrations: {
			...current,
			...(s3 && current.s3 ? { s3: { ...current.s3, last_sync_at: now } } : {}),
			// The paperless cursor only advances on a clean run, so failures retry next time.
			...(paperless && current.paperless
				? {
						paperless: {
							...current.paperless,
							last_sync_at: summary.docsFailed === 0 ? now : paperlessSince
						}
					}
				: {})
		}
	});

	return summary;
}
