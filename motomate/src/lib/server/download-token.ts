import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '$env/dynamic/private';

const TTL_MS = 15 * 60 * 1000;

interface TokenPayload {
	uid: string;
	fmt: 'json' | 'zip';
	exp: number;
}

function secret(): string {
	return env.AUTH_SECRET!;
}

export function createDownloadToken(userId: string, format: 'json' | 'zip'): string {
	const payload: TokenPayload = { uid: userId, fmt: format, exp: Date.now() + TTL_MS };
	const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
	const sig = createHmac('sha256', secret()).update(encoded).digest('hex').slice(0, 32);
	return `${encoded}.${sig}`;
}

export function verifyDownloadToken(token: string): TokenPayload | null {
	const dot = token.lastIndexOf('.');
	if (dot === -1) return null;
	const encoded = token.slice(0, dot);
	const sig = token.slice(dot + 1);
	const expected = createHmac('sha256', secret()).update(encoded).digest('hex').slice(0, 32);
	if (sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected)))
		return null;
	try {
		const data = JSON.parse(Buffer.from(encoded, 'base64url').toString()) as TokenPayload;
		if (Date.now() > data.exp) return null;
		return data;
	} catch {
		return null;
	}
}

export function tokenExpiresAt(token: string): string | null {
	const dot = token.lastIndexOf('.');
	if (dot === -1) return null;
	try {
		const data = JSON.parse(
			Buffer.from(token.slice(0, dot), 'base64url').toString()
		) as TokenPayload;
		return new Date(data.exp).toISOString();
	} catch {
		return null;
	}
}
