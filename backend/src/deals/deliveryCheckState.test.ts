import assert from 'node:assert/strict';
import test from 'node:test';
import { deliveryCheckState as check } from './deliveryCheckState.js';

const live = { delivered: true, deliveryProof: 'https://github.com/a/b', terms: 'Landing page' };
const deliveryCheckState = (d: Record<string, unknown>) => check({ ...live, ...d } as never);

test('a delivery with no verdict yet is being checked', () => {
  assert.equal(deliveryCheckState({ delivered: true }), 'checking');
});

test('a mismatch or partial reads as held at once, before the watcher pauses the release', () => {
  assert.equal(deliveryCheckState({ delivered: true, deliveryMatch: { verdict: 'mismatch', reason: 'x' } }), 'held');
  assert.equal(deliveryCheckState({ delivered: true, deliveryMatch: { verdict: 'partial', reason: 'x' } }), 'held');
  assert.equal(deliveryCheckState({ delivered: true, releaseBlockedReason: 'security-hold' }), 'held');
});

test('an aligned verdict passes, an unknown one could not be checked', () => {
  assert.equal(deliveryCheckState({ delivered: true, deliveryMatch: { verdict: 'aligned', reason: '' } }), 'passed');
  assert.equal(deliveryCheckState({ delivered: true, deliveryMatch: { verdict: 'unknown', reason: '' } }), 'unverified');
});

test('a goods deal or an undelivered one has no delivery check', () => {
  assert.equal(deliveryCheckState({ delivered: false }), null);
  assert.equal(deliveryCheckState({ delivered: true, tradeType: 'goods' }), null);
});

test('a delivery with no link or a deal with no terms is never checked', () => {
  assert.equal(deliveryCheckState({ deliveryProof: undefined }), null);
  assert.equal(deliveryCheckState({ terms: undefined }), null);
});
