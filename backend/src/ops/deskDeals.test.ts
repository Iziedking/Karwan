import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { DirectDeal } from '../db/deals.js';
import { deskDealRow } from './deskDeals.js';

/// The desk's deal list (view 79): a named allowlist with the deal's title,
/// both @tags and when it is due.
///
///   npx tsx --test src/ops/deskDeals.test.ts

const DAY = 86_400_000;
const T = Date.UTC(2026, 10, 1);

function deal(over: Partial<DirectDeal> = {}): DirectDeal {
  return {
    jobId: '0x3c88aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1111',
    buyer: '0xBUYER',
    seller: '0xseller',
    dealAmountUsdc: '43.94',
    firstReleasePct: 50,
    terms: 'I need a developer to work with me\nPrivate detail on line two',
    delivered: false,
    createdAt: T,
    buyerAgentWalletId: 'wallet-secret',
    ...over,
  } as DirectDeal;
}

const handles = new Map([['0xbuyer', 'kingizie'], ['0xseller', 'otoszn']]);
const handleOf = (a: string) => handles.get(a.toLowerCase()) ?? null;

test('a row names the deal by the first line of its terms and both people by tag', () => {
  const row = deskDealRow(deal(), handleOf);
  assert.equal(row.title, 'I need a developer to work with me');
  assert.equal(row.buyerTag, 'kingizie');
  assert.equal(row.sellerTag, 'otoszn');
  assert.equal(row.parts, 2);
  const text = JSON.stringify(row);
  for (const secret of ['wallet-secret', 'Private detail', 'terms']) assert.ok(!text.includes(secret), secret);
});

test('a long first line is cut, and a seller with only a paytag still reads by tag', () => {
  const row = deskDealRow(deal({ terms: 'x'.repeat(120), seller: '0xnobody', sellerPaytag: 'gadgets' }), handleOf);
  assert.equal(row.title.length, 80);
  assert.ok(row.title.endsWith('…'));
  assert.equal(row.sellerTag, 'gadgets');
});

test('due is the delivery deadline, or the end of the buyer\'s check once delivered', () => {
  assert.equal(deskDealRow(deal({ deadlineUnix: (T + 5 * DAY) / 1000, acceptedAt: T }), handleOf).dueAt, T + 5 * DAY);
  const delivered = deskDealRow(deal({ acceptedAt: T, delivered: true, deliveredAt: T + DAY, reviewWindowDays: 3, reviewExtensionMs: DAY }), handleOf);
  assert.equal(delivered.dueAt, T + 5 * DAY);
  assert.equal(deskDealRow(deal({ milestonePcts: [25, 25, 50] }), handleOf).parts, 3);
  assert.equal(deskDealRow(deal(), handleOf).dueAt, null);
});
