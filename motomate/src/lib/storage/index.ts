import { env } from '$env/dynamic/private';
import { LocalStorageAdapter } from './local.js';
import { S3StorageAdapter } from './s3.js';
import type { StorageAdapter } from './adapter.js';

let _adapter: StorageAdapter | null = null;

export function getStorage(): StorageAdapter {
	if (_adapter) return _adapter;
	const type = (env.STORAGE_ADAPTER ?? 'local').toLowerCase();
	_adapter = type === 's3' ? new S3StorageAdapter() : new LocalStorageAdapter();
	return _adapter;
}

export type { StorageAdapter };
export { storageKey } from './adapter.js';
