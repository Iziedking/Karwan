import assert from 'node:assert/strict';
import test from 'node:test';
import type { ShortlistEntry } from '@/core/api';
import { shortlistCopy } from '@/shared/i18n/messages/shortlist';
import { shortlistCostLine, shortlistNotice, shortlistRowView, shortlistState } from './shortlistPresentation';

const copy = shortlistCopy.en;

const ada: ShortlistEntry = {
  rank: 1, seller: '0xs', sellerUser: '0xu', name: 'Ada Okafor', tag: 'ada', level: 'work_verified', verified: true,
  score: 82, tier: 'STRONG', counts: { completed: 12, onTimeRate: 92, disputesLost: 0 }, offer: 'Landing page',
  deliveryDays: 5, priceUsdc: 80, askedUsdc: 95, recordChecked: true, recommended: true, reasons: ['best_fit', 'verified'],
  state: 'ready', isNew: false,
};

test('a verified row reads level and tier, never a score, with offer, days and the numbers the server sent', () => {
  const v = shortlistRowView(ada, copy);
  assert.equal(v.levelLine, 'Verified · Strong');
  assert.equal(v.offerLine, 'Landing page · 5 days');
  assert.equal(v.askedLine, 'asked 95');
  assert.equal(v.numbersLine, '12 completed deals · 92% on time · 0 disputes lost · Record checked');
  assert.equal(v.reasonLine, 'Best skill match · Verified');
  assert.equal(v.profileHref, '/r/ada');
  assert.equal(v.choosable, true);
});

test('an unverified row with no history says so in words', () => {
  const v = shortlistRowView({ ...ada, verified: false, level: 'registered', tier: 'NEW', score: 12, recommended: false, reasons: [], counts: { completed: 0, onTimeRate: null, disputesLost: 0 }, askedUsdc: null, recordChecked: false }, copy);
  assert.equal(v.levelLine, 'Not verified · New');
  assert.equal(v.numbersLine, 'No completed deals yet');
  assert.equal(v.askedLine, null);
  assert.equal(v.reasonLine, null);
});

test('one completed deal and one lost dispute read in the singular', () => {
  const v = shortlistRowView({ ...ada, counts: { completed: 1, onTimeRate: null, disputesLost: 1 }, recordChecked: false }, copy);
  assert.equal(v.numbersLine, '1 completed deal · 1 dispute lost');
});

test('an unavailable row cannot be chosen, a negotiating one can', () => {
  assert.equal(shortlistRowView({ ...ada, state: 'unavailable' }, copy).choosable, false);
  assert.equal(shortlistRowView({ ...ada, state: 'negotiating' }, copy).choosable, true);
});

test('the list notice explains a missing recommendation', () => {
  assert.equal(shortlistNotice([ada], copy), null);
  assert.equal(shortlistNotice([{ ...ada, recommended: false, verified: false }], copy), copy.noneVerified);
  assert.equal(shortlistNotice([{ ...ada, recommended: false }], copy), copy.noneInBudget);
  assert.equal(shortlistNotice([], copy), copy.noneYet);
});

test('every locale has every key and no em dash', () => {
  const keys = (o: object): string[] => Object.entries(o).flatMap(([k, v]) => (typeof v === 'object' ? keys(v).map((s) => `${k}.${s}`) : [k])).sort();
  for (const locale of ['fr', 'ar', 'hi', 'sw'] as const) {
    assert.deepEqual(keys(shortlistCopy[locale]), keys(shortlistCopy.en), locale);
    assert.doesNotMatch(JSON.stringify(shortlistCopy[locale]), /—/);
  }
});

test('shortlistState: a reply without an entries array falls back to the offers list', () => {
  assert.equal(shortlistState({} as never), null);
  assert.equal(shortlistState({ closed: false } as never), null);
  assert.equal(shortlistState({ entries: null, closed: true } as never), null);
  assert.equal(shortlistState(null as never), null);
});

test('shortlistState: a reply with entries passes through', () => {
  const reply = { entries: [ada], closed: false, worldCheck: null };
  assert.deepEqual(shortlistState(reply), reply);
});

test('a sealed row reads level and tier with reasons, and no numbers', () => {
  const v = shortlistRowView({ ...ada, score: null, counts: null, recordChecked: false }, copy);
  assert.equal(v.levelLine, 'Verified · Strong');
  assert.equal(v.numbersLine, null);
  assert.equal(v.reasonLine, 'Best skill match · Verified');
});

test('a sealed row that was checked says so without numbers', () => {
  assert.equal(shortlistRowView({ ...ada, score: null, counts: null }, copy).numbersLine, 'Record checked');
});

test('reasons show on every row, not only the recommended one', () => {
  assert.equal(shortlistRowView({ ...ada, recommended: false }, copy).reasonLine, 'Best skill match · Verified');
});

test('the cost line names how many records were checked and the total', () => {
  assert.equal(shortlistCostLine({ count: 3, usdc: 0.03 }, copy), 'Your agent checked 3 records · 0.03 USDC');
  assert.equal(shortlistCostLine({ count: 1, usdc: 0.01 }, copy), 'Your agent checked 1 record · 0.01 USDC');
  assert.equal(shortlistCostLine({ count: 0, usdc: 0 }, copy), null);
  assert.equal(shortlistCostLine(undefined, copy), null);
});

test('an offer above the budget says it is outside the request and can still be chosen (view 41, decision 11)', () => {
  const v = shortlistRowView({ ...ada, outsideRequest: true, recommended: false }, copy);
  assert.equal(v.markLine, 'Above your budget, outside your request');
  assert.equal(v.choosable, true);
});

test('a seller whose agent is not linked is listed, says why, and cannot be chosen yet (view 41, decision 13)', () => {
  const v = shortlistRowView({ ...ada, mustLink: true, recommended: false }, copy);
  assert.equal(v.markLine, 'Not linked to their account yet. You can choose them once they link it.');
  assert.equal(v.choosable, false);
  assert.equal(shortlistRowView(ada, copy).markLine, null);
});
