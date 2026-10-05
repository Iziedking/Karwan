import assert from 'node:assert/strict';
import test from 'node:test';
import { notifyCopy } from '@/shared/i18n/messages/notifications';
import { summaryFor } from './summary';

const en = notifyCopy.en;

test('a dispute says what can still happen, never that it is handled off-platform', () => {
  const line = summaryFor('deal.disputed', {}, 'buyer', en);
  assert.match(line, /Either side can still propose a cancel/);
  assert.doesNotMatch(line, /off-platform/);
});

test('the seller is told to send the right link when the check holds their delivery', () => {
  assert.equal(
    summaryFor('deal.release.blocked', { detail: 'off-request' }, 'seller', en),
    'Payment is paused: the check found your delivery may not match the request. Send the right link. The money stays in escrow.',
  );
});

test('amounts fill in, and a missing amount falls back to a whole sentence', () => {
  assert.equal(summaryFor('deal.matched', { agreedPriceUsdc: '200' }, 'buyer', en), 'Your agent found a match at 200 USDC. Tap to review.');
  assert.equal(summaryFor('deal.matched', {}, 'buyer', en), 'Your agent found a match. Tap to review.');
  assert.equal(summaryFor('wallet.credited', { amountUsdc: '198.500000', walletRole: 'sellerAgent' }, 'seller', en), '+198.5 USDC landed in your selling agent.');
});

test('every language has a line for the same event, and the bell speaks it', () => {
  for (const locale of ['ar', 'fr', 'hi', 'sw'] as const) {
    const line = summaryFor('deal.disputed', {}, 'buyer', notifyCopy[locale]);
    assert.ok(line.length > 10 && line !== en.disputed, locale);
  }
});

test('a bell amount reads to the cent, and a small one keeps its digits', () => {
  assert.equal(summaryFor('wallet.credited', { amountUsdc: '9.954921', walletRole: 'identity' }, 'buyer', en), '+9.95 USDC landed in your wallet.');
  assert.equal(summaryFor('wallet.credited', { amountUsdc: '0.043785', walletRole: 'identity' }, 'buyer', en), '+0.0438 USDC landed in your wallet.');
});
