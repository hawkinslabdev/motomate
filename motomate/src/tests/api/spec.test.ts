import { vi, describe, it, expect } from 'vitest';

vi.mock('#lib/server/url-guard.js', () => ({ assertSafeUrl: vi.fn() }));

import { GET } from '../../routes/api/spec/+server.js';
import { dispatchWebhook } from '#lib/workflow/channels/webhook.js';

async function spec() {
	return (await GET({} as any)).json();
}

describe('OpenAPI document', () => {
	it('is served as 3.2.0', async () => {
		expect((await spec()).openapi).toBe('3.2.0');
	});

	// Scalar upgrades any 3.1.x document to 3.2 on load, and that upgrade deletes x-tagGroups
	// after rewriting it to tag.kind. Staying on 3.2 skips the upgrade and keeps the sidebar groups.
	it('keeps x-tagGroups, which drives the sidebar grouping', async () => {
		const groups = (await spec())['x-tagGroups'];
		expect(groups.length).toBeGreaterThan(0);
		expect(groups.flatMap((g: { tags: string[] }) => g.tags)).toContain('Vehicles');
	});

	it('documents the webhook payload that dispatchWebhook actually sends', async () => {
		const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
		vi.stubGlobal('fetch', fetchMock);

		await dispatchWebhook('https://example.test/hook', undefined, 'Title', 'Body', 'CB500F', {
			vehicle_name: 'CB500F'
		});
		vi.unstubAllGlobals();

		const sent = JSON.parse(fetchMock.mock.calls[0][1].body);
		const documented = (await spec()).webhooks.notification.post.requestBody.content[
			'application/json'
		].schema;

		expect(Object.keys(sent).sort()).toEqual([...documented.required].sort());
		expect(sent.event).toBe(documented.properties.event.enum[0]);
	});
});
