import { LocalStorageAdapter } from './local.js';

let _adapter: LocalStorageAdapter | null = null;

// Local disk is always primary. Per-user S3 mirroring lives in #lib/server/integrations.js.
export function getStorage(): LocalStorageAdapter {
	if (!_adapter) _adapter = new LocalStorageAdapter();
	return _adapter;
}
