import assert from 'node:assert/strict';
import test from 'node:test';

import { selectFactoringAdvanceTxHash } from './factoringAcceptance.js';

test('reuses the persisted advance transaction on retry', () => {
  assert.equal(
    selectFactoringAdvanceTxHash({
      persistedHash: '0xABC',
      submittedHash: undefined,
    }),
    '0xABC',
  );
});

test('accepts the first submitted transaction when none is persisted', () => {
  assert.equal(
    selectFactoringAdvanceTxHash({ submittedHash: '0xABC' }),
    '0xABC',
  );
});

test('rejects a different transaction during reconciliation', () => {
  assert.throws(
    () => selectFactoringAdvanceTxHash({ persistedHash: '0xABC', submittedHash: '0xDEF' }),
    /transaction changed during reconciliation/,
  );
});
