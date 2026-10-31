import { browser } from '$app/env';

const DRAFT_VERSION = 1;
const TTL_MS = 7 * 24 * 60 * 60 * 1000;
const LS_PREFIX = 'mm.draft.';
const SYNC_DELAY_MS = 800;

export type DraftFields = Record<string, string | number | boolean>;

export interface DraftEntry {
	_v: number;
	fields: DraftFields;
	savedAt: string;
	hasUnsavedFile?: boolean;
}

function isValid(raw: unknown): raw is DraftEntry {
	if (!raw || typeof raw !== 'object') return false;
	const e = raw as DraftEntry;
	if (e._v !== DRAFT_VERSION) return false;
	const t = new Date(e.savedAt).getTime();
	if (isNaN(t)) return false;
	if (Date.now() - t > TTL_MS) return false;
	return true;
}

function writeLocal(id: string, entry: DraftEntry) {
	try {
		localStorage.setItem(`${LS_PREFIX}${id}`, JSON.stringify(entry));
	} catch {
		/* storage unavailable */
	}
}

class DraftStore {
	#cache = $state<Record<string, DraftEntry>>({});
	#timer: ReturnType<typeof setTimeout> | null = null;

	init(
		serverDrafts: Record<string, Record<string, unknown>> | undefined,
		validVehicleIds: string[]
	) {
		if (!browser) return;
		const validSet = new Set(validVehicleIds);
		const merged: Record<string, DraftEntry> = {};

		// Pass 1: localStorage (prune orphans/expired)
		const keys: string[] = [];
		for (let i = 0; i < localStorage.length; i++) {
			const k = localStorage.key(i);
			if (k?.startsWith(LS_PREFIX)) keys.push(k);
		}
		for (const lsKey of keys) {
			const id = lsKey.slice(LS_PREFIX.length);
			const vehicleId = id.split(':')[0];
			if (!validSet.has(vehicleId)) {
				localStorage.removeItem(lsKey);
				continue;
			}
			try {
				const raw = JSON.parse(localStorage.getItem(lsKey)!);
				if (isValid(raw)) merged[id] = raw as DraftEntry;
				else localStorage.removeItem(lsKey);
			} catch {
				localStorage.removeItem(lsKey);
			}
		}

		// Pass 2: server drafts (prefer newer savedAt)
		if (serverDrafts) {
			for (const [vehicleId, typeMap] of Object.entries(serverDrafts)) {
				if (!validSet.has(vehicleId) || !typeMap) continue;
				for (const [entryType, raw] of Object.entries(typeMap)) {
					if (!isValid(raw)) continue;
					const id = `${vehicleId}:${entryType}`;
					const local = merged[id];
					const server = raw as DraftEntry;
					if (!local || new Date(server.savedAt) > new Date(local.savedAt)) {
						merged[id] = server;
						writeLocal(id, server);
					}
				}
			}
		}

		this.#cache = merged;
	}

	get(vehicleId: string, entryType: string): DraftEntry | null {
		const id = `${vehicleId}:${entryType}`;
		const entry = this.#cache[id];
		if (!entry) return null;
		if (!isValid(entry)) {
			this.clear(vehicleId, entryType);
			return null;
		}
		return entry;
	}

	save(vehicleId: string, entryType: string, fields: DraftFields, hasUnsavedFile = false) {
		if (!browser) return;
		const id = `${vehicleId}:${entryType}`;
		const entry: DraftEntry = {
			_v: DRAFT_VERSION,
			fields,
			savedAt: new Date().toISOString(),
			...(hasUnsavedFile ? { hasUnsavedFile: true } : {})
		};
		this.#cache[id] = entry;
		writeLocal(id, entry);
		this.#scheduleSync();
	}

	clear(vehicleId: string, entryType: string) {
		if (!browser) return;
		const id = `${vehicleId}:${entryType}`;
		delete this.#cache[id];
		localStorage.removeItem(`${LS_PREFIX}${id}`);
		this.#scheduleSync();
	}

	#scheduleSync() {
		if (this.#timer) clearTimeout(this.#timer);
		this.#timer = setTimeout(() => void this.#sync(), SYNC_DELAY_MS);
	}

	async #sync() {
		const grouped: Record<string, Record<string, DraftEntry>> = {};
		for (const [id, entry] of Object.entries(this.#cache)) {
			const sep = id.indexOf(':');
			if (sep < 0) continue;
			const vehicleId = id.slice(0, sep);
			const entryType = id.slice(sep + 1);
			(grouped[vehicleId] ??= {})[entryType] = entry;
		}
		try {
			await fetch('/api/prefs', {
				method: 'PATCH',
				keepalive: true,
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ page_prefs: { drafts: grouped } })
			});
		} catch {
			/* network unavailable */
		}
	}
}

export const drafts = new DraftStore();
