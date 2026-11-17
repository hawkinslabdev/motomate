import { beforeNavigate } from '$app/navigation';
import { tick } from 'svelte';

function snapshot(form: HTMLFormElement): string {
	return JSON.stringify(
		[...new FormData(form)].map(([key, value]) => [
			key,
			typeof value === 'string' ? value : value.name
		])
	);
}

export function guardUnsaved(message: () => string) {
	const forms = new Map<HTMLFormElement, string>();

	beforeNavigate(({ cancel, willUnload }) => {
		const dirty = [...forms].some(([form, saved]) => snapshot(form) !== saved);
		if (dirty && (willUnload || !confirm(message()))) cancel();
	});

	return (form: HTMLFormElement) => {
		const save = () => forms.set(form, snapshot(form));
		tick().then(save);
		form.addEventListener('submit', save);
		return {
			destroy() {
				form.removeEventListener('submit', save);
				forms.delete(form);
			}
		};
	};
}
