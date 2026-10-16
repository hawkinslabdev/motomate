let internalDrag = false;

if (typeof document !== 'undefined') {
	document.addEventListener('dragstart', () => (internalDrag = true));
	document.addEventListener('dragend', () => (internalDrag = false));
}

// Firefox on Linux can report OS file drags as text/uri-list until drop
export function isFileDrag(e: DragEvent): boolean {
	return (e.dataTransfer?.types.includes('Files') ?? false) || !internalDrag;
}

// dragleave is unreliable in Firefox; clear once dragover stops firing
export function dragFlag(set: (value: boolean) => void, ms = 600) {
	let timer: ReturnType<typeof setTimeout> | undefined;
	return {
		on() {
			set(true);
			clearTimeout(timer);
			timer = setTimeout(() => set(false), ms);
		},
		off() {
			clearTimeout(timer);
			set(false);
		}
	};
}
