import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { updateUserSettings, migrateUserCurrency } from '$lib/db/repositories/users.js';
import { getStorage } from '$lib/storage/index.js';
import { mirrorPut, mirrorDelete } from '$lib/server/integrations.js';
import type { UserSettings } from '$lib/db/schema.js';
import type { OdometerUnit } from '$lib/utils/measurement.js';

const MAX_AVATAR_SIZE = 2 * 1024 * 1024; // 2 MB
const ALLOWED_AVATAR_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const ALLOWED_AVATAR_EXTS = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif']);

const MIME_MAP: Record<string, string> = {
	jpeg: 'image/jpeg',
	jpg: 'image/jpeg',
	png: 'image/png',
	webp: 'image/webp',
	gif: 'image/gif'
};

async function safeDeleteStorage(key: string | null | undefined): Promise<void> {
	if (!key) return;
	try {
		await getStorage().delete(key);
	} catch (e) {
		console.error(`Storage deletion failed for key ${key}:`, e);
	}
}

export const load: PageServerLoad = async ({ locals }) => {
	return { user: locals.user! };
};

export const actions: Actions = {
	savePrefs: async ({ request, locals }) => {
		const formData = await request.formData();
		const data = Object.fromEntries(formData);
		const patch: Partial<UserSettings> = {};
		if ('theme' in data) patch.theme = data.theme as 'system' | 'light' | 'dark';
		if ('currency' in data) patch.currency = String(data.currency);
		if ('odometer_unit' in data) patch.odometer_unit = data.odometer_unit as OdometerUnit;
		if ('locale' in data) patch.locale = String(data.locale);
		if ('display_name' in data) patch.display_name = String(data.display_name).trim() || null;

		if (patch.currency && patch.currency !== (locals.user!.settings?.currency ?? 'EUR') && data.migrate_currency === 'true') {
			await migrateUserCurrency(locals.user!.id, patch.currency);
		}

		await updateUserSettings(locals.user!.id, patch);
		return { savedPrefs: true };
	},

	uploadAvatar: async ({ request, locals }) => {
		const user = locals.user!;
		const formData = await request.formData();
		const remove = formData.get('remove') === 'true';
		const file = formData.get('file') as File | null;

		const currentKey = user.settings.avatar_key ?? null;

		if (remove) {
			await safeDeleteStorage(currentKey);
			await updateUserSettings(user.id, { avatar_key: null });
			return { avatarUpdated: true };
		}

		if (!file || file.size === 0) {
			return fail(400, { avatarError: 'No file provided' });
		}

		if (file.size > MAX_AVATAR_SIZE) {
			return fail(400, { avatarError: 'Image too large (max 2 MB)' });
		}

		const mime = file.type || '';
		const ext = (
			file.name
				.split('.')
				.pop()
				?.replace(/[^a-zA-Z0-9]/g, '') || ''
		).toLowerCase();

		if (!mime || !ALLOWED_AVATAR_MIMES.has(mime.toLowerCase())) {
			return fail(400, { avatarError: 'Invalid image format. Supported: JPEG, PNG, WebP, GIF' });
		}

		if (!ALLOWED_AVATAR_EXTS.has(ext)) {
			return fail(400, {
				avatarError: 'Invalid file extension. Supported: .jpg, .jpeg, .png, .webp, .gif'
			});
		}

		const safeExt = ext.slice(0, 4);
		const key = `avatars/users/${user.id}.${safeExt}`;
		const buffer = new Uint8Array(await file.arrayBuffer());

		try {
			await getStorage().put(key, buffer, MIME_MAP[safeExt] || 'image/jpeg');
		} catch (e) {
			console.error('User avatar upload failed:', e);
			return fail(500, { avatarError: 'Upload failed — storage error' });
		}

		mirrorPut(user.id, key, MIME_MAP[safeExt] || 'image/jpeg');

		// Delete old avatar after successful upload (different ext = different key)
		if (currentKey && currentKey !== key) {
			await safeDeleteStorage(currentKey);
			mirrorDelete(user.id, currentKey);
		}

		await updateUserSettings(user.id, { avatar_key: key });
		return { avatarUpdated: true };
	},

	setDiceBearSeed: async ({ request, locals }) => {
		const user = locals.user!;
		const seed = String((await request.formData()).get('seed') ?? '').trim();
		if (!seed || seed.length > 64) return fail(400, { avatarError: 'Invalid seed' });
		// Clear uploaded image when switching to DiceBear
		const currentKey = user.settings.avatar_key ?? null;
		if (currentKey) {
			await safeDeleteStorage(currentKey);
		}
		await updateUserSettings(user.id, { avatar_seed: seed, avatar_key: null });
		return { avatarUpdated: true };
	}
};
