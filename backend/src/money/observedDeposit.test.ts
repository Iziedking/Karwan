import assert from 'node:assert/strict';
import test from 'node:test';
import {
  observedArcDepositOperationKey,
  observedArcDepositSummary,
  observedArcTransferOperationKey,
  observedArcTransferSummary,
  walletPlainName,
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

test('observed Arc deposit summaries name the wallet the way people know it', () => {
  assert.equal(
    observedArcDepositSummary({ amountMicros: 2_500_000n, walletRole: 'identity' }),
    'Deposited 2.5 USDC into your balance',
  );
  assert.equal(
    observedArcDepositSummary({ amountMicros: 2_000_000n, walletRole: 'buyerAgent' }),
    'Deposited 2 USDC into your buying agent',
  );
  assert.equal(
    observedArcDepositSummary({ amountMicros: 1_000_000n, walletRole: 'sellerAgent' }),
    'Deposited 1 USDC into your selling agent',
  );
  assert.equal(
    observedArcTransferSummary({ amountMicros: 1_000_000n, walletRole: 'identity', kind: 'cash_out' }),
    '1 USDC left your balance',
  );
  assert.equal(walletPlainName('buyerAgent'), 'buying agent');
});

test('observed transfer keys and summaries distinguish agent outflows', () => {
  assert.equal(
    observedArcTransferOperationKey('cash_out', '0xABCDEF', 7),
    'arc:observed-transfer:cash_out:0xabcdef:7',
  );
  assert.equal(
    observedArcTransferSummary({ amountMicros: 200_000_000n, walletRole: 'buyerAgent', kind: 'cash_out' }),
    '200 USDC left your buying agent',
  );
  assert.equal(
    observedArcTransferSummary({ amountMicros: 200_000_000n, walletRole: 'buyerAgent', kind: 'agent_funding' }),
    '200 USDC moved into your buying agent',
  );
});
