import { createRequire } from 'module';
import type BetterSqlite3Constructor from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema.js';
import { DATABASE_URL } from '$app/env/private';

// createRequire prevents Rollup from bundling better-sqlite3; bundling inlines CJS that references __filename which crashes in ESM.
const _require = createRequire(import.meta.url);

const Database = _require('better-sqlite3') as unknown as typeof BetterSqlite3Constructor;
const dbPath = DATABASE_URL ?? './data/motomate.db';
const sqlite = new Database(dbPath);

sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');
sqlite.pragma('synchronous = NORMAL');
sqlite.pragma('cache_size = -64000');
sqlite.pragma('temp_store = MEMORY');
sqlite.pragma('busy_timeout = 5000');

export const db = drizzle(sqlite, { schema });
export { sqlite };
