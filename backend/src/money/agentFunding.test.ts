import assert from 'node:assert/strict';
import test from 'node:test';
import { matchesAgentFundingTransfer } from './agentFunding.js';

const expected = {
  sourceAddress: '0xAa00000000000000000000000000000000000001',
  destinationAddress: '0xBb00000000000000000000000000000000000002',
  amountMicros: 3_250_000n,
};

test('agent funding proof requires the exact source, recipient, and amount', () => {
  assert.equal(
    matchesAgentFundingTransfer(
      { from: expected.sourceAddress.toLowerCase(), to: expected.destinationAddress.toUpperCase(), value: 3_250_000n },
      expected,
    ),
    true,
  );
  assert.equal(
    matchesAgentFundingTransfer(
      { from: expected.sourceAddress, to: expected.destinationAddress, value: 3_250_001n },
      expected,
    ),
    false,
  );
  assert.equal(
    matchesAgentFundingTransfer(
      { from: expected.destinationAddress, to: expected.destinationAddress, value: expected.amountMicros },
      expected,
    ),
    false,
  );
});
