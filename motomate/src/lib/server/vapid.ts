import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import webpush from 'web-push';
import { env } from '$env/dynamic/private';

const KEYS_PATH = join(dirname(env.DATABASE_URL ?? './data/motomate.db'), 'vapid.json');

interface VapidKeyPair {
	publicKey: string;
	privateKey: string;
}

interface VapidConfig extends VapidKeyPair {
	subject: string;
}

let cached: VapidConfig | null = null;

function loadOrGenerateKeys(): VapidKeyPair {
	if (existsSync(KEYS_PATH)) {
		try {
			const stored = JSON.parse(readFileSync(KEYS_PATH, 'utf-8'));
			if (stored.publicKey && stored.privateKey) return stored;
		} catch {
			// fall through to regenerate
		}
	}
	const generated = webpush.generateVAPIDKeys();
	try {
		mkdirSync(dirname(KEYS_PATH), { recursive: true });
		writeFileSync(KEYS_PATH, JSON.stringify(generated), { mode: 0o600 });
		console.log(`[MotoMate] Generated VAPID keys for web push, stored at ${KEYS_PATH}`);
	} catch (err) {
		console.warn(
			"[MotoMate] Couldn't persist generated VAPID keys, a new pair will be generated on service restart:",
			err
		);
	}
	return generated;
}

export function getVapidConfig(): VapidConfig {
	if (cached) return cached;

	const hasEnvKeys = Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY);

	if (!hasEnvKeys && (env.VAPID_PUBLIC_KEY || env.VAPID_PRIVATE_KEY)) {
		console.warn(
			'[MotoMate] Incomplete VAPID configuration in .env. Falling back to persistent/generated key pair.'
		);
	}

	const { publicKey, privateKey } = hasEnvKeys
		? { publicKey: env.VAPID_PUBLIC_KEY!, privateKey: env.VAPID_PRIVATE_KEY! }
		: loadOrGenerateKeys();

	cached = {
		publicKey,
		privateKey,
		subject: env.VAPID_SUBJECT || 'mailto:admin@localhost'
	};

	return cached;
}
