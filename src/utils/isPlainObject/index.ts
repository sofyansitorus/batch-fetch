/**
 * Checks whether a value is a plain object (i.e. created via `{}`, `Object.create(null)`, or `new Object()`).
 *
 * @param value - The value to check.
 * @returns `true` if the value is a plain object, `false` otherwise.
 *
 * @example
 * isPlainObject({});              // true
 * isPlainObject(Object.create(null)); // true
 * isPlainObject([]);              // false
 * isPlainObject(null);            // false
 * isPlainObject(new Date());      // false
 */
export const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (value === null || typeof value !== 'object') {
    return false;
  }

  const proto = Object.getPrototypeOf(value);

  return proto === Object.prototype || proto === null;
};
