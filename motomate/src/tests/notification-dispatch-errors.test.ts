import { vi, describe, it, expect, afterEach } from 'vitest';

vi.mock('#lib/server/url-guard.js', () => ({
	assertSafeUrl: vi.fn(async (u: string) => new URL(u))
}));

import { dispatchWebhook } from '#lib/workflow/channels/webhook.js';
import { dispatchHomeAssistant } from '#lib/workflow/channels/home_assistant.js';

afterEach(() => vi.unstubAllGlobals());

describe('notification dispatch errors', () => {
	it('rejects when the webhook answers with an error status', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
		await expect(
			dispatchWebhook('https://example.test/hook', undefined, 'T', 'B', '', {})
		).rejects.toThrow('HTTP 500');
	});

	it('rejects when Home Assistant answers with an error status', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));
		await expect(
			dispatchHomeAssistant('https://ha.test/api/webhook/x', 'T', 'B', '', {})
		).rejects.toThrow('HTTP 404');
	});

	it('rejects when the endpoint is unreachable', async () => {
		vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')));
		await expect(
			dispatchWebhook('https://example.test/hook', undefined, 'T', 'B', '', {})
		).rejects.toThrow('fetch failed');
	});
});
