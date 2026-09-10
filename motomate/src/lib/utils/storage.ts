import { generateId } from './id.js';

export function attachmentStorageKey(userId: string, vehicleId: string, filename: string): string {
	const ext =
		filename
			.split('.')
			.pop()
			?.replace(/[^a-zA-Z0-9]/g, '') ?? 'bin';
	return `files/${userId}/${vehicleId}/${generateId()}.${ext}`;
}

// use sanitized title as the download filename, preserving the original extension
export function downloadFilename(name: string, title?: string | null): string {
	const clean = (title ?? '')
		.replace(/[\\/\u0000-\u001f]/g, ' ')
		.trim()
		.slice(0, 200);
	if (!clean) return name;
	const ext = name.includes('.') ? name.split('.').pop()! : '';
	return ext && !clean.toLowerCase().endsWith(`.${ext.toLowerCase()}`) ? `${clean}.${ext}` : clean;
}
