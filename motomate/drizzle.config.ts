import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { defineConfig } from 'drizzle-kit';

const url = process.env.DATABASE_URL ?? './data/motomate.db';
mkdirSync(dirname(url), { recursive: true });

export default defineConfig({
	schema: './src/lib/db/schema.ts',
	out: './drizzle',
	dialect: 'sqlite',
	dbCredentials: {
		url
	}
});
