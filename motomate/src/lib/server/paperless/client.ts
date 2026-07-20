const REQUEST_TIMEOUT_MS = 15_000;

export type PaperlessDocumentSummary = {
	id: number;
	title: string;
	created: string;
	added?: string;
	modified?: string;
	correspondent?: number | null;
	document_type?: number | null;
	tags?: number[];
	original_file_name?: string;
	archived_file_name?: string | null;
	original_file_size?: number;
	mime_type?: string;
};

export type PaperlessDocumentPage = {
	count: number;
	next: string | null;
	previous: string | null;
	results: PaperlessDocumentSummary[];
};

export type PaperlessTask = {
	task_id: string;
	status?: string;
	result?: string | number | null;
	related_document?: number | null;
};

export type PaperlessDocumentDownloadMetadata = {
	contentType: string | null;
	sizeBytes: number | null;
};

export type PaperlessDocumentThumbnail = {
	data: Buffer;
	contentType: string | null;
};

type ClientOptions = {
	baseUrl: string;
	token: string;
	fetch?: typeof globalThis.fetch;
};

export function normalizePaperlessBaseUrl(value: string): string {
	const url = new URL(value);
	if (!['http:', 'https:'].includes(url.protocol))
		throw new Error('Paperless URL must use HTTP or HTTPS');
	if (url.username || url.password || url.search || url.hash) {
		throw new Error('Paperless URL cannot contain credentials, a query, or a fragment');
	}
	return url.toString().replace(/\/$/, '');
}

export class PaperlessClient {
	readonly baseUrl: string;
	private readonly token: string;
	private readonly fetchImpl: typeof globalThis.fetch;

	constructor({ baseUrl, token, fetch: fetchImpl = globalThis.fetch }: ClientOptions) {
		this.baseUrl = normalizePaperlessBaseUrl(baseUrl);
		this.token = token.trim();
		if (!this.token) throw new Error('Paperless API token is required');
		this.fetchImpl = fetchImpl;
	}

	private async request(path: string, init: RequestInit = {}): Promise<Response> {
		const response = await this.fetchImpl(new URL(path, `${this.baseUrl}/`), {
			...init,
			signal: init.signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS),
			headers: {
				Authorization: `Token ${this.token}`,
				Accept: 'application/json',
				...init.headers
			}
		});
		if (!response.ok) {
			const detail = (await response.text()).slice(0, 500);
			throw new Error(
				`Paperless request failed (${response.status}): ${detail || response.statusText}`
			);
		}
		return response;
	}

	async testConnection(): Promise<{ apiVersion: string | null; serverVersion: string | null }> {
		const response = await this.request('api/documents/?page_size=1');
		await response.json();
		return {
			apiVersion: response.headers.get('x-api-version'),
			serverVersion: response.headers.get('x-version')
		};
	}

	async searchDocuments(
		options: {
			query?: string;
			page?: number;
			pageSize?: number;
		} = {}
	): Promise<PaperlessDocumentPage> {
		const params = new URLSearchParams({
			page: String(options.page ?? 1),
			page_size: String(Math.min(Math.max(options.pageSize ?? 25, 1), 100)),
			ordering: '-created'
		});
		if (options.query?.trim()) params.set('query', options.query.trim());
		const response = await this.request(`api/documents/?${params}`);
		return (await response.json()) as PaperlessDocumentPage;
	}

	async getDocument(id: number): Promise<PaperlessDocumentSummary> {
		const response = await this.request(`api/documents/${id}/`);
		return (await response.json()) as PaperlessDocumentSummary;
	}

	async downloadDocument(id: number): Promise<{ data: Buffer; contentType: string | null }> {
		const response = await this.request(`api/documents/${id}/download/`, {
			headers: { Accept: '*/*' }
		});
		return {
			data: Buffer.from(await response.arrayBuffer()),
			contentType: response.headers.get('content-type')
		};
	}

	async getDocumentDownloadMetadata(id: number): Promise<PaperlessDocumentDownloadMetadata> {
		const response = await this.request(`api/documents/${id}/download/`, {
			method: 'HEAD',
			headers: { Accept: '*/*' }
		});
		const rawSize = response.headers.get('content-length');
		const parsedSize = rawSize == null ? Number.NaN : Number(rawSize);
		return {
			contentType: response.headers.get('content-type'),
			sizeBytes: Number.isSafeInteger(parsedSize) && parsedSize >= 0 ? parsedSize : null
		};
	}

	async getDocumentThumbnail(id: number): Promise<PaperlessDocumentThumbnail> {
		const response = await this.request(`api/documents/${id}/thumb/`, {
			headers: { Accept: '*/*' }
		});
		return {
			data: Buffer.from(await response.arrayBuffer()),
			contentType: response.headers.get('content-type')
		};
	}

	async uploadDocument(input: {
		data: Blob;
		filename: string;
		title?: string | null;
		created?: string | null;
	}): Promise<string> {
		const body = new FormData();
		body.set('document', input.data, input.filename);
		if (input.title) body.set('title', input.title);
		if (input.created) body.set('created', input.created);
		const response = await this.request('api/documents/post_document/', { method: 'POST', body });
		const taskId = (await response.json()) as string;
		if (typeof taskId !== 'string' || !taskId)
			throw new Error('Paperless did not return a task ID');
		return taskId;
	}

	async getTask(taskId: string): Promise<PaperlessTask | undefined> {
		const response = await this.request(`api/tasks/?task_id=${encodeURIComponent(taskId)}`);
		const payload = (await response.json()) as PaperlessTask[] | { results?: PaperlessTask[] };
		const tasks = Array.isArray(payload) ? payload : (payload.results ?? []);
		return tasks[0];
	}
}
