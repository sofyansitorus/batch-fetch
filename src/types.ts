declare global {
  interface WindowEventMap {
    batchFetchThen: CustomEvent<BatchFetchThenDetail>;
    batchFetchCatch: CustomEvent<BatchFetchCatchDetail>;
  }
}

export interface RequestPayload {
  url: string;
  options?: Omit<RequestInit, 'signal'>;
}

export interface RequestCounter {
  registered: number;
  aborted: number;
  processed: number;
}

export interface BatchFetchThenDetail {
  batchId: string;
  response: Response;
}

export interface BatchFetchCatchDetail {
  batchId: string;
  error: Error;
}
