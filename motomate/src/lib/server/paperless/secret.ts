import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { env } from '$env/dynamic/private';

const VERSION = 'v1';

function getEncryptionKey(): Buffer {
	const configured = env.INTEGRATION_ENCRYPTION_KEY?.trim();
	if (!configured) {
		throw new Error('INTEGRATION_ENCRYPTION_KEY is required to use external integrations');
	}

	const key = /^[0-9a-f]{64}$/i.test(configured)
		? Buffer.from(configured, 'hex')
		: Buffer.from(configured, 'base64');
	if (key.length !== 32) {
		throw new Error('INTEGRATION_ENCRYPTION_KEY must decode to exactly 32 bytes');
	}
	return key;
}

export function encryptPaperlessToken(token: string): string {
	const iv = randomBytes(12);
	const cipher = createCipheriv('aes-256-gcm', getEncryptionKey(), iv);
	const ciphertext = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
	const tag = cipher.getAuthTag();
	return [
		VERSION,
		iv.toString('base64url'),
		tag.toString('base64url'),
		ciphertext.toString('base64url')
	].join('.');
}

export function decryptPaperlessToken(value: string): string {
	const [version, ivPart, tagPart, ciphertextPart, extra] = value.split('.');
	if (version !== VERSION || !ivPart || !tagPart || !ciphertextPart || extra) {
		throw new Error('Unsupported encrypted integration token');
	}

	try {
		const decipher = createDecipheriv(
			'aes-256-gcm',
			getEncryptionKey(),
			Buffer.from(ivPart, 'base64url')
		);
		decipher.setAuthTag(Buffer.from(tagPart, 'base64url'));
		return Buffer.concat([
			decipher.update(Buffer.from(ciphertextPart, 'base64url')),
			decipher.final()
		]).toString('utf8');
	} catch {
		throw new Error('Unable to decrypt integration token');
	}
}
