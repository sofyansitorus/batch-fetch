import hash from 'object-hash';

declare global {
    interface WindowEventMap {
        'batchFetchThen': CustomEvent;
        'batchFetchCatch': CustomEvent<Record<string, Error>>;
    }
}

interface RequestPayload {
    url: string;
    options?: Omit<RequestInit, 'signal'>;
}

interface RequestCounter {
    registered: number;
    aborted: number;
    processed: number;
}

const requestPayload: Record<string, RequestPayload> = {};
const requestCounter: Record<string, RequestCounter> = {};
const requestDebounce: Record<string, ReturnType<typeof setTimeout>> = {};
const requestSignals: Record<string, AbortController> = {};

const unegisterRequest = (batchId: string) => {
    delete requestPayload[batchId];
    delete requestCounter[batchId];
    delete requestDebounce[batchId];
    delete requestSignals[batchId];
}

const dispatchRequest = (batchId: string) => {
    requestSignals[batchId] = new AbortController();

    fetch(requestPayload?.[batchId]?.url ?? '', {
        ...requestPayload?.[batchId]?.options,
        signal: requestSignals?.[batchId]?.signal,
    })
        .then((response) => {
            window.dispatchEvent(new CustomEvent('batchFetchThen', {
                detail: { [`${batchId}`]: response },
            }));
        })
        .catch((error) => {
            if ('AbortError' !== error?.name) {
                window.dispatchEvent(new CustomEvent('batchFetchCatch', {
                    detail: { [`${batchId}`]: error },
                }));
            }
        });
};

const debounceRequest = (batchId: string) => {
    if (requestDebounce[batchId]) {
        clearTimeout(requestDebounce[batchId]);
    }

    requestDebounce[batchId] = setTimeout(() => {
        dispatchRequest(batchId);
    }, 1000);
};

const registerRequest = (
    url: string,
    options: RequestInit = {}
) => {
    const batchId = hash({ url, options });

    if (requestSignals[batchId]) {
        throw new Error('Request already dispatched');
    }

    if (!requestPayload[batchId]) {
        requestPayload[batchId] = { url, options };
    }

    if (!requestCounter[batchId]) {
        requestCounter[batchId] = {
            registered: 0,
            aborted: 0,
            processed: 0,
        }
    }

    (requestCounter[batchId] as RequestCounter).registered += 1;

    debounceRequest(batchId);

    return batchId;
}

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
const batchFetch = (
    url: string,
    options: RequestInit
): Promise<Response> => {
    const { signal, ...otherOptions } = options;
    const batchId = registerRequest(url, otherOptions);

    return new Promise((resolve, reject) => {
        const onBatchFetchThen = (event: CustomEvent<Record<string, Response>>) => {
            const response = event.detail?.[batchId];

            if (response) {
                // Remove the event listeners.
                window.removeEventListener('batchFetchThen', onBatchFetchThen);

                // Increment the `processed` counter.
                (requestCounter[batchId] as RequestCounter).processed += 1;

                // If all registered requests are processed, unregister the request.
                if (requestCounter?.[batchId]?.processed === requestCounter?.[batchId]?.registered) {
                    unegisterRequest(batchId);
                }

                resolve(response.clone());
            }
        };

        const onBatchFetchCatch = (event: CustomEvent<Record<string, Error>>) => {
            const error = event.detail?.[batchId];

            if (error) {
                // Remove the event listeners.
                window.removeEventListener('batchFetchCatch', onBatchFetchCatch);

                // Increment the `processed` counter.
                (requestCounter[batchId] as RequestCounter).processed += 1;

                // If all registered requests are processed, unregister the request.
                if (requestCounter?.[batchId]?.processed === requestCounter?.[batchId]?.registered) {
                    unegisterRequest(batchId);
                }

                reject(error);
            }
        };

        // Register event listeners.
        window.addEventListener('batchFetchThen', onBatchFetchThen);
        window.addEventListener('batchFetchCatch', onBatchFetchCatch);

        if (signal) {
            signal.addEventListener('abort', () => {
                // Remove the event listeners.
                window.removeEventListener('batchFetchThen', onBatchFetchThen);
                window.removeEventListener('batchFetchCatch', onBatchFetchCatch);

                // Increment the `aborted` counter.
                (requestCounter[batchId] as RequestCounter).aborted = 1;

                // If all registered requests are aborted, abort the signal and clear the debounce timeout,
                // then unregister the request.
                if (requestCounter?.[batchId]?.aborted === requestCounter?.[batchId]?.registered) {
                    // Abort the signal.
                    if (requestSignals[batchId]) {
                        requestSignals?.[batchId]?.abort();
                    }

                    // Clear the debounce timeout.
                    if (requestDebounce[batchId]) {
                        clearTimeout(requestDebounce[batchId]);
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
            }, { once: true });
        }
    });
}

export default batchFetch;