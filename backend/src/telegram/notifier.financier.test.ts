import assert from 'node:assert/strict';
import test from 'node:test';

process.env.NODE_ENV = 'test';
process.env.FRONTEND_BASE_URL = 'https://testnet.karwan.site';
const { financierSummaryFor, summaryFor, RELEVANT } = await import('./notifier.js');
const { financierContentFor, contentFor } = await import('../emails/dealNotifier.js');
const { FINANCIER_FOLLOWS } = await import('../financial/dealFinanciers.js');

/// A financier hears about the deal under their position, in Telegram and by
/// email, and the button opens their position, not the deal.
///
///   npx tsx --test src/telegram/notifier.financier.test.ts

const event = (type: string) => ({ id: 'e1', type, jobId: '0xdeal', actor: 'chain', ts: 1, payload: {} });

test('every event a financier follows reaches Telegram', () => {
  for (const type of FINANCIER_FOLLOWS) assert.ok(RELEVANT.has(type), type);
});

test('the Telegram alert names the deal they financed and opens their position', () => {
  const summary = financierSummaryFor(event('deal.disputed') as never, '/financier/factoring/off-1', 'en');
  assert.ok(summary);
  assert.match(summary!.text, /^\*A deal you financed is in dispute\*\n/);
  assert.equal(summary!.url, 'https://testnet.karwan.site/financier/factoring/off-1');
});

test('the email alert opens the same position', () => {
  const content = financierContentFor(event('escrow.milestone.released') as never, '/financier/po/line-1');
  assert.equal(content?.subject, 'Payment released on a deal you financed');
  assert.equal(content?.ctaUrl, 'https://testnet.karwan.site/financier/po/line-1');
});

test('the events added for financiers send nothing new to buyer or seller', () => {
  for (const type of ['deal.delivered.onchain', 'deal.deadline.passed', 'deal.dispute.auto_resolved', 'escrow.refunded', 'escrow.reclaimed']) {
    for (const role of ['buyer', 'seller']) {
      assert.equal(summaryFor(event(type) as never, role), null, `${type} ${role}`);
    }
  }
  for (const type of ['escrow.milestone.released', 'escrow.refunded', 'escrow.reclaimed', 'deal.cancelled']) {
    for (const role of ['buyer', 'seller'] as const) assert.equal(contentFor(event(type) as never, role, 'service'), null, `${type} ${role}`);
  }
});

test('an event the financier does not follow says nothing to them', () => {
  assert.equal(financierSummaryFor(event('deal.matched') as never, '/financier/po/line-1'), null);
  assert.equal(financierContentFor(event('chat.message') as never, '/financier/po/line-1'), null);
});
