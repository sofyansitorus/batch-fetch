import { describe, expect, it } from 'vitest';
import { isPlainObject } from './index';

describe('isPlainObject', () => {
  it('returns true for an object literal {}', () => {
    expect(isPlainObject({})).toBe(true);
  });

  it('returns true for Object.create(null)', () => {
    expect(isPlainObject(Object.create(null))).toBe(true);
  });

  it('returns true for new Object()', () => {
    expect(isPlainObject(new Object())).toBe(true);
  });

  it('returns true for an object with properties', () => {
    expect(isPlainObject({ a: 1, b: 'hello' })).toBe(true);
  });

  it('returns false for null', () => {
    expect(isPlainObject(null)).toBe(false);
  });

  it('returns false for an array', () => {
    expect(isPlainObject([])).toBe(false);
    expect(isPlainObject([1, 2, 3])).toBe(false);
  });

  it('returns false for a Date instance', () => {
    expect(isPlainObject(new Date())).toBe(false);
  });

  it('returns false for a class instance', () => {
    class Foo {}
    expect(isPlainObject(new Foo())).toBe(false);
  });

  it('returns false for a function', () => {
    expect(isPlainObject(() => {})).toBe(false);
  });

  it('returns false for a string', () => {
    expect(isPlainObject('hello')).toBe(false);
  });

  it('returns false for a number', () => {
    expect(isPlainObject(42)).toBe(false);
  });

  it('returns false for a boolean', () => {
    expect(isPlainObject(true)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isPlainObject(undefined)).toBe(false);
  });

  it('returns false for a RegExp instance', () => {
    expect(isPlainObject(/regex/)).toBe(false);
  });

  it('returns false for a Map instance', () => {
    expect(isPlainObject(new Map())).toBe(false);
  });

  it('returns false for a Set instance', () => {
    expect(isPlainObject(new Set())).toBe(false);
  });
});
