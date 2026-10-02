import assert from 'node:assert/strict';
import test from 'node:test';
import { requestRef, requestStep } from './requestRef';

test('a request id becomes a short reference a person can read', () => {
  assert.equal(requestRef('0x8e84db295886c261330b76f2169137d1fed4295279ce9770ff23cdfdea907cdb'), 'REQ-8E84-DB29');
});

test('the step follows offers, the match, agreement and funding', () => {
  assert.equal(requestStep({ offers: 0, matched: false, agreed: false, funded: false }), 0);
  assert.equal(requestStep({ offers: 2, matched: false, agreed: false, funded: false }), 1);
  assert.equal(requestStep({ offers: 0, matched: true, agreed: false, funded: false }), 1);
  assert.equal(requestStep({ offers: 1, matched: true, agreed: true, funded: false }), 2);
  assert.equal(requestStep({ offers: 1, matched: true, agreed: true, funded: true }), 3);
});
