import type { PageServerLoad } from './$types';
import { dev } from '$app/env';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const CHANGELOG_URL = 'https://raw.githubusercontent.com/hawkinslabdev/motomate/main/CHANGELOG.md';
const TTL = 3_600_000;

let cache: { raw: string; at: number } | null = null;

export const load: PageServerLoad = async ({ url }) => {
	const currentVersion = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.0.0';

	if (dev) {
		try {
			const raw = readFileSync(resolve(process.cwd(), '../CHANGELOG.md'), 'utf-8');
			return { raw, currentVersion };
		} catch {
			// fall through to remote fetch
		}
	}

	const refresh = url.searchParams.has('refresh');
	if (!refresh && cache && Date.now() - cache.at < TTL) {
		return { raw: cache.raw, currentVersion };
	}
	try {
		const res = await fetch(CHANGELOG_URL, { signal: AbortSignal.timeout(8000) });
		if (!res.ok) throw new Error(`HTTP ${res.status}`);
		const raw = await res.text();
		cache = { raw, at: Date.now() };
		return { raw, currentVersion };
	} catch {
		return { raw: cache?.raw ?? null, currentVersion };
	}
};
