import assert from 'node:assert/strict';
import test from 'node:test';
import { listingBidTerms } from './bargainOpening.js';
import { budgetRange } from './budgetRange.js';
import { nextMove } from './concession.js';
import { counterSent, stepBook, type Book, type BookAction, type BookContext } from './negotiationBook.js';
import { rankCandidates, type ShortlistCandidate } from './shortlist.js';

/// View 73, the request that started it, replayed through the pure modules:
/// "4 different clothes sewn", budget 222 USDC, no leeway, no market price.
/// One seller posted far under the budget, three over it, one of them Fixed.

const BUDGET = 222;

interface Seller {
  id: string;
  posted: number;
  lowest: number;
  fit: number;
}

const sellers: Seller[] = [
  { id: '0x30', posted: 30, lowest: 25, fit: 70 },
  { id: '0x255', posted: 255, lowest: 230, fit: 90 },
  { id: '0x267', posted: 267, lowest: 267, fit: 90 },
  { id: '0x271', posted: 271, lowest: 260, fit: 85 },
];

function ctx(round: number): BookContext {
  return {
    jobId: '0xclothes',
    budgetUsdc: BUDGET,
    leewayPct: 0,
    range: budgetRange(BUDGET),
    marketUsdc: null,
    agreeForMe: true,
    timeUsed: Math.min(1, 0.1 + round * 0.15),
    deadlineDays: 7,
    latestDays: null,
    now: 1_000_000 + round * 60_000,
    watchdogMs: 180_000,
    liveScores: new Map(),
  };
}

function replay() {
  const book: Book = new Map();
  const side = new Map<string, { opening: number; floor: number; current: number; exchanges: number; lastBuyer: number | null; midpointUsed: boolean; counterable: boolean }>();
  const actions: BookAction[] = [];

  for (const s of sellers) {
    const terms = listingBidTerms(
      { askingPriceUsdc: s.posted, floorUsdc: s.lowest },
      { budgetUsdc: BUDGET, leewayPct: 0, bargain: true },
      { marketUsdc: null, fit: s.fit / 100, record: 0.5, heat: 0.5, seed: `${s.id}:0xclothes` },
    );
    side.set(s.id, { opening: terms.openedUsdc, floor: terms.floorUsdc, current: terms.askingPriceUsdc, exchanges: 0, lastBuyer: null, midpointUsed: false, counterable: terms.counterable });
    actions.push(
      ...stepBook(book, { kind: 'offer', seller: s.id, priceUsdc: terms.askingPriceUsdc.toFixed(2), counterable: terms.counterable, postedUsdc: terms.askingPriceUsdc <= BUDGET ? String(s.posted) : null }, ctx(0)),
    );
  }

  let pending = actions.filter((a): a is Extract<BookAction, { kind: 'counter' }> => a.kind === 'counter');
  const countered = new Set(pending.map((a) => a.seller));
  for (let round = 1; pending.length && round < 20; round += 1) {
    const next: typeof pending = [];
    for (const a of pending) {
      counterSent(book, a.seller, a.counter.key);
      const me = side.get(a.seller)!;
      const theirPrice = Number(a.counter.priceUsdc);
      const move = nextMove({
        role: 'seller',
        opening: me.opening,
        limit: me.floor,
        current: me.current,
        theirPrice,
        theirMoved: me.lastBuyer === null || me.lastBuyer !== theirPrice,
        timeUsed: ctx(round).timeUsed,
        exchanges: me.exchanges,
        competitors: sellers.length - 1,
        seed: `${a.seller}:0xclothes`,
        agreeInsideLimits: true,
        midpointUsed: me.midpointUsed,
        budgetUsdc: BUDGET,
        betterOffer: a.betterOffer,
      });
      me.lastBuyer = theirPrice;
      const reply =
        move.kind === 'accept'
          ? { kind: 'reply' as const, seller: a.seller, priceUsdc: a.counter.priceUsdc, accepted: true }
          : { kind: 'reply' as const, seller: a.seller, priceUsdc: (move.kind === 'ask' ? me.current : move.price).toFixed(2), accepted: false };
      if (move.kind === 'midpoint') me.midpointUsed = true;
      if (move.kind !== 'accept' && move.kind !== 'ask') {
        me.current = move.price;
        if (move.kind !== 'trade') me.exchanges += 1;
      }
      for (const out of stepBook(book, reply, ctx(round))) {
        if (out.kind === 'counter') {
          countered.add(out.seller);
          next.push(out);
        }
      }
    }
    pending = next;
  }
  return { book, side, countered };
}

test('the seller far under the budget is bargained up, never past the budget', () => {
  const { book } = replay();
  const n = book.get('0x30')!;
  assert.equal(n.state, 'agreed');
  const agreed = Number(n.mine);
  assert.ok(agreed > 30 && agreed <= BUDGET, `agreed at ${agreed}`);
});

test('the sellers over the budget are countered down; none agrees above it', () => {
  const { book, countered } = replay();
  for (const id of ['0x255', '0x271']) {
    assert.ok(countered.has(id), `${id} was countered`);
    const n = book.get(id)!;
    assert.ok(['agreed', 'asking', 'ended'].includes(n.state), `${id} finished: ${n.state}`);
    if (n.state === 'agreed') assert.ok(Number(n.mine) <= BUDGET, `${id} agreed at ${n.mine}`);
  }
  // Their lowest is over the budget, so neither can agree inside it.
  assert.notEqual(book.get('0x255')!.state, 'agreed');
});

test('the Fixed price over the budget is never countered', () => {
  const { book, countered } = replay();
  assert.equal(countered.has('0x267'), false);
  assert.equal(book.get('0x267')!.state, 'ended');
});

test('the final order follows the blended score', () => {
  const { book } = replay();
  const price = (id: string) => {
    const n = book.get(id)!;
    return n.state === 'agreed' ? Number(n.mine) : Number(n.standingUsdc);
  };
  const candidates: ShortlistCandidate[] = sellers.map((s) => ({
    seller: s.id,
    sellerUser: `user-${s.id}`,
    name: s.id,
    tag: null,
    level: 'registered',
    matchBand: 2,
    deterministicScore: 50,
    engineScore: 500,
    tier: 'NEW',
    counts: { completed: 0, onTimeRate: null, disputesWon: 0, disputesLost: 0, cancelled: 0 },
    offer: 'Clothes',
    deliveryDays: 7,
    askedUsdc: price(s.id),
    recordChecked: false,
    locationFit: 1,
    country: null,
    rating: { kind: 'new', count: 0 },
    topicalMatch: s.fit,
    openedUsdc: book.get(s.id)!.openedUsdc,
  }));
  const ranked = rankCandidates(candidates, BUDGET, { bargain: true, leewayPct: 0 });
  const scores = ranked.map((c) => c.bargain!.score);
  assert.deepEqual([...scores].sort((a, b) => b - a), scores, 'highest score first');
  assert.equal(ranked[0]!.seller, '0x30', 'the seller who came to the budget leads');
  assert.ok(ranked.every((c) => c.askedUsdc <= BUDGET), 'only prices inside the budget are listed');
});
