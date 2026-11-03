import assert from 'node:assert/strict';
import test from 'node:test';
import { AddressMap, AddressSet, canonicalAddress, sameAddress } from './address.js';

/// One address, one key (view 48, rule 1). Cotton Co's agent arrived once in
/// lowercase and once checksummed and was kept as two sellers.

const CHECKSUMMED = '0x60d921870BEC83E8Ce4A824C8E7d05c74A1f88a8';
const LOWER = CHECKSUMMED.toLowerCase();

test('an address enters checksummed, whatever casing it came in', () => {
  assert.equal(canonicalAddress(LOWER), CHECKSUMMED);
  assert.equal(canonicalAddress(CHECKSUMMED.toUpperCase().replace('0X', '0x')), CHECKSUMMED);
  assert.equal(sameAddress(LOWER, CHECKSUMMED), true);
  assert.equal(sameAddress(LOWER, null), false);
});

test('something that is not an address is kept as it is, lowercased, never thrown on', () => {
  assert.equal(canonicalAddress('0xSeller'), '0xseller');
});

test('a map keyed by address holds one entry for one address in any casing', () => {
  const offers = new AddressMap<`0x${string}`, number>();
  offers.set(LOWER as `0x${string}`, 503.99);
  offers.set(CHECKSUMMED, 501.23);
  assert.equal(offers.size, 1);
  assert.equal(offers.get(LOWER as `0x${string}`), 501.23);
  assert.equal(offers.has(CHECKSUMMED), true);
  assert.deepEqual([...offers.keys()], [CHECKSUMMED]);
  assert.equal(offers.delete(LOWER as `0x${string}`), true);
  assert.equal(offers.size, 0);
});

test('a map built from entries merges them the same way', () => {
  const offers = new AddressMap<string, number>([
    [LOWER, 1],
    [CHECKSUMMED, 2],
  ]);
  assert.equal(offers.size, 1);
  assert.equal(offers.get(CHECKSUMMED), 2);
});

test('a set of addresses holds one entry per address', () => {
  const tried = new AddressSet<`0x${string}`>([LOWER as `0x${string}`]);
  tried.add(CHECKSUMMED);
  assert.equal(tried.size, 1);
  assert.equal(tried.has(LOWER as `0x${string}`), true);
  assert.equal(tried.delete(CHECKSUMMED), true);
  assert.equal(tried.size, 0);
});
