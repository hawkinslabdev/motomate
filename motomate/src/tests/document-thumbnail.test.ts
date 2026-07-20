import { describe, expect, it } from 'vitest';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { createCanvas } from '@napi-rs/canvas';
import {
	generateLocalThumbnail,
	thumbnailCacheKey,
	UnsupportedThumbnailError
} from '$lib/documents/thumbnail.js';

describe('document thumbnails', () => {
	it('uses a private deterministic cache key', () => {
		expect(thumbnailCacheKey('user-1', 'document-1')).toBe('thumbnails/user-1/document-1.webp');
	});

	it('renders the first page of a PDF as WebP', async () => {
		const pdf = await PDFDocument.create();
		const page = pdf.addPage([612, 792]);
		const font = await pdf.embedFont(StandardFonts.Helvetica);
		page.drawText('MotoMate', { x: 72, y: 720, size: 24, font });

		const thumbnail = await generateLocalThumbnail(
			Buffer.from(await pdf.save()),
			'application/pdf'
		);
		expect(thumbnail.subarray(0, 4).toString()).toBe('RIFF');
		expect(thumbnail.length).toBeGreaterThan(100);
	});

	it('resizes raster images instead of returning the full original', async () => {
		const original = createCanvas(800, 600);
		const context = original.getContext('2d');
		context.fillStyle = '#c23b22';
		context.fillRect(0, 0, 800, 600);
		const png = await original.encode('png');

		const thumbnail = await generateLocalThumbnail(png, 'image/png');
		expect(thumbnail.subarray(0, 4).toString()).toBe('RIFF');
		expect(thumbnail.length).toBeLessThan(png.length);
	});

	it('rejects active or unsupported content types', async () => {
		await expect(
			generateLocalThumbnail(Buffer.from('<svg/>'), 'image/svg+xml')
		).rejects.toBeInstanceOf(UnsupportedThumbnailError);
	});
});
