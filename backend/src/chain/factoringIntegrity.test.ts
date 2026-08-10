import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertFactoringAssignment } from './factoringIntegrity.js';

const financier = '0xa045e8104bc066fff5bfc673abf354871edc03c5';

test('rejects a reverted assignment receipt', () => {
  assert.throws(
    () => assertFactoringAssignment('reverted', financier, financier),
    /reverted on chain/,
  );
});

test('rejects an assignment that did not set the financier as payee', () => {
  assert.throws(
    () =>
      assertFactoringAssignment(
        'success',
        '0x0000000000000000000000000000000000000000',
        financier,
      ),
    /payee mismatch/,
  );
});

test('accepts a successful assignment to the financier', () => {
  assert.doesNotThrow(() =>
    assertFactoringAssignment('success', financier.toUpperCase(), financier),
  );
});
