import assert from 'node:assert/strict';
import test from 'node:test';
import { inboundSummaryText } from './inboundSummary.js';

test('money into your own wallet is added', () => {
  assert.equal(inboundSummaryText({ amountUsdc: '10', chain: 'Ethereum Sepolia', toSelf: true }), 'Added 10 USDC from Ethereum Sepolia to Arc');
});

test('paying someone else reads as sent, by tag when they have one', () => {
  const recipient = '0x7711886865c33606ebd977da02a6a25373c75c11';
  assert.equal(
    inboundSummaryText({ amountUsdc: '10', chain: 'Ethereum Sepolia', toSelf: false, recipient, recipientTag: 'ada' }),
    'Sent 10 USDC from Ethereum Sepolia to @ada',
  );
  assert.equal(
    inboundSummaryText({ amountUsdc: '10', chain: 'Ethereum Sepolia', toSelf: false, recipient }),
    'Sent 10 USDC from Ethereum Sepolia to 0x7711…5c11',
  );
});
