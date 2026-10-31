import { vi, describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '#lib/db/schema.js';

let sqlite: InstanceType<typeof Database>;
let db: ReturnType<typeof drizzle<typeof schema>>;

vi.mock('#lib/db/index.js', () => ({
	get db() {
		return db;
	},
	get sqlite() {
		return sqlite;
	}
}));

vi.mock('$app/env/private', () => new Proxy({}, { has: () => true }));

import {
	createApiKey,
	listApiKeys,
	revokeApiKey,
	rotateApiKey,
	findUserByApiKey,
	restoreApiKey,
	deleteApiKey,
	updateKeyLastUsed
} from '#lib/db/repositories/api-keys.js';

const UID = 'u_api_test';

beforeAll(() => {
	sqlite = new Database(':memory:');
	sqlite.exec(`
    CREATE TABLE users (
      id text PRIMARY KEY NOT NULL,
      email text NOT NULL UNIQUE,
      password_hash text,
      timezone text NOT NULL DEFAULT 'Europe/Amsterdam',
      locale text NOT NULL DEFAULT 'en',
      onboarding_done integer NOT NULL DEFAULT 0,
      settings text NOT NULL DEFAULT '{"theme":"system","currency":"EUR","odometer_unit":"km","locale":"en"}',
      created_at text NOT NULL DEFAULT (datetime('now')),
      updated_at text NOT NULL DEFAULT (datetime('now'))
    )
  `);
	sqlite.exec(`
    CREATE TABLE api_keys (
      id text PRIMARY KEY NOT NULL,
      user_id text NOT NULL,
      name text NOT NULL,
      key_hash text NOT NULL,
      key_prefix text NOT NULL,
      scope text DEFAULT 'read_write' NOT NULL,
      expires_at text,
      expires_duration_days integer,
      last_used_at text,
      revoked_at text,
      created_at text DEFAULT (datetime('now')) NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE cascade
    )
  `);
	sqlite.exec(`CREATE UNIQUE INDEX api_keys_key_hash_unique ON api_keys (key_hash)`);
	sqlite.exec(`CREATE INDEX idx_api_keys_user ON api_keys (user_id)`);
	sqlite.exec(
		`CREATE UNIQUE INDEX idx_api_keys_user_name ON api_keys (user_id,name) WHERE revoked_at IS NULL`
	);
	db = drizzle(sqlite, { schema });
	sqlite.prepare('INSERT INTO users (id, email) VALUES (?, ?)').run(UID, 'test@example.com');
});

afterAll(() => sqlite.close());

beforeEach(() => sqlite.prepare('DELETE FROM api_keys').run());

describe('createApiKey()', () => {
	it('returns plaintext token starting with mm_', async () => {
		const { plaintext } = await createApiKey(UID, 'Home Assistant', 'read_write');
		expect(plaintext).toMatch(/^mm_[0-9a-f]{64}$/);
	});

	it('stores prefix (first 11 chars) not full token', async () => {
		const { plaintext, record } = await createApiKey(UID, 'k', 'read');
		expect(record.key_prefix).toBe(plaintext.slice(0, 11));
		expect(record.key_hash).not.toBe(plaintext);
	});

	it('stores scope correctly', async () => {
		const { record } = await createApiKey(UID, 'k', 'read');
		expect(record.scope).toBe('read');
	});

	it('stores expires_at as YYYY-MM-DD when days provided', async () => {
		const { record } = await createApiKey(UID, 'k', 'read_write', 90);
		expect(record.expires_at).toMatch(/^\d{4}-\d{2}-\d{2}$/);
		expect(record.expires_duration_days).toBe(90);
	});

	it('leaves expires_at null when no days provided', async () => {
		const { record } = await createApiKey(UID, 'k', 'read_write');
		expect(record.expires_at).toBeNull();
	});

	it('enforces 20-key limit', async () => {
		for (let i = 0; i < 20; i++) {
			await createApiKey(UID, `key-${i}`, 'read_write');
		}
		await expect(createApiKey(UID, 'key-overflow', 'read_write')).rejects.toThrow();
	});

	it('allows same name after revocation (partial unique index)', async () => {
		const { record } = await createApiKey(UID, 'duplicate', 'read_write');
		await revokeApiKey(UID, record.id);
		const { record: r2 } = await createApiKey(UID, 'duplicate', 'read_write');
		expect(r2.name).toBe('duplicate');
	});
});

describe('listApiKeys()', () => {
	it('returns all keys for user without key_hash', async () => {
		await createApiKey(UID, 'k1', 'read_write');
		await createApiKey(UID, 'k2', 'read');
		const keys = await listApiKeys(UID);
		expect(keys).toHaveLength(2);
		expect(keys[0]).not.toHaveProperty('key_hash');
	});

	it('returns empty array when no keys', async () => {
		expect(await listApiKeys(UID)).toHaveLength(0);
	});
});

describe('findUserByApiKey()', () => {
	it('returns user and key info for valid token', async () => {
		const { plaintext } = await createApiKey(UID, 'k', 'read_write');
		const result = await findUserByApiKey(plaintext);
		expect(result).not.toBeNull();
		expect(result!.user.id).toBe(UID);
		expect(result!.scope).toBe('read_write');
	});

	it('returns null for wrong token', async () => {
		await createApiKey(UID, 'k', 'read_write');
		expect(await findUserByApiKey('mm_' + '0'.repeat(64))).toBeNull();
	});

	it('returns null for revoked key', async () => {
		const { plaintext, record } = await createApiKey(UID, 'k', 'read_write');
		await revokeApiKey(UID, record.id);
		expect(await findUserByApiKey(plaintext)).toBeNull();
	});

	it('returns null for expired key', async () => {
		const { plaintext, record } = await createApiKey(UID, 'k', 'read_write', 1);
		sqlite.prepare('UPDATE api_keys SET expires_at = ? WHERE id = ?').run('2020-01-01', record.id);
		expect(await findUserByApiKey(plaintext)).toBeNull();
	});

	it('returns result for key expiring in future', async () => {
		const { plaintext } = await createApiKey(UID, 'k', 'read_write', 90);
		expect(await findUserByApiKey(plaintext)).not.toBeNull();
	});
});

describe('revokeApiKey()', () => {
	it('sets revoked_at timestamp', async () => {
		const { record } = await createApiKey(UID, 'k', 'read_write');
		const ok = await revokeApiKey(UID, record.id);
		expect(ok).toBe(true);
		const row = sqlite
			.prepare('SELECT revoked_at FROM api_keys WHERE id = ?')
			.get(record.id) as any;
		expect(row.revoked_at).toBeTruthy();
	});

	it('returns false for wrong owner', async () => {
		const { record } = await createApiKey(UID, 'k', 'read_write');
		expect(await revokeApiKey('wrong_user', record.id)).toBe(false);
	});

	it('returns false for already-revoked key', async () => {
		const { record } = await createApiKey(UID, 'k', 'read_write');
		await revokeApiKey(UID, record.id);
		expect(await revokeApiKey(UID, record.id)).toBe(false);
	});
});

describe('restoreApiKey()', () => {
	it('clears revoked_at', async () => {
		const { record } = await createApiKey(UID, 'k', 'read_write');
		await revokeApiKey(UID, record.id);
		await restoreApiKey(UID, record.id);
		const row = sqlite
			.prepare('SELECT revoked_at FROM api_keys WHERE id = ?')
			.get(record.id) as any;
		expect(row.revoked_at).toBeNull();
	});
});

describe('rotateApiKey()', () => {
	it('deletes old key and creates new one with same name', async () => {
		const { record } = await createApiKey(UID, 'rotating', 'read');
		const result = await rotateApiKey(UID, record.id);
		expect(result).not.toBeNull();
		expect(result!.record.name).toBe('rotating');
		expect(result!.record.scope).toBe('read');
		const old = sqlite.prepare('SELECT id FROM api_keys WHERE id = ?').get(record.id);
		expect(old).toBeUndefined();
	});

	it('returns new plaintext token', async () => {
		const { record } = await createApiKey(UID, 'k', 'read_write');
		const result = await rotateApiKey(UID, record.id);
		expect(result!.plaintext).toMatch(/^mm_[0-9a-f]{64}$/);
	});

	it('returns null for non-existent key', async () => {
		expect(await rotateApiKey(UID, 'nonexistent')).toBeNull();
	});
});

describe('deleteApiKey()', () => {
	it('removes the key from db', async () => {
		const { record } = await createApiKey(UID, 'k', 'read_write');
		const ok = await deleteApiKey(UID, record.id);
		expect(ok).toBe(true);
		expect(sqlite.prepare('SELECT id FROM api_keys WHERE id = ?').get(record.id)).toBeUndefined();
	});

	it('returns false for wrong owner', async () => {
		const { record } = await createApiKey(UID, 'k', 'read_write');
		expect(await deleteApiKey('other', record.id)).toBe(false);
	});
});

describe('updateKeyLastUsed()', () => {
	it('sets last_used_at to current datetime', async () => {
		const { record } = await createApiKey(UID, 'k', 'read_write');
		expect(record.last_used_at).toBeNull();
		await updateKeyLastUsed(record.id);
		const row = sqlite
			.prepare('SELECT last_used_at FROM api_keys WHERE id = ?')
			.get(record.id) as any;
		expect(row.last_used_at).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
	});
});
