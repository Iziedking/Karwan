import assert from 'node:assert/strict';
import test from 'node:test';
import { checkKarwanTag, normalizeKarwanTag } from './karwanTag.js';

test('normalizes case, whitespace and a leading @', () => {
  assert.equal(normalizeKarwanTag('  @Israel_D '), 'israel_d');
  assert.equal(normalizeKarwanTag('KINGIZIE'), 'kingizie');
});

test('accepts 3 to 20 letters, numbers and underscores starting with a letter', () => {
  assert.deepEqual(checkKarwanTag('ada'), { ok: true, tag: 'ada' });
  assert.deepEqual(checkKarwanTag('a_very_long_name_2026'.slice(0, 20)), { ok: true, tag: 'a_very_long_name_202' });
});

test('rejects malformed tags with a reason', () => {
  assert.deepEqual(checkKarwanTag('ab'), { ok: false, reason: 'too_short' });
  assert.deepEqual(checkKarwanTag('a'.repeat(21)), { ok: false, reason: 'too_long' });
  assert.deepEqual(checkKarwanTag('2fast'), { ok: false, reason: 'invalid' });
  assert.deepEqual(checkKarwanTag('john.doe'), { ok: false, reason: 'invalid' });
  assert.deepEqual(checkKarwanTag('john-doe'), { ok: false, reason: 'invalid' });
  assert.deepEqual(checkKarwanTag('bad__name'), { ok: false, reason: 'invalid' });
  assert.deepEqual(checkKarwanTag('trailing_'), { ok: false, reason: 'invalid' });
});

test('reserves names that could pass as Karwan staff or partners', () => {
  for (const name of ['karwan', 'Karwan_Support', 'admin', 'support', 'circle', 'arc', 'escrow', 'official']) {
    assert.deepEqual(checkKarwanTag(name), { ok: false, reason: 'reserved' }, name);
  }
});
