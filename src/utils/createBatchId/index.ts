import { isPlainObject } from '../isPlainObject';

/**
 * Creates a deterministic batch identifier from a request URL and options object.
 *
 * The identifier is built from a stable serialization that normalizes key ordering
 * for plain objects and common web platform types.
 */
export const createBatchId = (url: string, options: RequestInit): string => {
  let nextCircularRefId = 0;
  const circularRefs = new WeakMap<object, number>();

  /**
   * Serializes values into a stable string representation used to build the batch id.
   */
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
