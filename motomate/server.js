import { handler } from './build/handler.js';
import express from 'express';
import helmet from 'helmet';

const app = express();

// Helmet CSP conflicts with SvelteKit's inline scripts, so we disable it.
// SvelteKit handles its own CSP via <meta> tags in app.html.
app.use(
	helmet({
		contentSecurityPolicy: false
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
