import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import {
	listApiKeys,
	createApiKey,
	revokeApiKey,
	rotateApiKey,
	restoreApiKey,
	deleteApiKey
} from '$lib/db/repositories/api-keys.js';
import { CreateApiKeySchema } from '$lib/validators/schemas.js';
import {
	createPaperlessIntegration,
	deletePaperlessIntegration,
	listPaperlessIntegrations,
	testPaperlessIntegration
} from '$lib/db/repositories/paperless-integrations.js';

export const load: PageServerLoad = async ({ locals }) => {
	const [keys, paperlessIntegrations] = await Promise.all([
		listApiKeys(locals.user!.id),
		listPaperlessIntegrations(locals.user!.id)
	]);
	return {
		keys,
		paperlessIntegrations,
		locale: locals.user!.settings.locale ?? 'en'
	};
};

export const actions: Actions = {
	createPaperless: async ({ request, locals }) => {
		const data = await request.formData();
		try {
			await createPaperlessIntegration(locals.user!.id, {
				name: String(data.get('name') ?? '').trim() || undefined,
				base_url: String(data.get('base_url') ?? ''),
				token: String(data.get('token') ?? ''),
				enabled: true
			});
			return { paperlessCreated: true };
		} catch (err) {
			return fail(400, {
				paperlessError: err instanceof Error ? err.message : 'Unable to connect to Paperless-ngx'
			});
		}
	},

	testPaperless: async ({ request, locals }) => {
		const data = await request.formData();
		try {
			await testPaperlessIntegration(String(data.get('integration_id') ?? ''), locals.user!.id);
			return { paperlessTested: true };
		} catch (err) {
			return fail(400, {
				paperlessError: err instanceof Error ? err.message : 'Paperless-ngx connection failed'
			});
		}
	},

	deletePaperless: async ({ request, locals }) => {
		const data = await request.formData();
		try {
			await deletePaperlessIntegration(String(data.get('integration_id') ?? ''), locals.user!.id);
			return { paperlessDeleted: true };
		} catch (err) {
			return fail(409, {
				paperlessError: err instanceof Error ? err.message : 'Unable to remove Paperless-ngx'
			});
		}
	},

	createApiKey: async ({ request, locals }) => {
		const formData = await request.formData();
		const raw = Object.fromEntries(formData);

		const parsed = CreateApiKeySchema.safeParse({
			name: raw.name,
			scope: raw.scope,
			expires_duration_days: raw.expires_duration_days || undefined
		});

		if (!parsed.success) {
			return fail(400, { error: parsed.error.issues[0]?.message ?? 'Invalid input' });
		}

		try {
			const { plaintext } = await createApiKey(
				locals.user!.id,
				parsed.data.name,
				parsed.data.scope,
				parsed.data.expires_duration_days
			);
			return { created: true, newToken: plaintext };
		} catch (err: unknown) {
			const code = (err as { code?: string })?.code;
			if (code === 'SQLITE_CONSTRAINT_UNIQUE') {
				return fail(400, { errorKey: 'settings.developer.apiKeys.errorNameTaken' });
			}
			const message = err instanceof Error ? err.message : 'Failed to create key';
			return fail(400, { error: message });
		}
	},

	revokeApiKey: async ({ request, locals }) => {
		const formData = await request.formData();
		const keyId = String(formData.get('key_id') ?? '');
		if (!keyId) return fail(400, { error: 'Missing key ID' });

		const ok = await revokeApiKey(locals.user!.id, keyId);
		if (!ok) return fail(404, { error: 'Key not found' });
		return { revoked: true };
	},

	rotateApiKey: async ({ request, locals }) => {
		const formData = await request.formData();
		const keyId = String(formData.get('key_id') ?? '');
		if (!keyId) return fail(400, { error: 'Missing key ID' });

		const result = await rotateApiKey(locals.user!.id, keyId);
		if (!result) return fail(404, { error: 'Key not found' });
		return { rotated: true, newToken: result.plaintext };
	},

	restoreApiKey: async ({ request, locals }) => {
		const formData = await request.formData();
		const keyId = String(formData.get('key_id') ?? '');
		if (!keyId) return fail(400, { error: 'Missing key ID' });

		const ok = await restoreApiKey(locals.user!.id, keyId);
		if (!ok) return fail(404, { error: 'Key not found' });
		return { restored: true };
	},

	deleteApiKey: async ({ request, locals }) => {
		const formData = await request.formData();
		const keyId = String(formData.get('key_id') ?? '');
		if (!keyId) return fail(400, { error: 'Missing key ID' });

		const ok = await deleteApiKey(locals.user!.id, keyId);
		if (!ok) return fail(404, { error: 'Key not found' });
		return { deleted: true };
	}
};
