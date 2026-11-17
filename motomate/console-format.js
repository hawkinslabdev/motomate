const STAMP = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} /;
const TAG = /^\[([A-Za-z][\w-]*)\]\s*/;
// eslint-disable-next-line no-control-regex
const HTTP = /^(\x1b\[[\d;]*m)*\d{3}(\x1b\[[\d;]*m)* [A-Z]+ /;
/** @type {Record<string, string>} */
const NAMES = { motomate: 'MotoMate', http: 'HTTP', oidc: 'OIDC', vapid: 'VAPID' };
const INSTALLED = Symbol.for('motomate.console-format');

/** @param {string} raw */
function tagName(raw) {
	const key = raw.toLowerCase();
	return NAMES[key] ?? key.charAt(0).toUpperCase() + key.slice(1);
}

/**
 * @param {string} message
 * @param {Date} [now]
 */
export function formatLogLine(message, now = new Date()) {
	const stamp = now.toLocaleString('sv');
	let text = message.replace(STAMP, '');
	let tag = 'MotoMate';
	const match = text.match(TAG);
	if (match) {
		tag = tagName(match[1]);
		text = text.slice(match[0].length);
	} else if (HTTP.test(text)) {
		tag = 'HTTP';
	}
	return `${stamp} [${tag}] ${text}`;
}

export function installConsoleFormat() {
	const target = /** @type {Console & { [INSTALLED]?: boolean }} */ (console);
	if (target[INSTALLED]) return;
	for (const method of /** @type {const} */ (['log', 'info', 'warn', 'error'])) {
		const original = console[method].bind(console);
		console[method] = (/** @type {unknown} */ first, /** @type {unknown[]} */ ...rest) =>
			typeof first === 'string'
				? original(formatLogLine(first), ...rest)
				: original(formatLogLine(''), first, ...rest);
	}
	target[INSTALLED] = true;
}
