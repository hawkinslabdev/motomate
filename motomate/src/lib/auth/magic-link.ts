import crypto from 'crypto';
import { db } from '../db/index.js';
import { magic_link_tokens } from '../db/schema.js';
import { eq, and, isNull } from 'drizzle-orm';
import { generateId } from '../utils/id.js';
import { env } from '$env/dynamic/private';
import { env as pubEnv } from '$env/dynamic/public';

export function isSmtpConfigured(): boolean {
	return !!env.SMTP_HOST;
}

// Generate a secure random token, store its hash, return the raw token
export async function createMagicLinkToken(userId: string): Promise<string> {
	// Expire any previous unused tokens for this user
	await db.delete(magic_link_tokens).where(eq(magic_link_tokens.user_id, userId));

	const token = crypto.randomBytes(32).toString('hex'); // 64-char hex
	const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
	const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString(); // 15 min

	await db.insert(magic_link_tokens).values({
		id: generateId(),
		user_id: userId,
		token_hash: tokenHash,
		expires_at: expiresAt
	});

	return token;
}

// Verify token, mark as used, return userId or null
export async function verifyMagicLinkToken(token: string): Promise<string | null> {
	const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
	const now = new Date().toISOString();

	const record = await db.query.magic_link_tokens.findFirst({
		where: and(eq(magic_link_tokens.token_hash, tokenHash), isNull(magic_link_tokens.used_at))
	});

	if (!record) return null;
	if (record.expires_at < now) return null;

	// Mark as used
	await db
		.update(magic_link_tokens)
		.set({ used_at: now })
		.where(eq(magic_link_tokens.id, record.id));

	return record.user_id;
}

export async function sendMagicLinkEmail(email: string, token: string): Promise<void> {
	const appUrl = pubEnv.PUBLIC_APP_URL ?? 'http://localhost:5173';
	const link = `${appUrl}/magic-link?token=${token}`;

	// Lazy-import nodemailer so it only loads when needed
	const nodemailer = await import('nodemailer');

	const transporter = nodemailer.default.createTransport({
		host: env.SMTP_HOST || 'localhost',
		port: parseInt(env.SMTP_PORT ?? '587'),
		secure: env.SMTP_PORT === '465',
		auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined
	});

	await transporter.sendMail({
		from: env.SMTP_FROM ?? 'noreply@motomate.local',
		to: email,
		subject: 'Your MotoMate login link',
		text: `Click the link below to log in (expires in 15 minutes):\n\n${link}\n\nIf you didn't request this, you can ignore this email.`,
		html: `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <meta http-equiv="X-UA-Compatible" content="IE=edge">
                <title>Your MotoMate login link</title>
                <!--[if mso]>
                <style type="text/css">
                    body, table, td, a { font-family: Arial, sans-serif !important; }
                </style>
                <![endif]-->
            </head>
            <body style="margin: 0; padding: 0; width: 100% !important; -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; background-color: #f9fafb;">
                <table border="0" cellpadding="0" cellspacing="0" width="100%" role="presentation" style="table-layout: fixed;">
                    <tr>
                        <td align="center" style="padding: 40px 20px; background-color: #f9fafb;">
                            <table border="0" cellpadding="0" cellspacing="0" width="100%" role="presentation" style="max-width: 570px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
                                <tr>
                                    <td style="padding: 40px; font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 16px; line-height: 24px; color: #1f2937;">
                                        
                                        <!-- App Title Name -->
                                        <h1 style="margin: 0 0 24px 0; font-size: 24px; font-weight: 700; color: #111827; tracking: -0.025em;">MotoMate</h1>
                                        
                                        <p style="margin: 0 0 24px 0; color: #1f2937;">Click the link below to log in (expires in 15 minutes):</p>
                                        
                                        <!-- Button Block (Set to #2563eb) -->
                                        <table border="0" cellpadding="0" cellspacing="0" role="presentation" style="margin: 0 0 24px 0;">
                                            <tr>
                                                <td align="center" bgcolor="#2563eb" style="border-radius: 6px;">
                                                    <a href="${link}" target="_blank" style="background-color: #2563eb; color: #ffffff; padding: 12px 24px; border: 1px solid #2563eb; border-radius: 6px; text-decoration: none; display: inline-block; font-size: 16px; font-weight: 600; -webkit-text-size-adjust: none; mso-padding-alt: 0;">
                                                        <!--[if mso]><i style="letter-spacing: 25px; mso-font-width: -100%; mso-text-raise: 30pt;">&nbsp;</i><![endif]-->
                                                        <span style="mso-text-raise: 15pt;">Log in to MotoMate</span>
                                                        <!--[if mso]><i style="letter-spacing: 25px; mso-font-width: -100%">&nbsp;</i><![endif]-->
                                                    </a>
                                                </td>
                                            </tr>
                                        </table>

                                        <!-- Plain text link fallback for safety -->
                                        <p style="margin: 0 0 24px 0; font-size: 14px; line-height: 20px; color: #4b5563; word-break: break-all;">
                                            If the button doesn't work, copy and paste this URL into your browser:<br>
                                            <a href="${link}" target="_blank" style="color: #2563eb; text-decoration: underline;">${link}</a>
                                        </p>

                                        <hr style="border: 0; border-top: 1px solid #e5e7eb; margin: 24px 0;">
                                        
                                        <p style="margin: 0; font-size: 13px; line-height: 18px; color: #6b7280;">If you didn't request this, you can ignore this email.</p>
                                    
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                </table>
            </body>
            </html>
        `
	});
}
