import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PIN_LOCK_MS,
  PIN_MAX_FAILURES,
  afterPinFailure,
  afterPinSuccess,
  hashPin,
  normalizePin,
  pinGate,
  pinProblem,
  verifyPinHash,
  type PinState,
} from './pin.js';

test('spaces_are_ignored', () => {
  assert.equal(normalizePin(' 12 34 56 '), '123456');
  assert.equal(normalizePin('402917'), '402917');
  assert.equal(normalizePin('12345'), null);
  assert.equal(normalizePin('1234567'), null);
  assert.equal(normalizePin('12345a'), null);
  assert.equal(normalizePin('١٢٣٤٥٦'), null);
});

test('simple_pins_are_refused', () => {
  for (const p of ['000000', '111111', '999999', '123456', '654321', '234567', '987654']) {
    assert.equal(pinProblem(p), 'too_simple', p);
  }
  assert.equal(pinProblem('402917'), null);
  assert.equal(pinProblem('12345'), 'format');
});

test('a_hash_verifies_only_its_pin_and_salts_differ', async () => {
  const h1 = await hashPin('402917');
  const h2 = await hashPin('402917');
  assert.notEqual(h1, h2);
  assert.match(h1, /^scrypt\$32768\$8\$1\$[A-Za-z0-9_-]+\$[A-Za-z0-9_-]+$/);
  assert.equal(await verifyPinHash('402917', h1), true);
  assert.equal(await verifyPinHash('402918', h1), false);
  assert.equal(await verifyPinHash('402917', 'not-a-hash'), false);
});

test('five_wrong_lock_for_15_minutes_then_open_again', () => {
  let s: PinState = { hash: 'x', failures: 0, lockedUntil: null };
  for (let i = 0; i < PIN_MAX_FAILURES - 1; i++) s = afterPinFailure(s, 0);
  assert.equal(s.failures, 4);
  assert.deepEqual(pinGate(s, 0), { ok: true });
  s = afterPinFailure(s, 0);
  assert.deepEqual(pinGate(s, 0), { ok: false, until: PIN_LOCK_MS });
  assert.deepEqual(pinGate(s, PIN_LOCK_MS - 1), { ok: false, until: PIN_LOCK_MS });
  assert.deepEqual(pinGate(s, PIN_LOCK_MS), { ok: true });
  assert.equal(s.failures, 0);
  s = afterPinFailure(s, PIN_LOCK_MS);
  assert.equal(s.failures, 1);
  assert.deepEqual(pinGate(s, PIN_LOCK_MS), { ok: true });
});

test('a_correct_pin_resets_the_count', () => {
  const s = afterPinSuccess({ hash: 'x', failures: 3, lockedUntil: null });
  assert.equal(s.failures, 0);
  assert.equal(s.lockedUntil, null);
  assert.equal(s.hash, 'x');
});
