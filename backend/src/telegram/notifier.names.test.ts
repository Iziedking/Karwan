import assert from 'node:assert/strict';
import test from 'node:test';
import { summaryFor } from './notifier.js';
import type { KarwanEvent } from '../events.js';

/// Telegram names people by their Karwan tag, never by a wallet address, unless
/// nobody has named that wallet yet.
///
///   npx tsx --test src/telegram/notifier.names.test.ts

const BUYER = '0x1111111111111111111111111111111111111111';
const SELLER = '0xb41c00000000000000000000000000000000001b2'.slice(0, 42);
const names = new Map([[BUYER, '@ada'], [SELLER, '@grachi']]);

const opened = {
  type: 'deal.direct.created', actor: 'buyer', ts: 0, jobId: '0xjob',
  payload: { seller: SELLER, dealAmountUsdc: '20' },
} as unknown as KarwanEvent;

const message = {
  type: 'chat.message', actor: 'buyer', ts: 0, jobId: '0xjob',
  payload: { sender: BUYER, body: 'hello grachi' },
} as unknown as KarwanEvent;

test('a deal opened names the other person by their tag', () => {
  const text = summaryFor(opened, 'buyer', 'en', { names })!.text;
  assert.match(text, /\*Deal opened\* with @grachi at 20 USDC/);
  assert.doesNotMatch(text, /0x/);
});

test('a wallet nobody has named reads as a short address, plain', () => {
  assert.match(summaryFor(opened, 'buyer')!.text, /with 0xb41c…/);
  assert.doesNotMatch(summaryFor(opened, 'buyer')!.text, /`/);
});

test('a message says who it is from, and the sender sees who it went to', () => {
  assert.match(summaryFor(message, 'seller', 'en', { names })!.text, /^\*Message from @ada\*\nhello grachi/);
  assert.match(summaryFor(message, 'self', 'en', { names, counterparty: SELLER })!.text, /^\*You wrote to @grachi\*\nhello grachi/);
});
