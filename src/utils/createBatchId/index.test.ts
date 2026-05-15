import { describe, expect, it } from 'vitest';
import { createBatchId } from './index';

describe('createBatchId', () => {
  it('creates the same id for the same input object', () => {
    const options: RequestInit = {
      method: 'POST',
      headers: {
        'x-request-id': 'abc',
      },
      body: JSON.stringify({ ok: true }),
    };

    const first = createBatchId('/users', options);
    const second = createBatchId('/users', options);

    expect(first).toBe(second);
  });

  it('normalizes plain object key ordering', () => {
    const first = createBatchId('/users', {
      body: JSON.stringify({ name: 'Jane' }),
      method: 'POST',
      headers: {
        'x-request-id': 'abc',
        authorization: 'Bearer token',
      },
    });

    const second = createBatchId('/users', {
      headers: {
        authorization: 'Bearer token',
        'x-request-id': 'abc',
      },
      method: 'POST',
      body: JSON.stringify({ name: 'Jane' }),
    });

    expect(first).toBe(second);
  });

  it('includes URL in the generated id', () => {
    const options: RequestInit = { method: 'GET' };

    const first = createBatchId('/users', options);
    const second = createBatchId('/accounts', options);

    expect(first).not.toBe(second);
  });

  it('normalizes URLSearchParams and Headers entry ordering', () => {
    const firstParams = new URLSearchParams([
      ['z', '3'],
      ['a', '1'],
    ]);
    const secondParams = new URLSearchParams([
      ['a', '1'],
      ['z', '3'],
    ]);

    const firstHeaders = new Headers([
      ['z-header', '3'],
      ['a-header', '1'],
    ]);
    const secondHeaders = new Headers([
      ['a-header', '1'],
      ['z-header', '3'],
    ]);

    const first = createBatchId('/users', {
      body: firstParams,
      headers: firstHeaders,
      method: 'POST',
    });

    const second = createBatchId('/users', {
      body: secondParams,
      headers: secondHeaders,
      method: 'POST',
    });

    expect(first).toBe(second);
  });

  it('serializes circular references without throwing', () => {
    const circular: { self?: unknown } = {};
    circular.self = circular;

    expect(() => createBatchId('/users', { body: circular as BodyInit })).not.toThrow();

    const first = createBatchId('/users', { body: circular as BodyInit });
    const second = createBatchId('/users', { body: circular as BodyInit });

    expect(first).toBe(second);
  });

  it('represents non-plain objects by constructor name', () => {
    const first = createBatchId('/users', {
      body: new Map([['a', '1']]) as unknown as BodyInit,
    });
    const second = createBatchId('/users', {
      body: new Set(['a']) as unknown as BodyInit,
    });

    expect(first).not.toBe(second);
    expect(first).toContain('Map');
    expect(second).toContain('Set');
  });
});
