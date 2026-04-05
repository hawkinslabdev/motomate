import { writable } from 'svelte/store';

export type ToastType = 'success' | 'error' | 'info';

export interface Toast {
	id: string;
	type: ToastType;
	message: string;
	duration?: number;
}

function createToastStore() {
	const { subscribe, update } = writable<Toast[]>([]);

	function add(message: string, type: ToastType = 'info', duration?: number) {
		const id = Math.random().toString(36).slice(2);
		// Default durations: 5s for success (data saved), 4s for info, no auto-dismiss for errors
		const defaultDuration = type === 'success' ? 5000 : type === 'info' ? 4000 : 0;
		update((ts) => [...ts, { id, type, message, duration: duration ?? defaultDuration }]);
		if (duration !== 0) {
			setTimeout(() => remove(id), duration ?? defaultDuration);
		}
	}

	function remove(id: string) {
		update((ts) => ts.filter((t) => t.id !== id));
	}

	return {
		subscribe,
		add,
		remove,
		success: (m: string, duration?: number) => add(m, 'success', duration),
		error: (m: string, duration?: number) => add(m, 'error', duration),
		info: (m: string, duration?: number) => add(m, 'info', duration)
	};
}

export const toasts = createToastStore();
