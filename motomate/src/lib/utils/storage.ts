import { generateId } from './id.js';

export function attachmentStorageKey(userId: string, filename: string): string {
	const ext =
		filename
			.split('.')
			.pop()
			?.replace(/[^a-zA-Z0-9]/g, '') ?? 'bin';
	return `files/${userId}/${generateId()}.${ext}`;
}
