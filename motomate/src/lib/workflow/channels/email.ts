import {
	SMTP_HOST,
	SMTP_PORT,
	SMTP_SECURE,
	SMTP_USER,
	SMTP_PASS,
	SMTP_REJECT_UNAUTHORIZED,
	SMTP_FROM
} from '$app/env/private';

export async function dispatchEmail(
	toAddress: string,
	subject: string,
	body: string
): Promise<void> {
	if (!SMTP_HOST) {
		throw new Error('SMTP_HOST is not configured');
	}

	const nodemailer = await import('nodemailer');
	const port = parseInt(SMTP_PORT ?? '587');
	// SMTP_SECURE: 'true' = implicit TLS (port 465), 'false' = plaintext/STARTTLS, default auto-detects from port
	const secure = SMTP_SECURE !== undefined ? SMTP_SECURE === 'true' : port === 465;
	const transporter = nodemailer.default.createTransport({
		host: SMTP_HOST,
		port,
		secure,
		auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
		tls: {
			// SMTP_REJECT_UNAUTHORIZED: set to 'false' to allow self-signed certs (e.g. local mail servers)
			rejectUnauthorized: SMTP_REJECT_UNAUTHORIZED !== 'false'
		},
		connectionTimeout: 10_000,
		socketTimeout: 10_000
	});

	await transporter.sendMail({
		from: SMTP_FROM ?? 'noreply@motomate.local',
		to: toAddress,
		subject,
		text: body,
		html: `<p>${body.replace(/\n/g, '<br/>')}</p>`
	});
}
