import assert from 'node:assert/strict';
import test from 'node:test';

import {
  canRepriceFactoringOffer,
  isFactoringOfferAcceptable,
  selectFactoringAdvanceTxHash,
} from './factoringAcceptance.js';

test('a confirmed advance is retryable but no longer editable', () => {
  assert.equal(isFactoringOfferAcceptable('pending_receipt'), true);
  assert.equal(canRepriceFactoringOffer('pending_receipt'), false);
  assert.equal(canRepriceFactoringOffer('offered'), true);
});

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
