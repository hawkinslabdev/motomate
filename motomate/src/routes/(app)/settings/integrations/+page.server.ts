import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getUserById, updateUserSettings } from '#lib/db/repositories/users.js';
import { IntegrationsSchema } from '#lib/validators/schemas.js';
import { encryptSecret, decryptSecret } from '#lib/server/secrets.js';
import { syncAll } from '#lib/server/integrations.js';
import { s3Test } from '#lib/storage/s3.js';
import { paperlessTest } from '#lib/server/paperless.js';
import { clearSystemAlert } from '#lib/workflow/channels/inapp.js';
import type { Integrations } from '#lib/db/schema.js';

async function currentIntegrations(userId: string): Promise<Integrations> {
	const user = await getUserById(userId);
	return user?.settings?.integrations ?? {};
}

export const load: PageServerLoad = async ({ locals }) => {
	const cfg = await currentIntegrations(locals.user!.id);
	return {
		s3: {
			enabled: cfg.s3?.enabled ?? false,
			endpoint: cfg.s3?.endpoint ?? '',
			region: cfg.s3?.region ?? '',
			bucket: cfg.s3?.bucket ?? '',
			access_key: cfg.s3?.access_key ?? '',
			secret_set: !!cfg.s3?.secret_key,
			last_sync_at: cfg.s3?.last_sync_at ?? null
		},
		paperless: {
			enabled: cfg.paperless?.enabled ?? false,
			url: cfg.paperless?.url ?? '',
			token_set: !!cfg.paperless?.token,
			include_reports: cfg.paperless?.include_reports ?? false,
			last_sync_at: cfg.paperless?.last_sync_at ?? null
		}
	};
};

export const actions: Actions = {
	saveS3: async ({ request, locals }) => {
		const data = await request.formData();
		const current = await currentIntegrations(locals.user!.id);
		const secret = String(data.get('secret_key') ?? '').trim();

		const raw: Integrations = {
			...current,
			s3: {
				enabled: data.get('enabled') === 'true',
				endpoint: String(data.get('endpoint') ?? '').trim(),
				region: String(data.get('region') ?? '').trim(),
				bucket: String(data.get('bucket') ?? '').trim(),
				access_key: String(data.get('access_key') ?? '').trim(),
				secret_key: secret ? encryptSecret(secret) : (current.s3?.secret_key ?? ''),
				last_sync_at: current.s3?.last_sync_at ?? null
			}
		};

		let integrations;
		try {
			integrations = IntegrationsSchema.parse(raw);
		} catch {
			return fail(400, { error: 'invalidS3' });
		}
		await updateUserSettings(locals.user!.id, { integrations });
		return { savedS3: true };
	},

	savePaperless: async ({ request, locals }) => {
		const data = await request.formData();
		const current = await currentIntegrations(locals.user!.id);
		const token = String(data.get('token') ?? '').trim();

		const raw: Integrations = {
			...current,
			paperless: {
				enabled: data.get('enabled') === 'true',
				url: String(data.get('url') ?? '').trim(),
				token: token ? encryptSecret(token) : (current.paperless?.token ?? ''),
				include_reports: data.get('include_reports') === 'on',
				last_sync_at: current.paperless?.last_sync_at ?? null
			}
		};

		let integrations;
		try {
			integrations = IntegrationsSchema.parse(raw);
		} catch {
			return fail(400, { error: 'invalidPaperless' });
		}
		await updateUserSettings(locals.user!.id, { integrations });
		return { savedPaperless: true };
	},

	// Tests the values in the form, so a connection can be checked before it is saved.
	test: async ({ request, locals }) => {
		const data = await request.formData();
		const target = String(data.get('target') ?? '');
		const current = await currentIntegrations(locals.user!.id);

		try {
			if (target === 's3') {
				const typed = String(data.get('secret_key') ?? '').trim();
				await s3Test({
					endpoint: String(data.get('endpoint') ?? '').trim() || undefined,
					region: String(data.get('region') ?? '').trim() || undefined,
					bucket: String(data.get('bucket') ?? '').trim(),
					access_key: String(data.get('access_key') ?? '').trim(),
					secret_key: typed || decryptSecret(current.s3?.secret_key)
				});
			} else {
				const typed = String(data.get('token') ?? '').trim();
				await paperlessTest({
					url: String(data.get('url') ?? '').trim(),
					token: typed || decryptSecret(current.paperless?.token)
				});
			}
		} catch (e) {
			return fail(400, {
				testTarget: target,
				testError: e instanceof Error ? e.message : 'failed'
			});
		}
		await clearSystemAlert(locals.user!.id, target);
		return { testTarget: target, testOk: true };
	},

	sync: async ({ request, locals }) => {
		const data = await request.formData();
		const summary = await syncAll(locals.user!.id, { resend: data.get('resend') === 'true' });
		return { summary };
	}
};
