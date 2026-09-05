import type { Component } from 'svelte';

class SheetStore {
	open = $state(false);
	formComponent = $state<Component<any> | undefined>(undefined);
	formData = $state<unknown>(undefined);
	title = $state('');
	hint = $state('');
	wide = $state(false);

	openSheet(component: Component<any>, title: string, data?: unknown, wide = false, hint = '') {
		this.formComponent = component;
		this.formData = data;
		this.title = title;
		this.hint = hint;
		this.wide = wide;
		this.open = true;
	}

	closeSheet(callback?: () => void) {
		this.open = false;
		this.formComponent = undefined;
		this.formData = undefined;
		this.title = '';
		this.hint = '';
		this.wide = false;
		callback?.();
	}
}

export const sheet = new SheetStore();
