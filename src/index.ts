import hash from 'object-hash';

declare global {
    interface WindowEventMap {
        'batchFetchThen': CustomEvent<Record<string, Response>>;
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

const incrementRequestCounter = (batchId: string, itemType: keyof RequestCounter):void => {
    (requestCounter[batchId] as RequestCounter)[itemType] += 1;
};

const isRequestCounterMax = (batchId: string, itemType: keyof Omit<RequestCounter, 'registered'>):boolean => {
    const registeredCount = requestCounter?.[batchId]?.registered;

    if (!registeredCount) {
        return false;
    }

    return registeredCount === requestCounter?.[batchId]?.[itemType];
};

const unegisterRequest = (batchId: string):void => {
    delete requestPayload[batchId];
    delete requestCounter[batchId];
    delete requestDebounce[batchId];
    delete requestSignals[batchId];
}

const dispatchRequest = (batchId: string):void => {
    requestSignals[batchId] = new AbortController();

    fetch(requestPayload?.[batchId]?.url ?? '', {
        ...requestPayload?.[batchId]?.options,
        signal: requestSignals?.[batchId]?.signal,
    }).then((response) => {
        window.dispatchEvent(new CustomEvent('batchFetchThen', {
            detail: { [`${batchId}`]: response },
        }));
    }).catch((error) => {
        // If the error is not an abort error, dispatch the error event.
        // The abort error is already handled inside the batchFetch function.
        if ('AbortError' !== error?.name) {
            window.dispatchEvent(new CustomEvent('batchFetchCatch', {
                detail: { [`${batchId}`]: error },
            }));
        }
    });
};

const debounceRequest = (batchId: string):void => {
    if (requestDebounce[batchId]) {
        clearTimeout(requestDebounce[batchId]);
    }

    requestDebounce[batchId] = setTimeout(() => {
        dispatchRequest(batchId);
    }, 500);
};

const registerRequest = (
    batchId: string,
    url: string,
    options: RequestInit = {}
):void => {
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

    // Increment the `registered` counter.
    incrementRequestCounter(batchId, 'registered');

    debounceRequest(batchId);
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
):Promise<Response> => {
    const { signal, ...otherOptions } = options;
    const batchId = hash({ url, otherOptions });

    // If the request is already dispatched, proceed with fetch request normally.
    if (Object.prototype.hasOwnProperty.call(requestSignals, batchId)) {
        return fetch(url, options);
    }

    registerRequest(batchId, url, otherOptions);

    return new Promise((resolve, reject) => {
        const onBatchFetchThen = (event: CustomEvent<Record<string, Response>>) => {
            const response = event.detail?.[batchId];

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

        const onBatchFetchCatch = (event: CustomEvent<Record<string, Error>>) => {
            const error = event.detail?.[batchId];

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
            signal.addEventListener('abort', () => {
                // Remove the event listeners.
                window.removeEventListener('batchFetchThen', onBatchFetchThen);
                window.removeEventListener('batchFetchCatch', onBatchFetchCatch);

                // Increment the `aborted` counter.
                incrementRequestCounter(batchId, 'aborted');

                // If all registered requests are aborted, clear the debounce timeout, abort the signal,
                // and unregister the request.
                if (isRequestCounterMax(batchId, 'aborted')) {
                    // Clear the debounce timeout.
                    if (requestDebounce[batchId]) {
                        clearTimeout(requestDebounce[batchId]);
                    }

                    // Abort the signal.
                    if (requestSignals[batchId]) {
                        requestSignals?.[batchId]?.abort();
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