import express from 'express';
import helmet from 'helmet';
import tls from 'node:tls';
import { X509Certificate } from 'node:crypto';
import { runMigrations } from './migrate.js';

// shortcut: distrusts eMudhra emSign roots (CVE-2026-114406), we can later remove this if Node's bundled store excludes them
tls.setDefaultCACertificates(
	tls.getCACertificates('default').filter((pem) => !/emSign/i.test(new X509Certificate(pem).subject))
);

try {
	console.log('[motomate] Applying database migrations before startup...');
	runMigrations({ logger: (message) => console.log(`[motomate] ${message}`) });
} catch (err) {
	console.error('[motomate] Database migration failed; startup aborted before serving requests.');
	console.error(err);
	process.exit(1);
}

if (process.env.PUBLIC_DEMO_ENABLED === 'true') {
	const { seedDemo } = await import('./demo-seed.js');
	await seedDemo();
}

// adapter-node defaults to 512K, too small for uploads; must be set before handler.js loads it
process.env.BODY_SIZE_LIMIT ??= '20971520';

const { handler } = await import('./build/handler.js');

const app = express();

// 'unsafe-inline' is needed by SvelteKit's bootstrap; upgrade-insecure-requests stays off or plain-HTTP LAN installs breaks
app.use(
	helmet({
		referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
		contentSecurityPolicy: {
			useDefaults: false,
			directives: {
				'default-src': ["'self'"],
				'script-src': ["'self'", "'unsafe-inline'"],
				'style-src': ["'self'", "'unsafe-inline'"],
				'img-src': ["'self'", 'data:', 'blob:', 'https://*.tile.openstreetmap.org'],
				'font-src': ["'self'", 'data:'],
				'connect-src': ["'self'"],
				'worker-src': ["'self'", 'blob:'],
				'manifest-src': ["'self'"],
				'object-src': ["'none'"],
				'base-uri': ["'self'"],
				'form-action': ["'self'"],
				'frame-ancestors': ["'none'"]
			}
		}
	})
);

const allowedOrigins = process.env.PUBLIC_APP_ORIGINS
	? process.env.PUBLIC_APP_ORIGINS.split(',')
	: ['http://localhost:5173'];

const appUrl = process.env.PUBLIC_APP_URL ?? 'http://localhost:5173';

// Create origin matcher that handles both with and without ports
function isOriginAllowed(origin) {
	if (!origin) return false;

	for (const allowed of allowedOrigins) {
		// Exact match
		if (origin === allowed) return true;

		// Match without port (e.g., http://localhost matches http://localhost:5173)
		try {
			const originUrl = new URL(origin);
			const allowedUrl = new URL(allowed);
			if (
				originUrl.protocol === allowedUrl.protocol &&
				originUrl.hostname === allowedUrl.hostname
			) {
				return true;
			}
		} catch {
			// Invalid URL, skip
		}
	}
	return false;
}

app.use((req, res, next) => {
	const origin = req.headers.origin;
	if (origin && isOriginAllowed(origin)) {
		res.setHeader('Access-Control-Allow-Origin', origin);
		res.setHeader('Access-Control-Allow-Credentials', 'true');
		res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
		res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
	}
	if (req.method === 'OPTIONS') {
		return res.sendStatus(204);
	}
	next();
});

app.use(handler);

const port = process.env.PORT ?? 3000;

console.log('[motomate] Starting MotoMate...');
console.log(`[motomate] App URL: ${appUrl}`);
console.log(`[motomate] Configured allowed origins: ${allowedOrigins.join(', ')}`);
console.log(`[motomate] Listening on http://localhost:${port}`);

app.listen(port);
