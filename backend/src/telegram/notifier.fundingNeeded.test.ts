import assert from 'node:assert/strict';
import test from 'node:test';
import { recipientsFor, summaryFor } from './notifier.js';
import type { KarwanEvent } from '../events.js';

/// A seller tried to take an offer the financier's wallet no longer covers:
/// only the financier hears, with the amount to add.
///
///   npx tsx --test src/telegram/notifier.fundingNeeded.test.ts

const short = {
  type: 'factoring.funding_needed', actor: 'platform', ts: 0,
  payload: { offerId: 'o1', invoiceId: '0xjob', financier: '0xF', shortfallUsdc: '569.03' },
} as unknown as KarwanEvent;

test('only the financier is told, with the amount to add', async () => {
  const to = await recipientsFor(short);
  assert.deepEqual(to.map((r) => r.address), ['0xf']);
  const s = summaryFor(short, to[0]!.role);
  assert.match(s!.text, /Add 569\.03 USDC/);
});
