import { describe, it, expect } from 'vitest';
import { formatLogLine } from '../../console-format.js';

const now = new Date(2026, 10, 17, 13, 3, 58);

describe('formatLogLine', () => {
	it('stamps and tags HTTP request lines', () => {
		expect(formatLogLine('302 GET /', now)).toBe('2026-11-17 13:03:58 [HTTP] 302 GET /');
		expect(formatLogLine('\x1b[36m200\x1b[39m GET /login', now)).toBe(
			'2026-11-17 13:03:58 [HTTP] \x1b[36m200\x1b[39m GET /login'
		);
	});

	it('normalises bracketed tags', () => {
		expect(formatLogLine('[integrations] paperless failed', now)).toBe(
			'2026-11-17 13:03:58 [Integrations] paperless failed'
		);
		expect(formatLogLine('[motomate] Starting', now)).toBe(
			'2026-11-17 13:03:58 [MotoMate] Starting'
		);
	});

	it('replaces an existing timestamp instead of doubling it', () => {
		expect(formatLogLine('2026-01-01 00:00:00 [MotoMate] Scheduler started', now)).toBe(
			'2026-11-17 13:03:58 [MotoMate] Scheduler started'
		);
	});

	it('tags untagged lines as MotoMate', () => {
		expect(formatLogLine('Storage upload failed:', now)).toBe(
			'2026-11-17 13:03:58 [MotoMate] Storage upload failed:'
		);
	});
});
