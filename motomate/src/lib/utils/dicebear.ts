import { Avatar, Style } from '@dicebear/core';

const loaders = {
	'fun-emoji': () => import('@dicebear/styles/fun-emoji.json'),
	cameo: () => import('@dicebear/styles/cameo.json'),
	clay: () => import('@dicebear/styles/clay.json'),
	critters: () => import('@dicebear/styles/critters.json'),
	'big-ears-neutral': () => import('@dicebear/styles/big-ears-neutral.json'),
	moods: () => import('@dicebear/styles/moods.json'),
	thumbs: () => import('@dicebear/styles/thumbs.json'),
	sprouts: () => import('@dicebear/styles/sprouts.json')
};

export type AvatarStyle = keyof typeof loaders;
export const AVATAR_STYLES = Object.keys(loaders) as AvatarStyle[];
export const DEFAULT_AVATAR_STYLE: AvatarStyle = 'fun-emoji';

function isAvatarStyle(value: string): value is AvatarStyle {
	return Object.hasOwn(loaders, value);
}

/** Stored as "style:seed"; a bare seed is fun-emoji. */
export function parseAvatarSeed(value: string): { style: AvatarStyle; seed: string } {
	const i = value.indexOf(':');
	const prefix = i > 0 ? value.slice(0, i) : '';
	return isAvatarStyle(prefix)
		? { style: prefix, seed: value.slice(i + 1) }
		: { style: DEFAULT_AVATAR_STYLE, seed: value };
}

export function isValidAvatarSeed(value: string): boolean {
	const i = value.indexOf(':');
	return i < 0 || isAvatarStyle(value.slice(0, i));
}

const styles = new Map<AvatarStyle, Promise<Style>>();

function loadStyle(name: AvatarStyle): Promise<Style> {
	let style = styles.get(name);
	if (!style) {
		style = loaders[name]().then((m) => new Style(m.default));
		styles.set(name, style);
	}
	return style;
}

/** Returns an SVG data URI for an image src. */
export async function dicebearUri(value: string): Promise<string> {
	const { style, seed } = parseAvatarSeed(value);
	return new Avatar(await loadStyle(style), { seed, size: 128 }).toDataUri();
}

export function randomAvatarSeed(): string {
	const style = AVATAR_STYLES[Math.floor(Math.random() * AVATAR_STYLES.length)];
	return `${style}:${randomSeed()}`;
}

/** Cryptographically random seed, works in browser and Node 19+. */
export function randomSeed(): string {
	const arr = new Uint8Array(12);
	globalThis.crypto.getRandomValues(arr);
	return Array.from(arr, (b) => b.toString(36)).join('');
}
