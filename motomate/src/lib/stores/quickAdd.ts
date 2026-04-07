import { writable } from 'svelte/store';

interface QuickAddState {
	open: boolean;
	vehicleId: string | null;
	entryType: 'service' | 'odometer' | 'note' | null;
}

function createQuickAddStore() {
	const { subscribe, set, update } = writable<QuickAddState>({
		open: false,
		vehicleId: null,
		entryType: null
	});

	function open(vehicleId: string, entryType: 'service' | 'odometer' | 'note' = 'service') {
		set({ open: true, vehicleId, entryType });
	}

	function close() {
		set({ open: false, vehicleId: null, entryType: null });
	}

	function toggle(vehicleId: string) {
		update((s) => {
			if (s.open && s.vehicleId === vehicleId) {
				return { open: false, vehicleId: null, entryType: null };
			}
			return { open: true, vehicleId, entryType: 'service' };
		});
	}

	return {
		subscribe,
		open,
		close,
		toggle,
		set
	};
}

export const quickAdd = createQuickAddStore();