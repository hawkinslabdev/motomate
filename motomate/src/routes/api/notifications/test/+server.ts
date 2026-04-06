import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const TEST_TITLE = 'MotoMate test notification';
const TEST_BODY = 'This is a test from your notification settings.';

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) return json({ ok: false, error: 'Unauthorized' }, { status: 401 });

	const body = (await request.json()) as {
		channel: string;
		address?: string;
		webhookUrl?: string;
		webhookAuthHeader?: string;
		haWebhookUrl?: string;
	};
	const { channel } = body;
	const channels = locals.user.settings?.notification_channels ?? {};

	try {
		switch (channel) {
			case 'push': {
				const { dispatchPush } = await import('$lib/workflow/channels/push.js');
				await dispatchPush(locals.user.id, TEST_TITLE, TEST_BODY);
				break;
			}
			case 'email': {
				const address = body.address || channels.email?.address;
				if (!address) return json({ ok: false, error: 'No email address configured' });
				const { dispatchEmail } = await import('$lib/workflow/channels/email.js');
				await dispatchEmail(address, TEST_TITLE, TEST_BODY);
				break;
			}
			case 'webhook': {
				const url = body.webhookUrl || channels.webhook?.url;
				if (!url) return json({ ok: false, error: 'No webhook URL configured' });
				const authHeader = body.webhookAuthHeader ?? channels.webhook?.auth_header;
				const { dispatchWebhook } = await import('$lib/workflow/channels/webhook.js');
				await dispatchWebhook(url, authHeader, TEST_TITLE, TEST_BODY, '', {});
				break;
			}
			case 'home_assistant': {
				const webhookUrl = body.haWebhookUrl || channels.home_assistant?.webhook_url;
				if (!webhookUrl)
					return json({ ok: false, error: 'No Home Assistant webhook URL configured' });
				const { dispatchHomeAssistant } = await import('$lib/workflow/channels/home_assistant.js');
				await dispatchHomeAssistant(webhookUrl, TEST_TITLE, TEST_BODY, '', {});
				break;
			}
			default:
				return json({ ok: false, error: 'Unknown channel' });
		}
		return json({ ok: true });
	} catch (e) {
		const msg = e instanceof Error ? e.message : 'Unknown error';
		return json({ ok: false, error: msg });
	}
};
