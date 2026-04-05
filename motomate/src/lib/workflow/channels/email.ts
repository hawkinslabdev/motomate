import { env } from '$env/dynamic/private';

export async function dispatchEmail(
	toAddress: string,
	subject: string,
	body: string
): Promise<void> {
	if (!env.SMTP_HOST) {
		console.warn('[workflow] email channel: SMTP_HOST not configured, skipping');
		return;
	}

	const nodemailer = await import('nodemailer');
	const transporter = nodemailer.default.createTransport({
		host: env.SMTP_HOST,
		port: parseInt(env.SMTP_PORT ?? '587'),
		secure: env.SMTP_PORT === '465',
		auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined
	});

	await transporter.sendMail({
		from: env.SMTP_FROM ?? 'noreply@motomate.local',
		to: toAddress,
		subject,
		text: body,
		html: `<p>${body.replace(/\n/g, '<br/>')}</p>`
	});
}
