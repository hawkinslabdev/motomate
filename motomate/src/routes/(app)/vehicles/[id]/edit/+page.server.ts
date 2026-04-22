import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { and, eq } from 'drizzle-orm';
import {
	updateVehicle,
	deleteVehicle,
	getVehicleById,
	updateOdometer,
	insertOdometerLog
} from '$lib/db/repositories/vehicles.js';
import {
	recomputeTrackerStatuses,
	getTrackersByVehicle
} from '$lib/db/repositories/maintenance.js';
import { UpdateVehicleSchema } from '$lib/validators/schemas.js';
import { getStorage } from '$lib/storage/index.js';
import { generateId } from '$lib/utils/id.js';
import type { VehicleMeta } from '$lib/db/schema.js';
import { db } from '$lib/db/index.js';
import { vehicles } from '$lib/db/schema.js';
import { serverT } from '$lib/i18n/server.js';

const MAX_AVATAR_SIZE = 2 * 1024 * 1024; // 2 MB

const ALLOWED_AVATAR_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

const ALLOWED_AVATAR_EXTS = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif']);

function validateAvatarMimeType(mime: string): boolean {
	return ALLOWED_AVATAR_MIMES.has(mime.toLowerCase());
}

// Appended a unique ID to prevent browser caching when updating an avatar
function _avatarStorageKey(userId: string, vehicleId: string, ext: string): string {
	return `avatars/${userId}/${vehicleId}-${generateId()}.${ext}`;
}

// Helper to clean up repetitive try/catch logic
async function safeDeleteStorage(key: string | null | undefined): Promise<void> {
	if (!key) return;
	try {
		const storage = getStorage();
		await storage.delete(key);
	} catch (e) {
		console.error(`Storage deletion failed for key ${key}:`, e);
	}
}

export const load: PageServerLoad = async ({ locals, params, parent }) => {
	await parent();
	const trackers = await getTrackersByVehicle(params.id, locals.user!.id);
	const excluded =
		(locals.user!.settings?.page_prefs?.maintenance_report_pdf?.[params.id] as
			| string[]
			| undefined) ?? [];
	return {
		reportTrackers: trackers.map((t) => ({ id: t.id, name: t.template.name })),
		reportExcludedTrackerIds: excluded
	};
};

export const actions: Actions = {
	update: async ({ request, locals, params }) => {
		const formData = await request.formData();
		const raw = Object.fromEntries(formData);

		const purchasePrice = formData.get('purchase_price') as string;
		const soldPrice = formData.get('sold_price') as string;

		// Handle purchase/sale prices with validation
		// Empty string or explicit 0/0.00 means "no price set" (null)
		let purchasePriceCents: number | null = null;
		if (purchasePrice && purchasePrice !== '') {
			const parsed = parseFloat(purchasePrice);
			if (!isNaN(parsed) && parsed > 0 && parsed < 1000000000) {
				purchasePriceCents = Math.round(parsed * 100);
			}
			// If parsed is 0 or negative, leave as null (clearing the price)
		}

		let soldPriceCents: number | null = null;
		if (soldPrice && soldPrice !== '') {
			const parsed = parseFloat(soldPrice);
			if (!isNaN(parsed) && parsed > 0 && parsed < 1000000000) {
				soldPriceCents = Math.round(parsed * 100);
			}
			// If parsed is 0 or negative, leave as null (clearing the price)
		}

		const input = {
			...raw,
			year: Number(raw.year),
			purchase_price_cents: purchasePriceCents,
			sold_price_cents: soldPriceCents
		};

		const parsed = UpdateVehicleSchema.safeParse(input);
		if (!parsed.success) {
			return fail(400, { errors: parsed.error.flatten().fieldErrors });
		}

		await updateVehicle(params.id, locals.user!.id, parsed.data);
		return { success: true };
	},

	delete: async ({ locals, params }) => {
		await deleteVehicle(params.id, locals.user!.id);
		redirect(302, '/vehicles');
	},

	odometer: async ({ request, locals, params }) => {
		const raw = Object.fromEntries(await request.formData());
		const odometer = Number(raw.odometer);
		const locale = locals.user!.settings.locale;

		if (isNaN(odometer) || odometer < 0) {
			return fail(400, { error: await serverT('vehicle.edit.errors.invalidOdometer', locale) });
		}

		const vehicle = await getVehicleById(params.id, locals.user!.id);

		if (!vehicle || odometer <= vehicle.current_odometer) {
			return fail(400, { error: await serverT('vehicle.edit.errors.odometerTooLow', locale) });
		}

		await updateOdometer(params.id, locals.user!.id, odometer);
		await insertOdometerLog(params.id, locals.user!.id, odometer);
		await recomputeTrackerStatuses(params.id, odometer);

		return { success: true };
	},

	archive: async ({ request, locals, params }) => {
		const formData = await request.formData();
		const soldPrice = formData.get('sold_price') as string;

		// Convert sold price to cents if provided and valid
		let soldPriceCents: number | null = null;
		if (soldPrice && soldPrice !== '' && soldPrice !== '0.00') {
			const parsed = parseFloat(soldPrice);
			if (!isNaN(parsed) && parsed > 0 && parsed < 1000000000) {
				soldPriceCents = Math.round(parsed * 100);
			}
		}

		// Archive vehicle and update sold price
		await db
			.update(vehicles)
			.set({
				archived_at: new Date().toISOString(),
				sold_price_cents: soldPriceCents,
				updated_at: new Date().toISOString()
			})
			.where(and(eq(vehicles.id, params.id), eq(vehicles.user_id, locals.user!.id)));

		redirect(302, '/vehicles?archived=1');
	},

	unarchive: async ({ locals, params }) => {
		// Unarchive vehicle and reset sold price (since it's no longer sold)
		await db
			.update(vehicles)
			.set({
				archived_at: null,
				sold_price_cents: null,
				updated_at: new Date().toISOString()
			})
			.where(and(eq(vehicles.id, params.id), eq(vehicles.user_id, locals.user!.id)));

		return { unarchived: true };
	},

	updateAvatar: async ({ request, locals, params }) => {
		const user = locals.user!;
		const vehicleId = params.id;
		const formData = await request.formData();

		const emoji = String(formData.get('emoji') || '').trim() || undefined;
		const remove = formData.get('remove') === 'true';
		const file = formData.get('file') as File | null;

		const locale = user.settings.locale;
		const vehicle = await getVehicleById(vehicleId, user.id);
		if (!vehicle)
			return fail(404, { error: await serverT('vehicle.edit.errors.notFound', locale) });

		const currentMeta: VehicleMeta = vehicle.meta ?? {};
		const newMeta: VehicleMeta = { ...currentMeta };
		let newCoverKey: string | null = vehicle.cover_image_key;

		if (remove) {
			newMeta.avatar_emoji = undefined;
			await safeDeleteStorage(vehicle.cover_image_key);
			newCoverKey = null;
		} else if (file && file.size > 0) {
			if (file.size > MAX_AVATAR_SIZE) {
				return fail(400, { error: await serverT('vehicle.edit.errors.imageTooLarge', locale) });
			}

			const mime = file.type || '';
			const ext = (
				file.name
					.split('.')
					.pop()
					?.replace(/[^a-zA-Z0-9]/g, '') || ''
			).toLowerCase();

			if (!mime || !validateAvatarMimeType(mime)) {
				return fail(400, {
					error: await serverT('vehicle.edit.errors.invalidImageFormat', locale)
				});
			}

			if (!ALLOWED_AVATAR_EXTS.has(ext)) {
				return fail(400, { error: await serverT('vehicle.edit.errors.invalidFileExt', locale) });
			}

			const safeExt = ext.slice(0, 4);
			const oldKey = vehicle.cover_image_key;
			const key = `avatars/${user.id}/${vehicleId}.${safeExt}`;
			const buffer = new Uint8Array(await file.arrayBuffer());

			const MimeTypeMap: Record<string, string> = {
				jpeg: 'image/jpeg',
				jpg: 'image/jpeg',
				png: 'image/png',
				webp: 'image/webp',
				gif: 'image/gif'
			};

			try {
				const storage = getStorage();
				await storage.put(key, buffer, MimeTypeMap[safeExt] || 'image/jpeg');
			} catch (e) {
				console.error('Avatar upload failed:', e);
				return fail(500, { error: await serverT('vehicle.edit.errors.uploadFailed', locale) });
			}

			newCoverKey = key;
			newMeta.avatar_emoji = undefined; // Clear emoji when an image is successfully uploaded

			// Delete old avatar AFTER successful upload
			await safeDeleteStorage(oldKey);
		} else if (emoji) {
			newMeta.avatar_emoji = emoji;
			await safeDeleteStorage(vehicle.cover_image_key);
			newCoverKey = null;
		}

		await updateVehicle(vehicleId, user.id, {
			meta: newMeta,
			cover_image_key: newCoverKey
		});

		return { avatarUpdated: true };
	}
};
