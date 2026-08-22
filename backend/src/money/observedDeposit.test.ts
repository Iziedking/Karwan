import assert from 'node:assert/strict';
import test from 'node:test';
import {
  observedArcDepositOperationKey,
  observedArcDepositSummary,
} from './observedDeposit.js';

test('observed Arc deposits use a stable transfer-based operation key', () => {
  assert.equal(
    observedArcDepositOperationKey('0xABCDEF', 7),
    'arc:observed-deposit:0xabcdef:7',
  );
  assert.equal(
    observedArcDepositOperationKey('0xABCDEF', -3),
    'arc:observed-deposit:0xabcdef:0',
  );
});

test('observed Arc deposit summaries name the wallet that received the funds', () => {
  assert.equal(
    observedArcDepositSummary({ amountMicros: 2_500_000n, walletRole: 'identity' }),
    'Deposited 2.5 USDC into your identity wallet',
  );
  assert.equal(
    observedArcDepositSummary({ amountMicros: 2_000_000n, walletRole: 'buyerAgent' }),
    'Deposited 2 USDC into your buyer agent wallet',
  );
  assert.equal(
    observedArcDepositSummary({ amountMicros: 1_000_000n, walletRole: 'sellerAgent' }),
    'Deposited 1 USDC into your seller agent wallet',
  );
});
