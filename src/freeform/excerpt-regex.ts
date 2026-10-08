export const REGEX_TIMEOUT_MS = 1000;

export const REGEX_WORKER_SOURCE = `
self.onmessage = ({ data }) => {
	try {
		const regex = new RegExp(data.pattern, data.flags);
		const indices = [];
		for (let index = 0; index < data.units.length; index++) {
			if (regex.test(data.units[index])) indices.push(index);
		}
		self.postMessage({ indices });
	} catch (error) {
		self.postMessage({ error: error instanceof Error ? error.message : String(error) });
	}
};
`;

export function matchExcerptRegex(
	units: string[],
	pattern: string,
	flags: string,
	signal: AbortSignal,
): Promise<number[]> {
	return new Promise((resolve, reject) => {
		if (signal.aborted) {
			reject(new Error('Excerpt selection was cancelled.'));
			return;
		}
		let worker: Worker;
		let url: string;
		try {
			url = URL.createObjectURL(new Blob([REGEX_WORKER_SOURCE], { type: 'text/javascript' }));
			try {
				worker = new Worker(url);
			} catch (error) {
				URL.revokeObjectURL(url);
				throw error;
			}
		} catch (error) {
			reject(new Error(`Unable to start the regex worker: ${error instanceof Error ? error.message : String(error)}`));
			return;
		}
		let settled = false;
		const finish = (error?: Error, indices?: number[]) => {
			if (settled) {
				return;
			}
			settled = true;
			window.clearTimeout(timer);
			signal.removeEventListener('abort', abort);
			worker.terminate();
			URL.revokeObjectURL(url);
			if (error) {
				reject(error);
			} else if (indices) {
				resolve(indices);
			} else {
				reject(new Error('The regex worker returned no result.'));
			}
		};
		const abort = () => finish(new Error('Excerpt selection was cancelled.'));
		const timer = window.setTimeout(
			() => finish(new Error(`Regex selection exceeded ${REGEX_TIMEOUT_MS} ms. Use a simpler pattern.`)),
			REGEX_TIMEOUT_MS,
		);
		signal.addEventListener('abort', abort, { once: true });
		worker.onmessage = (event: MessageEvent<unknown>) => {
			const data = event.data;
			if (typeof data !== 'object' || data === null) {
				finish(new Error('The regex worker returned an invalid result.'));
			} else if ('error' in data && typeof data.error === 'string') {
				finish(new Error(`Invalid regex: ${data.error}`));
			} else if (
				'indices' in data && Array.isArray(data.indices) &&
				data.indices.every((index: unknown) => typeof index === 'number' &&
					Number.isInteger(index) && index >= 0 && index < units.length)
			) {
				finish(undefined, data.indices);
			} else {
				finish(new Error('The regex worker returned an invalid result.'));
			}
		};
		worker.onerror = (event) => {
			event.preventDefault();
			finish(new Error(`Regex worker error: ${event.message}`));
		};
		worker.onmessageerror = () => finish(new Error('Unable to read the regex worker result.'));
		try {
			worker.postMessage({ units, pattern, flags });
		} catch (error) {
			finish(new Error(`Unable to send the regex request: ${error instanceof Error ? error.message : String(error)}`));
		}
	});
}
