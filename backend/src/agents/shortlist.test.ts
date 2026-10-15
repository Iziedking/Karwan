import assert from 'node:assert/strict';
import test from 'node:test';
import { assistantView, unavailableSellers, markUnavailable, pickRecommended, rankCandidates, shortlistChoiceCheck, shouldSkipBuyer, toEntries, SHORTLIST_MAX, type ShortlistCandidate } from './shortlist.js';

const c = (over: Partial<ShortlistCandidate>): ShortlistCandidate => ({
  seller: '0xs',
  sellerUser: '0xu',
  name: 'S',
  tag: null,
  level: 'work_verified',
  matchBand: 3,
  deterministicScore: 50,
  engineScore: 700,
  tier: 'STRONG',
  counts: { completed: 4, onTimeRate: 100, disputesWon: 0, disputesLost: 0, cancelled: 0 },
  offer: 'Landing page',
  deliveryDays: 5,
  askedUsdc: 80,
  recordChecked: false,
  ...over,
});

test('skill band comes first, then verified over unverified, then score', () => {
  const out = rankCandidates([
    c({ seller: 'a', matchBand: 2, level: 'work_verified', deterministicScore: 99 }),
    c({ seller: 'b', matchBand: 3, level: 'registered', deterministicScore: 90 }),
    c({ seller: 'c', matchBand: 3, level: 'work_verified', deterministicScore: 10 }),
  ]);
  assert.deepEqual(out.map((x) => x.seller), ['c', 'b', 'a']);
});

test('an unverified seller is never recommended', () => {
  const ranked = rankCandidates([c({ seller: 'u', level: 'person_verified', askedUsdc: 10 })]);
  assert.equal(pickRecommended(ranked, 100), null);
});

test('no verified seller in budget means no recommendation', () => {
  assert.equal(pickRecommended(rankCandidates([c({ askedUsdc: 120 })]), 100), null);
});

test('the first verified seller in budget is recommended', () => {
  const ranked = rankCandidates([c({ seller: 'x', askedUsdc: 150 }), c({ seller: 'y', askedUsdc: 90, deterministicScore: 10 })]);
  assert.equal(pickRecommended(ranked, 100)?.seller, 'y');
});

test('entries carry the 0-100 score, the agreed price and the ask, at most five', () => {
  const many = Array.from({ length: 8 }, (_, i) => c({ seller: `s${i}`, deterministicScore: 100 - i }));
  const ranked = rankCandidates(many);
  const rec = pickRecommended(ranked, 100);
  const entries = toEntries(ranked, rec, 100, { seller: 's0', priceUsdc: 70 }, []);
  assert.equal(entries.length, SHORTLIST_MAX);
  assert.equal(entries[0]!.score, 70);
  assert.equal(entries[0]!.priceUsdc, 70);
  assert.equal(entries[0]!.askedUsdc, 80);
  assert.equal(entries[0]!.state, 'ready');
  assert.equal(entries[1]!.askedUsdc, null);
  assert.equal(entries.filter((e) => e.recommended).length, 1);
  assert.ok(entries[0]!.reasons.includes('verified'));
});

test('the recommended row is negotiating until a price is agreed', () => {
  const ranked = rankCandidates([c({ seller: 'a' })]);
  const [e] = toEntries(ranked, pickRecommended(ranked, 100), 100, null, []);
  assert.equal(e!.state, 'negotiating');
});

test('a seller new to a later list is marked new, and a better verified newcomer takes the recommendation', () => {
  const first = toEntries(rankCandidates([c({ seller: 'a' })]), null, 100, null, []);
  const ranked = rankCandidates([c({ seller: 'a' }), c({ seller: 'b', deterministicScore: 90 })]);
  const second = toEntries(ranked, pickRecommended(ranked, 100), 100, null, first);
  assert.equal(second.find((e) => e.seller === 'b')?.isNew, true);
  assert.equal(second.find((e) => e.seller === 'b')?.recommended, true);
  assert.equal(second.find((e) => e.seller === 'a')?.isNew, false);
});

test('a withdrawn seller is marked unavailable and loses the recommendation', () => {
  const ranked = rankCandidates([c({ seller: 'a' })]);
  const entries = markUnavailable(toEntries(ranked, pickRecommended(ranked, 100), 100, null, []), 'A');
  assert.equal(entries[0]!.state, 'unavailable');
  assert.equal(entries[0]!.recommended, false);
});

test('a seller skips a buyer who lost more disputes than they completed, unless they opt in', () => {
  const bad = { completed: 1, onTimeRate: null, disputesWon: 0, disputesLost: 2, cancelled: 0 };
  assert.equal(shouldSkipBuyer(bad, false), true);
  assert.equal(shouldSkipBuyer(bad, true), false);
  assert.equal(shouldSkipBuyer(null, false), false);
  assert.equal(shouldSkipBuyer({ ...bad, disputesLost: 1 }, false), false);
});

test('choosing from the shortlist: unavailable is refused, unverified needs the acknowledgement', () => {
  const ranked = rankCandidates([c({ seller: 'v' }), c({ seller: 'u', level: 'registered' }), c({ seller: 'x' })]);
  const entries = markUnavailable(toEntries(ranked, pickRecommended(ranked, 100), 100, null, []), 'x');
  assert.deepEqual(shortlistChoiceCheck(entries, 'V', false), { ok: true });
  assert.deepEqual(shortlistChoiceCheck(entries, 'u', false), { ok: false, code: 'unverified-needs-ack' });
  assert.deepEqual(shortlistChoiceCheck(entries, 'u', true), { ok: true });
  assert.deepEqual(shortlistChoiceCheck(entries, 'x', true), { ok: false, code: 'unavailable' });
  assert.deepEqual(shortlistChoiceCheck(entries, 'not-listed', false), { ok: true });
});

test('the shortlist reaches the assistant in rank order with level, score and numbers, never addresses of people', () => {
  const ranked = rankCandidates([c({ seller: 'v', name: 'Ada' }), c({ seller: 'u', name: 'Kemi', level: 'registered' })]);
  const out = assistantView(toEntries(ranked, pickRecommended(ranked, 100), 100, null, []));
  assert.deepEqual(out.map((o) => o.rank), [1, 2]);
  assert.equal(out[0]!.name, 'Ada');
  assert.equal(out[0]!.verified, true);
  assert.equal(out[0]!.recommended, true);
  assert.equal(out[0]!.completedDeals, 4);
  assert.equal(out[0]!.onTimePercent, 100);
  assert.equal(out[1]!.verified, false);
  assert.equal(out[1]!.seller, 'u');
  assert.ok(!('sellerUser' in out[0]!));
});

test('a seller marked unavailable stays unavailable and unrecommended after a refresh', () => {
  const ranked = rankCandidates([c({ seller: 'a', deterministicScore: 90 }), c({ seller: 'b' })]);
  const first = markUnavailable(toEntries(ranked, pickRecommended(ranked, 100), 100, null, []), 'a');
  const gone = unavailableSellers(first);
  const again = toEntries(ranked, pickRecommended(ranked, 100, gone), 100, null, first);
  assert.equal(again.find((e) => e.seller === 'a')?.state, 'unavailable');
  assert.equal(again.find((e) => e.seller === 'a')?.recommended, false);
  assert.equal(again.find((e) => e.seller === 'b')?.recommended, true);
});

test('a recommended row whose negotiation ended stays ready after a refresh', () => {
  const ranked = rankCandidates([c({ seller: 'a' })]);
  const rec = pickRecommended(ranked, 100);
  const ended = toEntries(ranked, rec, 100, null, []).map((e) => ({ ...e, state: 'ready' as const }));
  assert.equal(toEntries(ranked, rec, 100, null, ended)[0]!.state, 'ready');
});

test('a seller off the list still needs the acknowledgement when not verified', () => {
  assert.deepEqual(shortlistChoiceCheck([], 'z', false, false), { ok: false, code: 'unverified-needs-ack' });
  assert.deepEqual(shortlistChoiceCheck([], 'z', true, false), { ok: true });
  assert.deepEqual(shortlistChoiceCheck([], 'z', false, true), { ok: true });
});
