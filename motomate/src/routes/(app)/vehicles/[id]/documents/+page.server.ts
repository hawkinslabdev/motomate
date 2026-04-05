import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import {
	getDocumentsByVehicle,
	createDocument,
	deleteDocument,
	updateDocumentName
} from '$lib/db/repositories/documents.js';
import { getStorage } from '$lib/storage/index.js';
import { generateId } from '$lib/utils/id.js';

const MAX_SIZE = 10 * 1024 * 1024; // 10 MB

function storageKey(userId: string, filename: string): string {
	const ext =
		filename
			.split('.')
			.pop()
			?.replace(/[^a-zA-Z0-9]/g, '') ?? 'bin';
	const id = generateId();
	return `files/${userId}/${id}.${ext}`;
}

export const load: PageServerLoad = async ({ parent, locals }) => {
	const { vehicle } = await parent();
	const docs = await getDocumentsByVehicle(vehicle.id, locals.user!.id);
	return { docs };
};

export const actions: Actions = {
	upload: async ({ request, locals, params }) => {
		const user = locals.user!;
		const vehicleId = params.id;
		const formData = await request.formData();

		const file = formData.get('file') as File | null;
		if (!file || file.size === 0) return fail(400, { error: 'No file selected' });
		if (file.size > MAX_SIZE) return fail(400, { error: 'File too large (max 10 MB)' });

		const name = String(formData.get('name') || file.name)
			.trim()
			.slice(0, 200);
		const doc_type = String(formData.get('doc_type') || 'other');
		const expires_at = String(formData.get('expires_at') || '').trim() || undefined;

		const key = storageKey(user.id, file.name);
		const buffer = Buffer.from(await file.arrayBuffer());

		try {
			const storage = getStorage();
			await storage.put(key, buffer, file.type || 'application/octet-stream');
		} catch (e) {
			console.error('Storage upload failed:', e);
			return fail(500, { error: 'Upload failed — storage error' });
		}

		await createDocument(user.id, {
			vehicle_id: vehicleId,
			name,
			doc_type,
			storage_key: key,
			mime_type: file.type || 'application/octet-stream',
			size_bytes: file.size,
			expires_at
		});

		return { uploaded: true };
	},

	delete: async ({ request, locals }) => {
		const data = await request.formData();
		const id = String(data.get('id') ?? '');
		const storageKeyVal = String(data.get('storage_key') ?? '');
		if (!id) return fail(400, { error: 'Missing id' });
		try {
			const storage = getStorage();
			await storage.delete(storageKeyVal);
		} catch {
			/* ignore storage errors */
		}
		await deleteDocument(id, locals.user!.id);
		return { deleted: true };
	},

	rename: async ({ request, locals }) => {
		const data = await request.formData();
		const id = String(data.get('id') ?? '');
		const name = String(data.get('name') ?? '').trim();
		if (!id || !name) return fail(400, { error: 'Missing id or name' });
		await updateDocumentName(id, locals.user!.id, name);
		return { renamed: true };
	}
};
