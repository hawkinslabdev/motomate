const THUMBNAIL_WIDTH = 320;
const THUMBNAIL_HEIGHT = 400;
const WEBP_QUALITY = 80;

export const SAFE_THUMBNAIL_IMAGE_TYPES = new Set([
	'image/avif',
	'image/gif',
	'image/jpeg',
	'image/png',
	'image/webp'
]);

export class UnsupportedThumbnailError extends Error {}

export function thumbnailCacheKey(userId: string, documentId: string): string {
	return `thumbnails/${userId}/${documentId}.webp`;
}

export function normalizedThumbnailMimeType(value: string | null): string {
	return (value ?? '').split(';', 1)[0].trim().toLowerCase();
}

function dimensions(width: number, height: number): { width: number; height: number } {
	const scale = Math.min(THUMBNAIL_WIDTH / width, THUMBNAIL_HEIGHT / height, 1);
	return {
		width: Math.max(1, Math.round(width * scale)),
		height: Math.max(1, Math.round(height * scale))
	};
}

export async function generateLocalThumbnail(data: Buffer, contentType: string): Promise<Buffer> {
	const normalizedType = normalizedThumbnailMimeType(contentType);
	const { createCanvas, loadImage } = await import('@napi-rs/canvas');

	if (SAFE_THUMBNAIL_IMAGE_TYPES.has(normalizedType)) {
		const image = await loadImage(data);
		const size = dimensions(image.width, image.height);
		const canvas = createCanvas(size.width, size.height);
		const context = canvas.getContext('2d');
		context.fillStyle = '#ffffff';
		context.fillRect(0, 0, size.width, size.height);
		context.drawImage(image, 0, 0, size.width, size.height);
		return canvas.encode('webp', WEBP_QUALITY);
	}

	if (normalizedType === 'application/pdf') {
		const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
		const loadingTask = getDocument({ data: new Uint8Array(data) });
		const pdf = await loadingTask.promise;
		try {
			const page = await pdf.getPage(1);
			const original = page.getViewport({ scale: 1 });
			const size = dimensions(original.width, original.height);
			const viewport = page.getViewport({ scale: size.width / original.width });
			const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
			await page.render({
				canvas: canvas as unknown as HTMLCanvasElement,
				viewport,
				background: '#ffffff'
			}).promise;
			return canvas.encode('webp', WEBP_QUALITY);
		} finally {
			await pdf.destroy();
		}
	}

	throw new UnsupportedThumbnailError(`No thumbnail renderer for ${contentType}`);
}
