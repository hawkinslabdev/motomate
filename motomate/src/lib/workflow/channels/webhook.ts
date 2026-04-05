export async function dispatchWebhook(
	url: string,
	authHeader: string | undefined,
	title: string,
	body: string,
	vehicleName: string,
	vars: Record<string, string | number>
): Promise<void> {
	const headers: Record<string, string> = { 'Content-Type': 'application/json' };
	if (authHeader) headers['Authorization'] = authHeader;

	try {
		const res = await fetch(url, {
			method: 'POST',
			headers,
			body: JSON.stringify({
				event: 'motomate_notification',
				title,
				body,
				vehicle_name: vehicleName,
				timestamp: new Date().toISOString(),
				data: vars
			}),
			signal: AbortSignal.timeout(5000)
		});
		if (!res.ok) {
			console.warn(`[workflow] webhook responded with ${res.status}: ${url}`);
		}
	} catch (e) {
		console.error('[workflow] webhook dispatch failed', e);
	}
}
