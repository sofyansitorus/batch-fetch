import type {
  BatchFetchThenDetail,
  BatchFetchCatchDetail,
  RequestCounter,
  RequestPayload,
} from './types';

import { isPlainObject } from './utils';

const requestPayload = new Map<string, RequestPayload>();
const requestCounter = new Map<string, RequestCounter>();
const requestDebounce = new Map<string, ReturnType<typeof setTimeout>>();
const requestSignals = new Map<string, AbortController>();

const createBatchId = (url: string, options: RequestInit): string => {
  let nextCircularRefId = 0;
  const circularRefs = new WeakMap<object, number>();

  const serialize = (value: unknown): string => {
    if (value === null) {
      return 'null';
    }

    if (value === undefined) {
      return 'undefined';
    }

    if (typeof value === 'string') {
      return `string:${JSON.stringify(value)}`;
    }

    if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
      return `${typeof value}:${String(value)}`;
    }

    if (typeof value === 'symbol') {
      return `symbol:${String(value)}`;
    }

    if (typeof value === 'function') {
      return 'function';
    }

    if (Array.isArray(value)) {
      return `[${value.map((item) => serialize(item)).join(',')}]`;
    }

    if (value instanceof Date) {
      return `date:${value.toISOString()}`;
    }

    if (value instanceof URLSearchParams) {
      return `urlSearchParams:${JSON.stringify(Array.from(value.entries()).sort(([a], [b]) => a.localeCompare(b)))}`;
    }

    if (value instanceof Headers) {
      return `headers:${JSON.stringify(Array.from(value.entries()).sort(([a], [b]) => a.localeCompare(b)))}`;
    }

    if (typeof Blob !== 'undefined' && value instanceof Blob) {
      return `blob:${value.type}:${value.size}`;
    }

    if (typeof FormData !== 'undefined' && value instanceof FormData) {
      const formDataEntries = Array.from(value.entries()).map(([key, formDataValue]) => {
        if (typeof File !== 'undefined' && formDataValue instanceof File) {
          return [
            key,
            `file:${formDataValue.name}:${formDataValue.type}:${formDataValue.size}`,
          ] as const;
        }

        return [key, formDataValue] as const;
      });

      formDataEntries.sort(([a], [b]) => a.localeCompare(b));

      return `formData:${JSON.stringify(formDataEntries)}`;
    }

    if (typeof value === 'object') {
      if (circularRefs.has(value)) {
        return `circularRef:${circularRefs.get(value)}`;
      }

      circularRefs.set(value, nextCircularRefId);
      nextCircularRefId += 1;

      if (!isPlainObject(value)) {
        return `object:${value.constructor?.name ?? 'Object'}`;
      }

      const keys = Object.keys(value).sort((a, b) => a.localeCompare(b));
      const serializedEntries = keys.map(
        (key) => `${JSON.stringify(key)}:${serialize(value[key])}`,
      );

      return `{${serializedEntries.join(',')}}`;
    }

    return String(value);
  };

  return `${url}::${serialize(options)}`;
};

const incrementRequestCounter = (batchId: string, itemType: keyof RequestCounter): void => {
  const counter = requestCounter.get(batchId);

  if (!counter) {
    return;
  }

  counter[itemType] += 1;
};

const isRequestCounterMax = (
  batchId: string,
  itemType: keyof Omit<RequestCounter, 'registered'>,
): boolean => {
  const counter = requestCounter.get(batchId);
  const registeredCount = counter?.registered;

  if (!registeredCount) {
    return false;
  }

  return registeredCount === counter?.[itemType];
};

const unegisterRequest = (batchId: string): void => {
  requestPayload.delete(batchId);
  requestCounter.delete(batchId);
  requestDebounce.delete(batchId);
  requestSignals.delete(batchId);
};

const dispatchRequest = (batchId: string): void => {
  const payload = requestPayload.get(batchId);

  if (!payload) {
    return;
  }

  const controller = new AbortController();
  requestSignals.set(batchId, controller);

  fetch(payload.url, {
    ...payload.options,
    signal: controller.signal,
  })
    .then((response) => {
      window.dispatchEvent(
        new CustomEvent<BatchFetchThenDetail>('batchFetchThen', {
          detail: { batchId, response },
        }),
      );
    })
    .catch((error) => {
      // If the error is not an abort error, dispatch the error event.
      // The abort error is already handled inside the batchFetch function.
      if ('AbortError' !== error?.name) {
        window.dispatchEvent(
          new CustomEvent<BatchFetchCatchDetail>('batchFetchCatch', {
            detail: { batchId, error },
          }),
        );
      }
    });
};

const debounceRequest = (batchId: string): void => {
  const timeoutId = requestDebounce.get(batchId);

  if (timeoutId) {
    clearTimeout(timeoutId);
  }

  requestDebounce.set(
    batchId,
    setTimeout(() => {
      dispatchRequest(batchId);
    }, 500),
  );
};

const registerRequest = (batchId: string, url: string, options: RequestInit = {}): void => {
  if (!requestPayload.has(batchId)) {
    requestPayload.set(batchId, { url, options });
  }

  if (!requestCounter.has(batchId)) {
    requestCounter.set(batchId, {
      registered: 0,
      aborted: 0,
      processed: 0,
    });
  }

  // Increment the `registered` counter.
  incrementRequestCounter(batchId, 'registered');

  debounceRequest(batchId);
};

/**
 * Makes a batched fetch request to the specified URL with the given options.
 *
 * @since 1.0.0
 *
 * @param {string} url - The URL to fetch.
 * @param {RequestInit} options - The options for the fetch request.
 *
 * @returns {Promise<Response>} A Promise that resolves to the response of the fetch request.
 */
const batchFetch = (url: string, options: RequestInit): Promise<Response> => {
  const { signal, ...otherOptions } = options;
  const batchId = createBatchId(url, otherOptions);

  // If the request is already dispatched, proceed with fetch request normally.
  if (requestSignals.has(batchId)) {
    return fetch(url, options);
  }

  registerRequest(batchId, url, otherOptions);

  return new Promise((resolve, reject) => {
    const onBatchFetchThen = (event: CustomEvent<BatchFetchThenDetail>) => {
      if (event.detail.batchId !== batchId) {
        return;
      }

      const { response } = event.detail;

      if (response) {
        // Remove the event listeners.
        window.removeEventListener('batchFetchThen', onBatchFetchThen);

        // Increment the `processed` counter.
        incrementRequestCounter(batchId, 'processed');

        // If all registered requests are processed, unregister the request.
        if (isRequestCounterMax(batchId, 'processed')) {
          unegisterRequest(batchId);
        }

        resolve(response.clone());
      }
    };

    const onBatchFetchCatch = (event: CustomEvent<BatchFetchCatchDetail>) => {
      if (event.detail.batchId !== batchId) {
        return;
      }

      const { error } = event.detail;

      if (error) {
        // Remove the event listeners.
        window.removeEventListener('batchFetchCatch', onBatchFetchCatch);

        // Increment the `processed` counter.
        incrementRequestCounter(batchId, 'processed');

        // If all registered requests are processed, unregister the request.
        if (isRequestCounterMax(batchId, 'processed')) {
          unegisterRequest(batchId);
        }

        reject(error);
      }
    };

    // Register event listeners.
    window.addEventListener('batchFetchThen', onBatchFetchThen);
    window.addEventListener('batchFetchCatch', onBatchFetchCatch);

    if (signal) {
      signal.addEventListener(
        'abort',
        () => {
          // Remove the event listeners.
          window.removeEventListener('batchFetchThen', onBatchFetchThen);
          window.removeEventListener('batchFetchCatch', onBatchFetchCatch);

          // Increment the `aborted` counter.
          incrementRequestCounter(batchId, 'aborted');

          // If all registered requests are aborted, clear the debounce timeout, abort the signal,
          // and unregister the request.
          if (isRequestCounterMax(batchId, 'aborted')) {
            // Clear the debounce timeout.
            const timeoutId = requestDebounce.get(batchId);

            if (timeoutId) {
              clearTimeout(timeoutId);
            }

            // Abort the signal.
            const requestSignal = requestSignals.get(batchId);

            if (requestSignal) {
              requestSignal.abort();
            }

            // Unregister the request.
            unegisterRequest(batchId);
          }

          // Throw the abort error then catch the `error` object to be passed to the `reject` function.
          try {
            signal.throwIfAborted();
          } catch (error) {
            reject(error);
          }
        },
        { once: true },
      );
    }
  });
};

export default batchFetch;
