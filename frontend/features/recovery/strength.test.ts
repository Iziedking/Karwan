import assert from 'node:assert/strict';
import test from 'node:test';
import { passwordStrength } from './strength';

test('short, common and repeated passwords are refused; a long phrase is fine', () => {
  assert.deepEqual(passwordStrength('abc12345'), { ok: false, reason: 'short' });
  assert.deepEqual(passwordStrength('password1234'), { ok: false, reason: 'common' });
  assert.deepEqual(passwordStrength('aaaaaaaaaaaa'), { ok: false, reason: 'repeated' });
  assert.deepEqual(passwordStrength('mango river lamp 42'), { ok: true, reason: null });
});
