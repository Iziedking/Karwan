import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveFactoringAdvanceRecipient } from './advanceRecipient';

const seller = '0x1111111111111111111111111111111111111111';
const sellerAgentAddress = '0x2222222222222222222222222222222222222222';

test('uses the authoritative factoring recipient published by the backend', () => {
  assert.equal(
    resolveFactoringAdvanceRecipient({
      seller,
      sellerAgentAddress,
      factoringAdvanceRecipient: '0x3333333333333333333333333333333333333333',
    }),
    '0x3333333333333333333333333333333333333333',
  );
});

test('uses the managed seller agent while an older backend response rolls out', () => {
  assert.equal(
    resolveFactoringAdvanceRecipient({ seller, sellerAgentAddress }),
    sellerAgentAddress,
  );
});

test('retains direct-wallet compatibility while an older backend response rolls out', () => {
  assert.equal(resolveFactoringAdvanceRecipient({ seller }), seller);
});

test('fails closed when an explicit authoritative recipient is malformed', () => {
  assert.equal(
    resolveFactoringAdvanceRecipient({
      seller,
      sellerAgentAddress,
      factoringAdvanceRecipient: 'not-an-address',
    }),
    null,
  );
});
