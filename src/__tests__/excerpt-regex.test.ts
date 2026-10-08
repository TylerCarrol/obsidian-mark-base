import { runInNewContext } from 'node:vm';
import { Worker as NodeWorker } from 'node:worker_threads';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { matchExcerptRegex, REGEX_TIMEOUT_MS, REGEX_WORKER_SOURCE } from '../freeform/excerpt-regex';

class TestWorker {
	static instances: TestWorker[] = [];
	static stall = false;
	onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
	onerror: ((event: ErrorEvent) => void) | null = null;
	onmessageerror: (() => void) | null = null;
	terminate = vi.fn();

	constructor() { TestWorker.instances.push(this); }

	postMessage(data: unknown): void {
		if (TestWorker.stall) { return; }
		const self: {
			onmessage?: (event: { data: unknown }) => void;
			postMessage: (result: unknown) => void;
		} = {
			postMessage: (result) => this.onmessage?.(new MessageEvent('message', { data: result })),
		};
		runInNewContext(REGEX_WORKER_SOURCE, { self });
		self.onmessage?.({ data });
	}
}

describe('bounded excerpt regex worker', () => {
	const createObjectURL = vi.fn(() => 'blob:excerpt-test');
	const revokeObjectURL = vi.fn();

	beforeEach(() => {
		TestWorker.instances = [];
		TestWorker.stall = false;
		createObjectURL.mockClear();
		revokeObjectURL.mockClear();
		vi.stubGlobal('Worker', TestWorker);
		vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });
	});
	afterEach(() => {
		vi.useRealTimers();
		vi.unstubAllGlobals();
	});

	it('executes the actual worker source with flags, anchors, and multiline blocks', async () => {
		await expect(matchExcerptRegex(['task', 'TASK', 'other'], '^task$', 'i', new AbortController().signal)).resolves.toEqual([0, 1]);
		await expect(matchExcerptRegex(['one\nDecision\nend', 'none'], '^decision$', 'im', new AbortController().signal)).resolves.toEqual([0]);
		await expect(matchExcerptRegex(['one\nend'], 'one.*end', 's', new AbortController().signal)).resolves.toEqual([0]);
		expect(TestWorker.instances.every((worker) => worker.terminate.mock.calls.length === 1)).toBe(true);
		expect(revokeObjectURL).toHaveBeenCalledTimes(3);
	});

	it('returns an empty set for no matches and reports invalid patterns', async () => {
		await expect(matchExcerptRegex(['none'], 'task', '', new AbortController().signal)).resolves.toEqual([]);
		await expect(matchExcerptRegex(['text'], '[', '', new AbortController().signal)).rejects.toThrow('Invalid regex');
	});

	it('terminates an unresponsive worker at the exact timeout', async () => {
		vi.useFakeTimers();
		TestWorker.stall = true;
		const promise = matchExcerptRegex(['text'], '(a+)+$', '', new AbortController().signal);
		const result = expect(promise).rejects.toThrow(`exceeded ${REGEX_TIMEOUT_MS} ms`);
		await vi.advanceTimersByTimeAsync(REGEX_TIMEOUT_MS - 1);
		expect(TestWorker.instances[0]?.terminate).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(1);
		await result;
		expect(TestWorker.instances[0]?.terminate).toHaveBeenCalledOnce();
		expect(revokeObjectURL).toHaveBeenCalledOnce();
	});

	it('keeps the main thread responsive during a pathological regex in a real worker', async () => {
		let terminated: Promise<number> | undefined;
		class ThreadWorker {
			onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
			onerror: ((event: ErrorEvent) => void) | null = null;
			onmessageerror: (() => void) | null = null;
			private readonly thread = new NodeWorker(`
				const { parentPort } = require('node:worker_threads');
				const self = { postMessage: (data) => parentPort.postMessage(data) };
				${REGEX_WORKER_SOURCE}
				parentPort.on('message', (data) => self.onmessage({ data }));
			`, { eval: true });

			constructor() {
				this.thread.on('message', (data: unknown) =>
					this.onmessage?.(new MessageEvent('message', { data })));
				this.thread.on('error', (error) =>
					this.onerror?.(new ErrorEvent('error', { message: error.message })));
			}
			postMessage(data: unknown): void { this.thread.postMessage(data); }
			terminate(): void { terminated = this.thread.terminate(); }
		}
		vi.stubGlobal('Worker', ThreadWorker);
		const promise = matchExcerptRegex(['a'.repeat(30000) + '!'], '(a+)+$', '', new AbortController().signal);
		const result = expect(promise).rejects.toThrow(`exceeded ${REGEX_TIMEOUT_MS} ms`);
		await new Promise<void>((resolve) => window.setTimeout(resolve, 20));
		expect(terminated).toBeUndefined();
		await result;
		expect(terminated).toBeDefined();
		await terminated;
		expect(revokeObjectURL).toHaveBeenCalledOnce();
	});

	it('cancels work and does not create a worker for an aborted request', async () => {
		TestWorker.stall = true;
		const controller = new AbortController();
		const promise = matchExcerptRegex(['text'], 'a', '', controller.signal);
		controller.abort();
		await expect(promise).rejects.toThrow('cancelled');
		expect(TestWorker.instances[0]?.terminate).toHaveBeenCalledOnce();
		await expect(matchExcerptRegex([], 'a', '', controller.signal)).rejects.toThrow('cancelled');
		expect(TestWorker.instances).toHaveLength(1);
	});

	it('reports worker startup errors without a synchronous fallback', async () => {
		vi.stubGlobal('Worker', class { constructor() { throw new Error('Blocked by runtime'); } });
		await expect(matchExcerptRegex(['text'], 'a', '', new AbortController().signal)).rejects.toThrow('Blocked by runtime');
		expect(revokeObjectURL).toHaveBeenCalledOnce();
	});

	it.each(['invalid-result', 'worker-error', 'message-error', 'send-error'])('reports %s and cleans up', async (failure) => {
		TestWorker.stall = true;
		if (failure === 'send-error') {
			vi.spyOn(TestWorker.prototype, 'postMessage').mockImplementationOnce(() => { throw new Error('send error'); });
		}
		const promise = matchExcerptRegex(['text'], 'a', '', new AbortController().signal);
		const worker = TestWorker.instances[0];
		if (!worker) { throw new Error('Missing worker'); }
		if (failure === 'invalid-result') {
			worker.onmessage?.(new MessageEvent('message', { data: { indices: [5] } }));
		} else if (failure === 'worker-error') {
			worker.onerror?.(new ErrorEvent('error', { message: 'worker error' }));
		} else if (failure === 'message-error') {
			worker.onmessageerror?.();
		}
		await expect(promise).rejects.toThrow();
		expect(worker.terminate).toHaveBeenCalledOnce();
		expect(revokeObjectURL).toHaveBeenCalledOnce();
	});
});
