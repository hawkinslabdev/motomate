import { describe, expect, it } from 'vitest';
import {
	documentContentDisposition,
	isBrowserPreviewable,
	preferredContentType
} from '$lib/documents/content.js';

describe('document browser responses', () => {
	it('renders supported documents inline unless download is explicitly requested', () => {
		expect(documentContentDisposition('service receipt.pdf', false)).toBe(
			`inline; filename="service receipt.pdf"; filename*=UTF-8''service%20receipt.pdf`
		);
		expect(documentContentDisposition('service receipt.pdf', true)).toContain('attachment;');
	});

	it('keeps unicode names while preventing header injection', () => {
		const disposition = documentContentDisposition('café\r\nreceipt.pdf', false);
		expect(disposition).toContain('filename="caf___receipt.pdf"');
		expect(disposition).toContain("filename*=UTF-8''caf%C3%A9%0D%0Areceipt.pdf");
		expect(disposition.split(';')[0]).toBe('inline');
	});

	it('previews PDFs and safe raster images but not active browser content', () => {
		expect(isBrowserPreviewable('application/pdf')).toBe(true);
		expect(isBrowserPreviewable('image/jpeg')).toBe(true);
		expect(isBrowserPreviewable('image/svg+xml')).toBe(false);
		expect(isBrowserPreviewable('text/html')).toBe(false);
	});

	it('uses stored metadata when Paperless returns a generic binary type', () => {
		expect(preferredContentType('application/octet-stream', 'application/pdf')).toBe(
			'application/pdf'
		);
		expect(
			preferredContentType('application/pdf; charset=binary', 'application/octet-stream')
		).toBe('application/pdf; charset=binary');
	});
});
