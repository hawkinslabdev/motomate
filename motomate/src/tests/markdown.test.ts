import { describe, it, expect } from 'vitest';
import { renderMarkdown } from '$lib/utils/markdown.js';

describe('renderMarkdown', () => {
	it('escapes raw html blocks', () => {
		const out = renderMarkdown('<script>alert(1)</script>');
		expect(out).not.toContain('<script>');
		expect(out).toContain('&lt;script&gt;');
	});

	it('escapes inline html tags', () => {
		const out = renderMarkdown('hello <img src=x onerror=alert(1)>');
		expect(out).not.toContain('<img');
		expect(out).toContain('&lt;img');
	});

	it('drops javascript links but keeps the text', () => {
		const out = renderMarkdown('[click](javascript:alert(1))');
		expect(out).not.toContain('javascript:');
		expect(out).toContain('click');
	});

	it('drops data urls', () => {
		const out = renderMarkdown('[x](data:text/html;base64,PHNjcmlwdD4=)');
		expect(out).not.toContain('data:text/html');
	});

	it('keeps http links and opens them safely', () => {
		const out = renderMarkdown('[docs](https://example.com)');
		expect(out).toContain('href="https://example.com"');
		expect(out).toContain('rel="noopener noreferrer"');
		expect(out).toContain('target="_blank"');
	});

	it('still renders ordinary markdown', () => {
		expect(renderMarkdown('# Title')).toContain('<h1');
		expect(renderMarkdown('**bold**')).toContain('<strong>');
	});
});
