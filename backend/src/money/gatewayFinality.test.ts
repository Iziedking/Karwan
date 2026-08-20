import assert from 'node:assert/strict';
import test from 'node:test';
import {
  GATEWAY_DEPOSIT_FINALIZED,
  parseGatewayFinalityEvent,
} from './gatewayFinality.js';

test('parses a Gateway finality payload without exposing unknown provider fields', () => {
  const event = parseGatewayFinalityEvent(
    'notification-1',
    GATEWAY_DEPOSIT_FINALIZED,
    {
      deposit: {
        reference: 'KWN-2345-6789-ABCD',
        transactionHash: '0xabc',
        amount: '12.340001',
        walletAddress: '0x0000000000000000000000000000000000000001',
      },
      ignoredSecret: 'must not be surfaced',
    },
  );
  assert.deepEqual(event, {
    notificationId: 'notification-1',
    notificationType: GATEWAY_DEPOSIT_FINALIZED,
    reference: 'KWN-2345-6789-ABCD',
    correlation: '0xabc',
    txHash: '0xabc',
    amountMicros: '12340001',
    gatewayAddress: '0x0000000000000000000000000000000000000001',
  });
});

test('accepts provider transaction correlation when a Gateway event has no Karwan reference', () => {
  const event = parseGatewayFinalityEvent(
    'notification-2',
    GATEWAY_DEPOSIT_FINALIZED,
    { transactionId: 'gateway-tx-2', amountUsd: '10' },
  );
  assert.equal(event?.reference, undefined);
  assert.equal(event?.correlation, 'gateway-tx-2');
  assert.equal(event?.amountMicros, '10000000');
});

test('does not treat another notification type or malformed amount as finality', () => {
  assert.equal(
    parseGatewayFinalityEvent('notification-3', 'gateway.deposit.submitted', { txHash: '0x1' }),
    null,
  );
  assert.equal(
    parseGatewayFinalityEvent('notification-4', GATEWAY_DEPOSIT_FINALIZED, {
      transactionId: 'gateway-tx-4',
      amount: 'not-money',
    }),
    null,
  );
});
