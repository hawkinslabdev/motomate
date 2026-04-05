import { createRequire } from 'module';
import type BetterSqlite3Constructor from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema.js';
import { env } from '$env/dynamic/private';

// Use createRequire so Rollup treats better-sqlite3 as a dynamic runtime
// require instead of bundling it. Bundling it inlines CJS code that uses
// __filename, which is not defined in ESM scope and crashes at startup.
const _require = createRequire(import.meta.url);
const Database = _require('better-sqlite3') as unknown as typeof BetterSqlite3Constructor;

const dbPath = env.DATABASE_URL ?? './data/motomate.db';

const sqlite = new Database(dbPath);

// SQLite best practices
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');
sqlite.pragma('synchronous = NORMAL');
sqlite.pragma('cache_size = -64000'); // 64MB cache
sqlite.pragma('temp_store = MEMORY');

export const db = drizzle(sqlite, { schema });
export { sqlite };
