import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

vi.mock('$env/dynamic/private', () => ({
	env: new Proxy({}, { get: (_, k: string) => process.env[k] })
}));

let dir: string;

beforeEach(() => {
	vi.resetModules();
	dir = mkdtempSync(join(tmpdir(), 'vapid-test-'));
	process.env.DATABASE_URL = join(dir, 'motomate.db');
	delete process.env.VAPID_PUBLIC_KEY;
	delete process.env.VAPID_PRIVATE_KEY;
	delete process.env.VAPID_SUBJECT;
});

afterEach(() => {
	rmSync(dir, { recursive: true, force: true });
});

describe('getVapidConfig', () => {
	it('prefers complete env keys over generating a pair', async () => {
		process.env.VAPID_PUBLIC_KEY = 'env-public';
		process.env.VAPID_PRIVATE_KEY = 'env-private';
		const { getVapidConfig } = await import('$lib/server/vapid.js');

		const config = getVapidConfig();

		expect(config.publicKey).toBe('env-public');
		expect(config.privateKey).toBe('env-private');
		expect(existsSync(join(dir, 'vapid.json'))).toBe(false);
	});

	it('generates and persists a key pair when no env keys are set, then reuses it', async () => {
		const { getVapidConfig } = await import('$lib/server/vapid.js');

		const first = getVapidConfig();
		expect(first.publicKey).toBeTruthy();
		expect(first.privateKey).toBeTruthy();

		const keysPath = join(dir, 'vapid.json');
		expect(existsSync(keysPath)).toBe(true);
		const stored = JSON.parse(readFileSync(keysPath, 'utf-8'));
		expect(stored.publicKey).toBe(first.publicKey);

		const second = getVapidConfig();
		expect(second.publicKey).toBe(first.publicKey);
	});

	it('loads an existing persisted key pair instead of regenerating', async () => {
		writeFileSync(
			join(dir, 'vapid.json'),
			JSON.stringify({ publicKey: 'stored-public', privateKey: 'stored-private' })
		);
		const { getVapidConfig } = await import('$lib/server/vapid.js');

		const config = getVapidConfig();

		expect(config.publicKey).toBe('stored-public');
		expect(config.privateKey).toBe('stored-private');
	});

	it('falls back to a persistent/generated pair when only one env key is set', async () => {
		process.env.VAPID_PUBLIC_KEY = 'env-public-only';
		const { getVapidConfig } = await import('$lib/server/vapid.js');

		const config = getVapidConfig();

		expect(config.publicKey).not.toBe('env-public-only');
		expect(existsSync(join(dir, 'vapid.json'))).toBe(true);
	});

	it('defaults subject to mailto:admin@localhost when unset', async () => {
		const { getVapidConfig } = await import('$lib/server/vapid.js');
		expect(getVapidConfig().subject).toBe('mailto:admin@localhost');
	});
});
