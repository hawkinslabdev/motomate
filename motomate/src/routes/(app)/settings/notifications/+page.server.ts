import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import {
	getNotifications,
	getNotificationsTotal,
	markAllRead,
	markRead
} from '$lib/workflow/channels/inapp.js';
import { updateUserSettings } from '$lib/db/repositories/users.js';
import { NotificationChannelsSchema } from '$lib/validators/schemas.js';
import type { NotificationChannels } from '$lib/db/schema.js';
import { env } from '$env/dynamic/private';

export const load: PageServerLoad = async ({ locals }) => {
	const [notifications, totalNotifications] = await Promise.all([
		getNotifications(locals.user!.id, 5),
		getNotificationsTotal(locals.user!.id)
	]);
	return {
		notifications,
		totalNotifications,
		channels: (locals.user!.settings?.notification_channels ?? {}) as NotificationChannels,
		vapidPublicKey: env.VAPID_PUBLIC_KEY ?? null,
		smtpConfigured: !!env.SMTP_HOST
	};
};

export const actions: Actions = {
	markAllRead: async ({ locals }) => {
		await markAllRead(locals.user!.id);
		return { markedAll: true };
	},

	markRead: async ({ request, locals }) => {
		const data = await request.formData();
		const id = String(data.get('id') ?? '');
		if (!id) return fail(400, { error: 'Missing notification id' });
		await markRead(id, locals.user!.id);
		return { marked: true };
	},

	saveChannels: async ({ request, locals }) => {
		const data = await request.formData();

		const raw = {
			push: { enabled: data.get('push_enabled') === 'true' },
			email: {
				enabled: data.get('email_enabled') === 'true',
				address: String(data.get('email_address') ?? '')
			},
			webhook: {
				enabled: data.get('webhook_enabled') === 'true',
				url: String(data.get('webhook_url') ?? ''),
				auth_header: String(data.get('webhook_auth_header') ?? '')
			},
			home_assistant: {
				enabled: data.get('ha_enabled') === 'true',
				webhook_url: String(data.get('ha_webhook_url') ?? '')
			}
		};

		let channels;
		try {
			channels = NotificationChannelsSchema.parse(raw);
		} catch {
			return fail(400, { error: 'Invalid channel configuration' });
		}

		await updateUserSettings(locals.user!.id, { notification_channels: channels });
		return { saved: true };
	}
};
