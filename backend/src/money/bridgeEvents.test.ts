import assert from 'node:assert/strict';
import test from 'node:test';
import { recordedBridgeMintedPayload } from './bridgeEvents.js';

const base = {
  bridgeId: 'b1',
  amountUsdc: '25',
  mintRecipient: '0xabc',
  reference: 'KRW-1',
  movementState: 'completed',
};

test('a recorded transfer says which way it went', () => {
  assert.equal(recordedBridgeMintedPayload({ ...base, direction: 'out', mintTxHash: '0xmint' }).direction, 'out');
  assert.equal(recordedBridgeMintedPayload({ ...base, direction: 'in', mintTxHash: '0xmint' }).direction, 'in');
});

test('the payload keeps every field clients already read', () => {
  assert.deepEqual(
    recordedBridgeMintedPayload({ ...base, direction: 'in', burnTxHash: '0xburn', mintTxHash: '0xmint' }),
    {
      bridgeId: 'b1',
      amountUsdc: '25',
      mintRecipient: '0xabc',
      sourceTxHash: '0xburn',
      txHash: '0xmint',
      reference: 'KRW-1',
      movementState: 'completed',
      direction: 'in',
    },
  );
});

test('a transfer without a mint hash says it was already minted', () => {
  const payload = recordedBridgeMintedPayload({ ...base, direction: 'in' });
  assert.equal(payload.alreadyMinted, true);
  assert.equal('txHash' in payload, false);
  assert.equal(payload.sourceTxHash, '');
});
