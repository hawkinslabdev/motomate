import { vi, describe, it, expect } from 'vitest';
import os from 'os';
import path from 'path';
import { promises as fs } from 'fs';

vi.mock('$env/dynamic/private', () => ({ env: {} }));

import { LocalStorageAdapter } from '$lib/storage/local.js';

describe('LocalStorageAdapter path containment', () => {
	it('reads keys inside the base and rejects keys that escape it', async () => {
		const base = await fs.mkdtemp(path.join(os.tmpdir(), 'mm-store-'));
		const store = new LocalStorageAdapter(base);
		await store.put('files/u1/v1/a.txt', Buffer.from('ok'), 'text/plain');
		expect((await store.getBuffer('files/u1/v1/a.txt')).toString()).toBe('ok');
		expect((await store.getBuffer('/files/u1/v1/a.txt')).toString()).toBe('ok');

		for (const bad of ['../etc/passwd', 'files/../../etc/passwd', 'files/u1/a\0.txt', '.', '']) {
			await expect(store.getBuffer(bad)).rejects.toThrow('Invalid storage key');
		}
		await expect(store.delete('../x')).rejects.toThrow('Invalid storage key');
	});
});
