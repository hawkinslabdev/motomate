import { createAvatar } from '@dicebear/core';
import { funEmoji } from '@dicebear/collection';

/** Returns a data URI (data:image/svg+xml;base64,…) for use in <img src>. */
export function dicebearUri(seed: string): string {
	return createAvatar(funEmoji, { seed, size: 128 }).toDataUri();
}

/** Cryptographically random seed, works in browser and Node 19+. */
export function randomSeed(): string {
	const arr = new Uint8Array(12);
	globalThis.crypto.getRandomValues(arr);
	return Array.from(arr, (b) => b.toString(36)).join('');
}
