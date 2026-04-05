import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';

const url = process.env.DATABASE_URL ?? './data/motomate.db';
const sqlite = new Database(url);
const db = drizzle(sqlite);

migrate(db, { migrationsFolder: './drizzle' });
console.log('Migrations applied successfully');

sqlite.close();
