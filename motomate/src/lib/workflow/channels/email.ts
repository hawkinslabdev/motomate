import { env } from '$env/dynamic/private';

export async function dispatchEmail(
	toAddress: string,
	subject: string,
	body: string
): Promise<void> {
	if (!env.SMTP_HOST) {
		throw new Error('SMTP_HOST is not configured');
	}

	const nodemailer = await import('nodemailer');
	const port = parseInt(env.SMTP_PORT ?? '587');
	// SMTP_SECURE: 'true' = implicit TLS (port 465), 'false' = plaintext/STARTTLS, default auto-detects from port
	const secure = env.SMTP_SECURE !== undefined ? env.SMTP_SECURE === 'true' : port === 465;
	const transporter = nodemailer.default.createTransport({
		host: env.SMTP_HOST,
		port,
		secure,
		auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
		tls: {
			// SMTP_REJECT_UNAUTHORIZED: set to 'false' to allow self-signed certs (e.g. local mail servers)
			rejectUnauthorized: env.SMTP_REJECT_UNAUTHORIZED !== 'false'
		},
		connectionTimeout: 10_000,
		socketTimeout: 10_000
	});

	await transporter.sendMail({
		from: env.SMTP_FROM ?? 'noreply@motomate.local',
		to: toAddress,
		subject,
		text: body,
		html: `<p>${body.replace(/\n/g, '<br/>')}</p>`
	});
}
