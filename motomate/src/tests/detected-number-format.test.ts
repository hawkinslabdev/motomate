import { describe, it, expect, vi, beforeEach } from 'vitest';

const updateUserSettings = vi.fn();
vi.mock('#lib/db/repositories/users.js', () => ({ updateUserSettings }));
vi.mock('$app/env/public', () => ({ PUBLIC_DEMO_ENABLED: 'false' }));

const { load } = await import('../routes/+layout.server.js');

function run(acceptLanguage: string | null, settings: Record<string, unknown>) {
	const headers = new Headers(acceptLanguage ? { 'accept-language': acceptLanguage } : {});
	return (load as (e: unknown) => Promise<{ formatLocale: string }>)({
		locals: { user: { id: 'u1', settings: { locale: 'en', ...settings } } },
		request: new Request('http://localhost/', { headers }),
		cookies: { get: () => undefined }
	});
}

describe('detected number format', () => {
	beforeEach(() => updateUserSettings.mockClear());

	it('stores a changed browser format', async () => {
		const data = await run('en-NL', {});
		expect(updateUserSettings).toHaveBeenCalledWith('u1', { detected_number_format: 'dot' });
		expect(data.formatLocale).toBe('en-x-dot');
	});

	it('skips the write when the format is unchanged', async () => {
		await run('en-NL', { detected_number_format: 'dot' });
		expect(updateUserSettings).not.toHaveBeenCalled();
	});

	it('skips the write without an Accept-Language header', async () => {
		const data = await run(null, { detected_number_format: 'dot' });
		expect(updateUserSettings).not.toHaveBeenCalled();
		expect(data.formatLocale).toBe('en');
	});

	it('prefers the saved choice over the browser', async () => {
		const data = await run('en-NL', { number_format: 'space', detected_number_format: 'dot' });
		expect(data.formatLocale).toBe('en-x-space');
	});
});
