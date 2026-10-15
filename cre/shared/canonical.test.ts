import { describe, expect, test } from 'bun:test';
import { keccak256, toBytes } from 'viem';
import { canonicalJson, fingerprint } from './canonical.js';

describe('canonical fingerprint', () => {
  test('key order does not change the fingerprint', () => {
    expect(fingerprint({ b: 1, a: { d: 2, c: 3 } })).toBe(fingerprint({ a: { c: 3, d: 2 }, b: 1 }));
  });

  test('arrays keep their order', () => {
    expect(fingerprint([1, 2])).not.toBe(fingerprint([2, 1]));
  });

  test('matches the hash of the sorted, spaceless text', () => {
    expect(canonicalJson({ b: 1, a: [true, 'x'] })).toBe('{"a":[true,"x"],"b":1}');
    expect(fingerprint({ b: 1, a: [true, 'x'] })).toBe(keccak256(toBytes('{"a":[true,"x"],"b":1}')));
  });

  test('encodes unicode as UTF-8', () => {
    expect(fingerprint({ t: 'café' })).toBe(keccak256(toBytes('{"t":"café"}')));
  });

  test('refuses values that have no single text form', () => {
    expect(() => canonicalJson({ a: undefined })).toThrow('CANONICAL_UNDEFINED');
    expect(() => canonicalJson({ a: Number.NaN })).toThrow('CANONICAL_NUMBER');
    expect(() => canonicalJson({ a: Number.POSITIVE_INFINITY })).toThrow('CANONICAL_NUMBER');
    expect(() => canonicalJson({ a: () => 1 })).toThrow('CANONICAL_TYPE');
    expect(() => canonicalJson({ a: 1n })).toThrow('CANONICAL_TYPE');
  });
});
