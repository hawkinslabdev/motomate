import { assertSafeUrl } from './url-guard.js';

export type PaperlessConfig = { url: string; token: string };

const TIMEOUT_MS = 30_000;

// Formats the paperless consumer can parse. Office types need Tika, so a rejection is still possible.
const SUPPORTED_MIME = new Set([
	'application/pdf',
	'image/png',
	'image/jpeg',
	'image/tiff',
	'image/gif',
	'image/webp',
	'text/plain',
	'application/msword',
	'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
	'application/vnd.oasis.opendocument.text',
	'application/vnd.ms-powerpoint',
	'application/vnd.openxmlformats-officedocument.presentationml.presentation',
	'application/vnd.oasis.opendocument.presentation',
	'application/vnd.ms-excel',
	'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
	'application/vnd.oasis.opendocument.spreadsheet'
]);

const SUPPORTED_EXT = new Set([
	'pdf',
	'png',
	'jpg',
	'jpeg',
	'tif',
	'tiff',
	'gif',
	'webp',
	'txt',
	'doc',
	'docx',
	'odt',
	'ppt',
	'pptx',
	'odp',
	'xls',
	'xlsx',
	'ods'
]);

// Browsers send junk mime types often enough that the extension is worth a second look.
export function paperlessSupports(mime: string, filename: string): boolean {
	if (SUPPORTED_MIME.has(mime.toLowerCase())) return true;
	return SUPPORTED_EXT.has(filename.split('.').pop()?.toLowerCase() ?? '');
}

// Paperless refused this specific file (unsupported type, duplicate, unreadable). Not a connection problem.
export class PaperlessRejection extends Error {
	constructor(
		message: string,
		readonly status: number
	) {
		super(message);
		this.name = 'PaperlessRejection';
	}
}

// User-supplied URL: http(s) only, no redirects, so it cannot be bounced to another host.
async function base(url: string): Promise<string> {
	await assertSafeUrl(url);
	return url.replace(/\/+$/, '');
}

function headers(cfg: PaperlessConfig): Record<string, string> {
	return { Authorization: `Token ${cfg.token}`, Accept: 'application/json' };
}

export async function paperlessTest(cfg: PaperlessConfig): Promise<void> {
	const res = await fetch(`${await base(cfg.url)}/api/documents/?page_size=1`, {
		headers: headers(cfg),
		redirect: 'manual',
		signal: AbortSignal.timeout(TIMEOUT_MS)
	});
	if (res.status === 401 || res.status === 403) throw new Error('Paperless rejected the API token');
	if (!res.ok) throw new Error(`Paperless responded with ${res.status}`);
}

// Maps entity name -> paperless id. caches the promise so parallel requests dont race to create dupes
const namedEntityCache = new Map<string, Promise<number>>();

function fingerprint(cfg: PaperlessConfig): string {
	return `${cfg.url}|${cfg.token}`;
}

type NamedEntityList = { results: { id: number; name: string }[] };

// helper for both tags and correspondents - finds by name or creates it
async function findOrCreateNamed(
	cfg: PaperlessConfig,
	resource: 'tags' | 'correspondents',
	name: string
): Promise<number> {
	const url = await base(cfg.url);
	const noun = resource === 'tags' ? 'tag' : 'correspondent';
	const found = await fetch(`${url}/api/${resource}/?name__iexact=${encodeURIComponent(name)}`, {
		headers: headers(cfg),
		redirect: 'manual',
		signal: AbortSignal.timeout(TIMEOUT_MS)
	});
	if (!found.ok)
		throw new Error(`Paperless responded with ${found.status} while looking up ${noun}`);
	const existing = (await found.json()) as NamedEntityList;
	const match = existing.results.find((t) => t.name.toLowerCase() === name.toLowerCase());
	if (match) return match.id;

	const created = await fetch(`${url}/api/${resource}/`, {
		method: 'POST',
		headers: { ...headers(cfg), 'Content-Type': 'application/json' },
		body: JSON.stringify({ name }),
		redirect: 'manual',
		signal: AbortSignal.timeout(TIMEOUT_MS)
	});
	if (!created.ok)
		throw new Error(`Paperless responded with ${created.status} while creating ${noun}`);
	return ((await created.json()) as { id: number }).id;
}

function resolveNamed(
	cfg: PaperlessConfig,
	resource: 'tags' | 'correspondents',
	name: string
): Promise<number> {
	const key = `${resource}|${fingerprint(cfg)}|${name.trim().toLowerCase()}`;
	let pending = namedEntityCache.get(key);
	if (!pending) {
		pending = findOrCreateNamed(cfg, resource, name.trim());
		namedEntityCache.set(key, pending);
		pending.catch(() => namedEntityCache.delete(key)); // don't let a failed lookup poison future attempts
	}
	return pending;
}

// resolves vehicle name to paperless tag id, creates if missing
export function paperlessResolveTag(cfg: PaperlessConfig, name: string): Promise<number> {
	return resolveNamed(cfg, 'tags', name);
}

// resolves name to correspondent id, tag = vehicle, correspondent = sender
export function paperlessResolveCorrespondent(cfg: PaperlessConfig, name: string): Promise<number> {
	return resolveNamed(cfg, 'correspondents', name);
}

// paperless ID of first document matching `query` (or null), located via embedded `${doc.id}__`
export async function paperlessFindId(cfg: PaperlessConfig, query: string): Promise<number | null> {
	const url = await base(cfg.url);
	const res = await fetch(
		`${url}/api/documents/?original_file_name__icontains=${encodeURIComponent(query)}&page_size=1`,
		{
			headers: headers(cfg),
			redirect: 'manual',
			signal: AbortSignal.timeout(TIMEOUT_MS)
		}
	);
	if (!res.ok)
		throw new Error(
			`Paperless responded with ${res.status} while checking for an existing document`
		);
	const data = (await res.json()) as { results: { id: number }[] };
	return data.results[0]?.id ?? null;
}

// our own dedup check, since paperless's own duplicate rejection can lag behind an async consume task
export async function paperlessDocumentExists(
	cfg: PaperlessConfig,
	query: string
): Promise<boolean> {
	return (await paperlessFindId(cfg, query)) !== null;
}

// Paperless stores its own copy, so a rename on our side only shows up there if we push it. original_file_name is immutable in paperless; title is the field it displays.
export async function paperlessUpdateTitle(
	cfg: PaperlessConfig,
	id: number,
	title: string
): Promise<void> {
	const res = await fetch(`${await base(cfg.url)}/api/documents/${id}/`, {
		method: 'PATCH',
		headers: { ...headers(cfg), 'Content-Type': 'application/json' },
		body: JSON.stringify({ title }),
		redirect: 'manual',
		signal: AbortSignal.timeout(TIMEOUT_MS)
	});
	if (!res.ok) throw new Error(`Paperless responded with ${res.status} while renaming a document`);
}

// returns task id, paperless handles dups so retrying is safe
export async function paperlessPost(
	cfg: PaperlessConfig,
	file: {
		buffer: Buffer;
		filename: string;
		mime: string;
		title?: string;
		created?: string;
		tags?: number[];
		correspondent?: number;
	}
): Promise<string> {
	const form = new FormData();
	form.append(
		'document',
		new Blob([new Uint8Array(file.buffer)], { type: file.mime }),
		file.filename
	);
	if (file.title) form.append('title', file.title);
	if (file.created) form.append('created', file.created);
	for (const tagId of file.tags ?? []) form.append('tags', String(tagId));
	if (file.correspondent !== undefined) form.append('correspondent', String(file.correspondent));

	const res = await fetch(`${await base(cfg.url)}/api/documents/post_document/`, {
		method: 'POST',
		headers: headers(cfg),
		body: form,
		redirect: 'manual',
		signal: AbortSignal.timeout(TIMEOUT_MS)
	});
	if (!res.ok) {
		const detail = (await res.text().catch(() => '')).slice(0, 200).trim();
		const message = `Paperless responded with ${res.status}${detail ? `: ${detail}` : ''}`;
		if (res.status >= 400 && res.status < 500 && res.status !== 401 && res.status !== 403) {
			throw new PaperlessRejection(message, res.status);
		}
		throw new Error(message);
	}
	return (await res.text()).replace(/^"|"$/g, '');
}
