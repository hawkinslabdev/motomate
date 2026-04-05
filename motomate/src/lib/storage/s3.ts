import {
	S3Client,
	PutObjectCommand,
	GetObjectCommand,
	DeleteObjectCommand
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { Readable } from 'stream';
import type { StorageAdapter } from './adapter.js';
import { env } from '$env/dynamic/private';

function getClient(): S3Client {
	return new S3Client({
		region: env.S3_REGION ?? 'eu-west-1',
		endpoint: env.S3_ENDPOINT || undefined,
		forcePathStyle: !!env.S3_ENDPOINT, // required for MinIO
		credentials: {
			accessKeyId: env.S3_ACCESS_KEY ?? '',
			secretAccessKey: env.S3_SECRET_KEY ?? ''
		}
	});
}

function getBucket(): string {
	return env.S3_BUCKET ?? 'motomate';
}

export class S3StorageAdapter implements StorageAdapter {
	private client: S3Client;
	private bucket: string;

	constructor() {
		this.client = getClient();
		this.bucket = getBucket();
	}

	async put(key: string, body: Buffer | Uint8Array, mime: string): Promise<void> {
		// Convert Uint8Array to Buffer if needed (S3 SDK requires Buffer)
		const data = Buffer.isBuffer(body) ? body : Buffer.from(body);
		await this.client.send(
			new PutObjectCommand({
				Bucket: this.bucket,
				Key: key,
				Body: data,
				ContentType: mime
			})
		);
	}

	async getStream(key: string): Promise<NodeJS.ReadableStream> {
		const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
		return res.Body as Readable;
	}

	async getBuffer(key: string): Promise<Buffer> {
		const stream = await this.getStream(key);
		return new Promise((resolve, reject) => {
			const chunks: Buffer[] = [];
			stream.on('data', (chunk: Buffer) => chunks.push(chunk));
			stream.on('end', () => resolve(Buffer.concat(chunks)));
			stream.on('error', reject);
		});
	}

	async delete(key: string): Promise<void> {
		await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
	}

	async presignedUrl(key: string, expiresInSeconds: number): Promise<string> {
		return getSignedUrl(this.client, new GetObjectCommand({ Bucket: this.bucket, Key: key }), {
			expiresIn: expiresInSeconds
		});
	}
}
