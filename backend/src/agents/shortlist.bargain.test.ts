import assert from 'node:assert/strict';
import test from 'node:test';
import { onePerPerson, rankCandidates, toEntries, type ShortlistCandidate } from './shortlist.js';

/// View 73, decision 4 (spec S12, S13): with bargaining on, the shortlist is
/// ordered by one blended score, offers it does not list drop out, and every
/// entry says where its price started and why it ranks where it does.

const c = (over: Partial<ShortlistCandidate>): ShortlistCandidate => ({
  seller: '0xs',
  sellerUser: '0xu',
  name: 'S',
  tag: null,
  level: 'registered',
  matchBand: 2,
  deterministicScore: 50,
  engineScore: 500,
  tier: 'NEW',
  counts: { completed: 0, onTimeRate: null, disputesWon: 0, disputesLost: 0, cancelled: 0 },
  offer: 'Tailoring',
  deliveryDays: 5,
  askedUsdc: 80,
  recordChecked: false,
  locationFit: 1,
  country: null,
  rating: { kind: 'new', count: 0 },
  ...over,
});

const clothes = () => [
  c({ seller: 'a', sellerUser: 'ua', askedUsdc: 255, topicalMatch: 90, matchBand: 3 }),
  c({ seller: 'b', sellerUser: 'ub', askedUsdc: 267, topicalMatch: 90, matchBand: 3 }),
  c({ seller: 'c', sellerUser: 'uc', askedUsdc: 271, topicalMatch: 85, matchBand: 3 }),
  c({ seller: 'low', sellerUser: 'ul', askedUsdc: 30, topicalMatch: 70, matchBand: 2 }),
];

test('with bargain on, the order is the blended score and unlisted offers drop out', () => {
  const out = rankCandidates(clothes(), 222, { bargain: true, leewayPct: 0 });
  assert.deepEqual(out.map((x) => x.seller), ['low']);
  const wider = rankCandidates(
    [c({ seller: 'fit', sellerUser: 'u1', askedUsdc: 200, topicalMatch: 95 }), c({ seller: 'cheap', sellerUser: 'u2', askedUsdc: 60, topicalMatch: 75 })],
    222,
    { bargain: true, leewayPct: 0 },
  );
  assert.deepEqual(wider.map((x) => x.seller), ['cheap', 'fit'], 'a strong fit at a fair price beats a perfect fit that costs far more');
});

test('with bargain off, the order is exactly today\'s', () => {
  const today = rankCandidates(clothes(), 222);
  assert.deepEqual(today.map((x) => x.seller), ['a', 'b', 'c', 'low']);
  assert.deepEqual(rankCandidates(clothes(), 222, { bargain: false }).map((x) => x.seller), today.map((x) => x.seller));
  assert.equal(today[0]!.bargain, undefined);
});

test('equal scores keep the lower price, then the earlier offer', () => {
  const twins = [c({ seller: 'first', sellerUser: 'u1', askedUsdc: 100, topicalMatch: 80 }), c({ seller: 'second', sellerUser: 'u2', askedUsdc: 100, topicalMatch: 80 })];
  assert.deepEqual(rankCandidates(twins, 222, { bargain: true }).map((x) => x.seller), ['first', 'second']);
});

test('an entry says where the price started and why it ranks there', () => {
  const ranked = rankCandidates([c({ seller: 'm', askedUsdc: 227, openedUsdc: 258, topicalMatch: 90 })], 240, { bargain: true });
  const [e] = toEntries(ranked, null, 240, null, []);
  assert.equal(e!.movedFrom, 258);
  assert.deepEqual(e!.why, ranked[0]!.bargain!.why);
  assert.ok(e!.why!.length === 2);
  assert.equal(e!.scoreParts!.fit, 90);
});

test('a price that did not move carries no opening', () => {
  const ranked = rankCandidates([c({ askedUsdc: 100, openedUsdc: 100.004, topicalMatch: 80 })], 222, { bargain: true });
  assert.equal(toEntries(ranked, null, 222, null, [])[0]!.movedFrom, undefined);
});

test('an agreed price shows the opening it moved from', () => {
  const ranked = rankCandidates([c({ seller: 'm', askedUsdc: 230, openedUsdc: 258, topicalMatch: 90 })], 240, { bargain: true });
  const [e] = toEntries(ranked, null, 240, { seller: 'm', priceUsdc: 227 }, []);
  assert.equal(e!.priceUsdc, 227);
  assert.equal(e!.movedFrom, 258);
});

test('onePerPerson still keeps the better row under the new order', () => {
  const ranked = rankCandidates(
    [c({ seller: 'dear', sellerUser: 'same', askedUsdc: 200, topicalMatch: 80 }), c({ seller: 'cheap', sellerUser: 'same', askedUsdc: 50, topicalMatch: 80 })],
    222,
    { bargain: true },
  );
  assert.deepEqual(onePerPerson(ranked).map((x) => x.seller), ['cheap']);
});

test('in person work ranks the nearer seller first at equal skill and price', () => {
  const out = rankCandidates(
    [c({ seller: 'far', sellerUser: 'u1', topicalMatch: 80, inPerson: true, locationFit: 0 }), c({ seller: 'near', sellerUser: 'u2', topicalMatch: 80, inPerson: true, locationFit: 4 })],
    222,
    { bargain: true },
  );
  assert.deepEqual(out.map((x) => x.seller), ['near', 'far']);
});
