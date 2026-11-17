export type PushSupport = 'supported' | 'install-first' | 'unsupported';

export function isIos(): boolean {
	return (
		/iPad|iPhone|iPod/.test(navigator.userAgent) ||
		(navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
	);
}

export function isInstalled(): boolean {
	return (
		window.matchMedia('(display-mode: standalone)').matches ||
		(navigator as Navigator & { standalone?: boolean }).standalone === true
	);
}

export function pushSupport(): PushSupport {
	if (typeof window === 'undefined') return 'unsupported';
	if ('serviceWorker' in navigator && 'PushManager' in window) return 'supported';
	return isIos() && !isInstalled() ? 'install-first' : 'unsupported';
}
