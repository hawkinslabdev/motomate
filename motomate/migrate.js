import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { mkdirSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

export function runMigrations({ logger = console.log } = {}) {
	const url = process.env.DATABASE_URL ?? './data/motomate.db';
	mkdirSync(dirname(url), { recursive: true });
	const sqlite = new Database(url);

	try {
		const db = drizzle(sqlite);
		migrate(db, { migrationsFolder: './drizzle' });
		logger('Migrations applied successfully');
	} finally {
		sqlite.close();
	}
}

const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (isDirectRun) {
	try {
		runMigrations();
	} catch (err) {
		console.error('Migration failed; database schema is not current.');
		console.error(err);
		process.exitCode = 1;
	}
}
