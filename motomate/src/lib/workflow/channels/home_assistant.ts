export async function dispatchHomeAssistant(
	webhookUrl: string,
	title: string,
	body: string,
	vehicleName: string,
	vars: Record<string, string | number>
): Promise<void> {
	try {
		const res = await fetch(webhookUrl, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				title,
				message: body,
				vehicle_name: vehicleName,
				data: vars
			}),
			signal: AbortSignal.timeout(5000)
		});
		if (!res.ok) {
			console.warn(`[workflow] home assistant webhook responded with ${res.status}`);
		}
	} catch (e) {
		console.error('[workflow] home assistant dispatch failed', e);
	}
}
