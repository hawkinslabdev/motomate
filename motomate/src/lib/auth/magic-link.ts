import crypto from 'crypto';
import { db } from '../db/index.js';
import { magic_link_tokens } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { generateId } from '../utils/id.js';
import { env } from '$env/dynamic/private';

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
		where: and(
			eq(magic_link_tokens.token_hash, tokenHash),
			eq(magic_link_tokens.used_at, null as unknown as string) // not yet used
		)
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
	const appUrl = env.PUBLIC_APP_URL ?? 'http://localhost:5173';
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
			<p>Click the link below to log in (expires in 15 minutes):</p>
			<p><a href="${link}" style="background:#2563eb;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;display:inline-block;">Log in to MotoMate</a></p>
			<p style="color:#6b7280;font-size:13px;">If you didn't request this, you can ignore this email.</p>
		`
	});
}
