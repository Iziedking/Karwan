import assert from 'node:assert/strict';
import test from 'node:test';
import { en } from '@/shared/i18n/messages/en';
import { gatewayTopUpErrorPresentation } from './errorPresentation';

test('a clearly covered Gateway transfer does not tell the user to lower the amount', () => {
  const result = gatewayTopUpErrorPresentation({
    err: new Error('Insufficient total maxFee across intents to cover forwarding fee'),
    confirmed: 210.95,
    amount: 100,
    chainCopy: en.chainErrors,
    fallback: en.gatewayTopUp.failed,
    feePreparationFailed: en.gatewayTopUp.feePreparationFailed,
  });

  assert.equal(result.message, en.gatewayTopUp.feePreparationFailed);
  assert.notEqual(result.message, en.chainErrors.feeHeadroom);
  assert.equal(result.refreshBalance, true);
});

test('a near-maximum spend still receives the fee-headroom recovery', () => {
  const result = gatewayTopUpErrorPresentation({
    err: new Error('Required additional: 0.20 USDC for forwarding fee'),
    confirmed: 100.1,
    amount: 100,
    chainCopy: en.chainErrors,
    fallback: en.gatewayTopUp.failed,
    feePreparationFailed: en.gatewayTopUp.feePreparationFailed,
  });

  assert.equal(result.message, en.chainErrors.feeHeadroom);
  assert.equal(result.refreshBalance, false);
});
