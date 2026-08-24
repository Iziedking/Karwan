import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canRestartFunding as fundingRestart,
  fundingTxHash,
  fundingVerdict,
  type ReceiptStanding,
} from './fundingOutcome.js';

const LEG = '0x1111111111111111111111111111111111111111111111111111111111111111';
const SENT = '0x2222222222222222222222222222222222222222222222222222222222222222';
const PROVIDER = '0x3333333333333333333333333333333333333333333333333333333333333333';

test('the leg is believed first: it is the copy that survives the throw', () => {
  assert.equal(
    fundingTxHash({ legTxHash: LEG, sentTxHash: SENT, providerTxHash: PROVIDER }),
    LEG,
  );
});

test('the hash is found wherever it was written', () => {
  assert.equal(fundingTxHash({ sentTxHash: SENT, providerTxHash: PROVIDER }), SENT);
  assert.equal(fundingTxHash({ providerTxHash: PROVIDER }), PROVIDER);
  // The case that produced the bug report: onConfirmed threw, so the route
  // never saw a result, and only the leg knew a transaction existed.
  assert.equal(fundingTxHash({ legTxHash: LEG }), LEG);
});

test('nothing sent is nothing to check', () => {
  assert.equal(fundingTxHash({}), null);
  assert.equal(fundingTxHash({ legTxHash: '', sentTxHash: '   ' }), null);
});

test('a successful receipt is the money moving, whatever threw afterwards', () => {
  assert.equal(fundingVerdict({ txHash: LEG, receipt: 'success' }), 'landed');
});

test('a reverted receipt is the one honest failure', () => {
  assert.equal(fundingVerdict({ txHash: LEG, receipt: 'reverted' }), 'did_not_land');
});

test('a hash the chain cannot answer for is never called failed', () => {
  // This is the whole bug. An unreadable RPC used to read as "it failed".
  for (const receipt of ['not_found', 'unreadable'] as ReceiptStanding[]) {
    assert.equal(fundingVerdict({ txHash: LEG, receipt }), 'unknown');
  }
});

test('with no transaction, only a terminal provider state settles it', () => {
  for (const state of ['FAILED', 'DENIED', 'CANCELLED', 'cancelled']) {
    assert.equal(
      fundingVerdict({ txHash: null, receipt: 'not_found', providerState: state }),
      'did_not_land',
    );
  }
  for (const state of ['SENT', 'CONFIRMED', 'INITIATED', '', undefined]) {
    assert.equal(
      fundingVerdict({ txHash: null, receipt: 'not_found', providerState: state }),
      'unknown',
    );
  }
});

test('a transfer still queued at the provider is not a failed transfer', () => {
  assert.equal(
    fundingVerdict({ txHash: null, receipt: 'not_found', providerState: 'SENT' }),
    'unknown',
  );
});

test('a stalled movement with no transaction can be started again', () => {
  assert.equal(fundingRestart([]), true);
  assert.equal(fundingRestart([{}, { txHash: null }, { txHash: '  ' }]), true);
});

test('a movement holding a transaction is never restarted', () => {
  // Re-sending would move the money a second time. It gets completed against
  // its proof instead.
  assert.equal(fundingRestart([{ txHash: LEG }]), false);
  assert.equal(fundingRestart([{}, { txHash: LEG }]), false);
});
