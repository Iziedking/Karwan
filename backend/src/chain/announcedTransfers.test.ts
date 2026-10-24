import assert from 'node:assert/strict';
import test from 'node:test';
import { createAnnouncedTransfers } from './announcedTransfers.js';

const TX = `0x${'ab'.repeat(32)}`;

test('a transfer a deal or bridge event already announced is not announced again', () => {
  const seen = createAnnouncedTransfers();
  seen.note({ type: 'bridge.minted', payload: { txHash: TX.toUpperCase().replace('0X', '0x') } });
  assert.equal(seen.has(TX), true, 'the bridge already said it arrived on Arc');
  seen.note({ type: 'escrow.milestone.released', payload: { txHash: `0x${'cd'.repeat(32)}` } });
  assert.equal(seen.has(`0x${'cd'.repeat(32)}`), true, 'the deal already said the payment was released');
});

test('a plain deposit is still announced', () => {
  const seen = createAnnouncedTransfers();
  seen.note({ type: 'wallet.credited', payload: { txHash: TX } });
  seen.note({ type: 'deal.created', payload: {} });
  assert.equal(seen.has(TX), false);
});

test('only the most recent announcements are kept', () => {
  const seen = createAnnouncedTransfers(2);
  for (const n of [1, 2, 3]) seen.note({ type: 'escrow.refunded', payload: { txHash: `0x${String(n).repeat(64)}` } });
  assert.equal(seen.has(`0x${'1'.repeat(64)}`), false);
  assert.equal(seen.has(`0x${'3'.repeat(64)}`), true);
});
