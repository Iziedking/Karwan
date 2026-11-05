import assert from 'node:assert/strict';
import test from 'node:test';
import {
  observedArcDepositOperationKey,
  observedArcDepositSummary,
  observedArcTransferOperationKey,
  isDataBalanceTopUp,
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

test('an agent topping up its own data balance on Gateway is a move, not money that left (view 48, 5 Nov 2026)', async () => {
  const { ARC } = await import('../chain/client.js');
  const gateway = ARC.contracts.gatewayWallet;
  assert.equal(isDataBalanceTopUp({ walletRole: 'sellerAgent', destinationAddress: gateway.toLowerCase() }), true);
  assert.equal(isDataBalanceTopUp({ walletRole: 'buyerAgent', destinationAddress: gateway }), true);
  assert.equal(isDataBalanceTopUp({ walletRole: 'identity', destinationAddress: gateway }), false, 'a person’s own Gateway deposit is not the data balance');
  assert.equal(isDataBalanceTopUp({ walletRole: 'sellerAgent', destinationAddress: '0x0000000000000000000000000000000000000001' }), false);
  assert.equal(
    observedArcTransferSummary({ amountMicros: 100_000n, walletRole: 'sellerAgent', kind: 'agent_funding', toDataBalance: true }),
    "0.1 USDC moved to your selling agent's data balance",
  );
});

