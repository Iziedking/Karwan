import assert from 'node:assert/strict';
import test from 'node:test';
import { assistantShortlistNote, assistantView, sealEntries, unavailableSellers, markUnavailable, pickRecommended, rankCandidates, shortlistChoiceCheck, shouldSkipBuyer, shortlistLimits, toEntries, SHORTLIST_MAX, type ShortlistCandidate } from './shortlist.js';

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
  locationFit: 1,
  country: null,
  rating: { kind: 'new', count: 0 },
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

test('the shortlist recommends within the leeway, while within budget keeps meaning the budget (view 35)', () => {
  const limits = shortlistLimits(120, 25);
  assert.deepEqual(limits, { recommendUpTo: 150, budget: 120 });
  assert.deepEqual(shortlistLimits(120, undefined), { recommendUpTo: 120, budget: 120 });
  const ranked = rankCandidates([c({ seller: 'z', askedUsdc: 142.71 })]);
  const rec = pickRecommended(ranked, limits.recommendUpTo);
  assert.equal(rec?.seller, 'z', '142.71 is within a 25% leeway on 120');
  assert.equal(pickRecommended(rankCandidates([c({ askedUsdc: 151 })]), limits.recommendUpTo), null, 'never above the cap');
  const [entry] = toEntries(ranked, rec, limits.budget, null, []);
  assert.ok(!entry!.reasons.includes('within_budget'), 'above the budget is not called within budget');
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
  const out = assistantView(toEntries(ranked, pickRecommended(ranked, 100), 100, null, []), false);
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

test('on testnet a clean Karwan record can be recommended when nobody verified fits, and is still shown as not verified', () => {
  const clean = c({ seller: 'k', level: 'registered', askedUsdc: 90, counts: { completed: 82, onTimeRate: 97, disputesWon: 0, disputesLost: 0, cancelled: 0 } });
  const ranked = rankCandidates([clean]);
  assert.equal(pickRecommended(ranked, 100), null, 'mainnet rule unchanged');
  const rec = pickRecommended(ranked, 100, new Set(), { cleanRecordCounts: true });
  assert.equal(rec?.seller, 'k');
  const [e] = toEntries(ranked, rec, 100, null, []);
  assert.equal(e!.verified, false);
  assert.ok(!e!.reasons.includes('verified'));
});

test('on testnet a verified seller still comes first, and a lost dispute or no deals never qualifies', () => {
  const ranked = rankCandidates([
    c({ seller: 'clean', level: 'registered', askedUsdc: 50, deterministicScore: 99 }),
    c({ seller: 'ver', level: 'work_verified', askedUsdc: 90, deterministicScore: 10 }),
  ]);
  assert.equal(pickRecommended(ranked, 100, new Set(), { cleanRecordCounts: true })?.seller, 'ver');
  const lost = rankCandidates([c({ level: 'registered', counts: { completed: 9, onTimeRate: 90, disputesWon: 0, disputesLost: 1, cancelled: 0 } })]);
  assert.equal(pickRecommended(lost, 100, new Set(), { cleanRecordCounts: true }), null);
  const none = rankCandidates([c({ level: 'registered', counts: { completed: 0, onTimeRate: null, disputesWon: 0, disputesLost: 0, cancelled: 0 } })]);
  assert.equal(pickRecommended(none, 100, new Set(), { cleanRecordCounts: true }), null);
});

test('a shortlist with no recommendation stays open for the buyer to choose', async () => {
  const { readFileSync } = await import('node:fs');
  const buyer = readFileSync(new URL('./buyer.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(buyer, /markNegotiationEnded\(state, 'shortlist-no-recommendation'\)/);
  assert.match(buyer, /cleanRecordCounts: config\.ARC_NETWORK === 'testnet'/);
});

test('sealed shortlist entries keep tier and reasons and drop score and counts', () => {
  const ranked = rankCandidates([c({ seller: 'v' })]);
  const [e] = sealEntries(toEntries(ranked, pickRecommended(ranked, 100), 100, null, []));
  assert.equal(e!.score, null);
  assert.equal(e!.counts, null);
  assert.equal(e!.tier, 'STRONG');
  assert.ok(e!.reasons.length > 0);
});

test("the assistant never receives another person's numbers when records are sealed", () => {
  const ranked = rankCandidates([c({ seller: 'v', name: 'Ada' })]);
  const [o] = assistantView(toEntries(ranked, pickRecommended(ranked, 100), 100, null, []), true);
  for (const k of ['score', 'completedDeals', 'onTimePercent', 'disputesLost']) assert.ok(!(k in o!), k);
  assert.equal(o!.verified, true);
  assert.equal(o!.tier, 'STRONG');
});

test('every row carries its reasons, not only the recommended one', () => {
  const ranked = rankCandidates([c({ seller: 'a', deterministicScore: 90 }), c({ seller: 'b', askedUsdc: 60, deterministicScore: 10 })]);
  const entries = toEntries(ranked, pickRecommended(ranked, 100), 100, null, []);
  const other = entries.find((e) => !e.recommended)!;
  assert.ok(other.reasons.length > 0);
  assert.ok(other.reasons.includes('verified'));
});

test('once records are sealed the assistant is told to describe people by tier and reasons, never numbers', () => {
  assert.doesNotMatch(assistantShortlistNote(true), /score|completed deals|on-time|disputes/);
  assert.match(assistantShortlistNote(true), /tier/);
  assert.match(assistantShortlistNote(false), /score/);
});

test('a nearby verified seller ranks above a far one in the same match band', () => {
  const out = rankCandidates([
    c({ seller: 'far', locationFit: 1, deterministicScore: 99 }),
    c({ seller: 'near', locationFit: 3, deterministicScore: 10 }),
  ]);
  assert.deepEqual(out.map((x) => x.seller), ['near', 'far']);
});

test('skill band still beats location', () => {
  const out = rankCandidates([c({ seller: 'near', matchBand: 2, locationFit: 4 }), c({ seller: 'fit', matchBand: 3, locationFit: 0 })]);
  assert.equal(out[0]!.seller, 'fit');
});

test('a nearby recommendation says so, and entries carry country only', () => {
  const ranked = rankCandidates([c({ seller: 'near', locationFit: 3, country: 'NG' })]);
  const [entry] = toEntries(ranked, ranked[0]!, 100, null, []);
  assert.ok(entry!.reasons.includes('nearby'));
  assert.equal(entry!.country, 'NG');
});

test('no shortlist entry carries city or area', () => {
  const ranked = rankCandidates([c({ seller: 'near', locationFit: 4, country: 'NG' })]);
  const text = JSON.stringify(toEntries(ranked, null, 100, null, []));
  for (const k of ['"city"', '"area"', '"reach"', '"locationFit"']) assert.equal(text.includes(k), false, k);
});

test('the shortlist ranks a 4.8 from 20 above a 4.9 from 2 at equal fit', () => {
  const out = rankCandidates([
    c({ seller: 'few', rating: { kind: 'new', count: 2 }, deterministicScore: 99 }),
    c({ seller: 'many', rating: { kind: 'rated', value: 4.8, count: 20, disputed: 0 }, deterministicScore: 10 }),
    c({ seller: 'lower', rating: { kind: 'rated', value: 4.1, count: 9, disputed: 0 }, deterministicScore: 50 }),
  ]);
  assert.deepEqual(out.map((x) => x.seller), ['many', 'lower', 'few']);
});

test('skill fit still beats a better rating', () => {
  const out = rankCandidates([
    c({ seller: 'rated', matchBand: 2, rating: { kind: 'rated', value: 5, count: 30, disputed: 0 } }),
    c({ seller: 'fit', matchBand: 3 }),
  ]);
  assert.equal(out[0]!.seller, 'fit');
});

test('the rating is public, so it stays on sealed entries', () => {
  const entries = toEntries([c({ seller: 'x', rating: { kind: 'rated', value: 4.6, count: 7, disputed: 0 } })], null, 100, null, []);
  assert.deepEqual(sealEntries(entries)[0]!.rating, { kind: 'rated', value: 4.6, count: 7, disputed: 0 });
  assert.deepEqual(assistantView(entries, true)[0]!.rating, '4.6 from 7 deals');
});

test('a poorly rated seller ranks below one who is still New', () => {
  const out = rankCandidates([
    c({ seller: 'poor', rating: { kind: 'rated', value: 1.2, count: 30, disputed: 0 } }),
    c({ seller: 'new', rating: { kind: 'new', count: 0 } }),
  ]);
  assert.deepEqual(out.map((x) => x.seller), ['new', 'poor']);
});
