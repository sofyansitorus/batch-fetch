# @sofyansitorus/batch-fetch

`batch-fetch` deduplicates identical `fetch` calls made in a short time window, so only one network request is sent for equivalent calls.

It is useful when the same URL and options may be requested many times concurrently (for example, repeated UI interactions or duplicated data loads).

## Installation

```bash
npm install @sofyansitorus/batch-fetch
```

## API

```ts
batchFetch(url: string, options: RequestInit): Promise<Response>
```

- `url`: request URL.
- `options`: standard `fetch` options. A new object can be passed each time.

## Example

```ts
import batchFetch from '@sofyansitorus/batch-fetch';

const url = 'https://api.example.com/data';
const options: RequestInit = {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ key: 'value' }),
};

const [a, b, c] = await Promise.all([
  batchFetch(url, options),
  batchFetch(url, options),
  batchFetch(url, options),
]);

console.log(await a.json());
console.log(await b.json());
console.log(await c.json());
```

## Demo

https://batch-fetch-playground.netlify.app

## How Batching Works

- Calls are grouped by a deterministic batch key created from `url` and `options` (excluding `options.signal`).
- Plain-object key order is normalized, so semantically identical objects still match.
- Requests are debounced for `500ms`; matching calls in that window share one underlying network request.
- Each caller receives a cloned `Response` instance (`response.clone()`), not the same object reference.

## Abort Behavior

- Aborting one caller only rejects that caller.
- If all callers in a pending (not yet dispatched) batch are aborted, the network request is not sent.
- If a batch has already been dispatched, later identical calls do not join that in-flight batch and use native `fetch` directly.

## Environment Notes

- Browser-oriented implementation (uses `window` events internally).

## Development

```bash
npm run test
npm run build
npm run format
npm run format:check
```

- `npm run test`: runs unit tests with Vitest.
- `npm run build`: compiles TypeScript.
- `npm run format`: formats files with Prettier.
- `npm run format:check`: verifies formatting.
