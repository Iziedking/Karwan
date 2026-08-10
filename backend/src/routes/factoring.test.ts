import assert from 'node:assert/strict';
import test from 'node:test';
import { factoringAdvanceRecipient } from './factoring.js';

test('factoring advances target the on-chain seller agent when present', () => {
  assert.equal(
    factoringAdvanceRecipient({
      seller: '0x1111111111111111111111111111111111111111',
      sellerAgentAddress: '0x2222222222222222222222222222222222222222',
    }),
    '0x2222222222222222222222222222222222222222',
  );
});

test('factoring advances retain direct-wallet compatibility', () => {
  assert.equal(
    factoringAdvanceRecipient({ seller: '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' }),
    '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  );
});
