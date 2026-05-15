import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type BatchFetch = typeof import('./index').default;

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
};

const createDeferred = <T>(): Deferred<T> => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;

  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return { promise, resolve, reject };
};

const createWindowMock = (): Window => {
  const eventTarget = new EventTarget();

  return {
    addEventListener: eventTarget.addEventListener.bind(eventTarget),
    removeEventListener: eventTarget.removeEventListener.bind(eventTarget),
    dispatchEvent: eventTarget.dispatchEvent.bind(eventTarget),
  } as unknown as Window;
};

describe('batchFetch', () => {
  const originalWindow = globalThis.window;

  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();

    Object.defineProperty(globalThis, 'window', {
      value: createWindowMock(),
      configurable: true,
      writable: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();

    Object.defineProperty(globalThis, 'window', {
      value: originalWindow,
      configurable: true,
      writable: true,
    });
  });

  it('batches identical requests and resolves each caller with a cloned response', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));

    const { default: batchFetch } = (await import('./index')) as { default: BatchFetch };

    const firstPromise = batchFetch('/users', { method: 'GET' });
    const secondPromise = batchFetch('/users', { method: 'GET' });

    expect(fetchMock).toHaveBeenCalledTimes(0);

    await vi.advanceTimersByTimeAsync(500);

    const [firstResponse, secondResponse] = await Promise.all([firstPromise, secondPromise]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(firstResponse).not.toBe(secondResponse);
    expect(await firstResponse.json()).toEqual({ ok: true });
    expect(await secondResponse.json()).toEqual({ ok: true });
  });

  it('falls back to native fetch once the batched request has already been dispatched', async () => {
    const firstRequest = createDeferred<Response>();
    const secondRequest = createDeferred<Response>();

    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementationOnce(() => firstRequest.promise)
      .mockImplementationOnce(() => secondRequest.promise);

    const { default: batchFetch } = (await import('./index')) as { default: BatchFetch };

    const firstPromise = batchFetch('/users', { method: 'GET' });
    await vi.advanceTimersByTimeAsync(500);

    expect(fetchMock).toHaveBeenCalledTimes(1);

    const secondPromise = batchFetch('/users', { method: 'GET' });

    expect(fetchMock).toHaveBeenCalledTimes(2);

    const firstResponse = new Response('first');
    const secondResponse = new Response('second');

    secondRequest.resolve(secondResponse);
    firstRequest.resolve(firstResponse);

    await expect(secondPromise).resolves.toBe(secondResponse);

    const resolvedFirstResponse = await firstPromise;
    expect(await resolvedFirstResponse.text()).toBe('first');
  });

  it('rejects all batched callers when the underlying request fails', async () => {
    const error = new Error('network failed');

    const fetchMock = vi.spyOn(globalThis, 'fetch').mockRejectedValue(error);

    const { default: batchFetch } = (await import('./index')) as { default: BatchFetch };

    const firstPromise = batchFetch('/users', { method: 'GET' });
    const secondPromise = batchFetch('/users', { method: 'GET' });
    const resultsPromise = Promise.allSettled([firstPromise, secondPromise]);

    await vi.advanceTimersByTimeAsync(500);

    expect(fetchMock).toHaveBeenCalledTimes(1);

    const results = await resultsPromise;

    expect(results).toEqual([
      { status: 'rejected', reason: error },
      { status: 'rejected', reason: error },
    ]);
  });

  it('rejects aborted callers and does not dispatch fetch when all callers abort before debounce ends', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('ok'));

    const { default: batchFetch } = (await import('./index')) as { default: BatchFetch };

    const controller = new AbortController();
    const requestPromise = batchFetch('/users', {
      method: 'GET',
      signal: controller.signal,
    });

    controller.abort();

    await expect(requestPromise).rejects.toMatchObject({ name: 'AbortError' });

    await vi.advanceTimersByTimeAsync(500);

    expect(fetchMock).toHaveBeenCalledTimes(0);
  });
});
