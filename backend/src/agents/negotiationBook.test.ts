import assert from 'node:assert/strict';
import test from 'node:test';
import { budgetRange } from './budgetRange.js';
import { counterSent, resumeBook, stepBook, yourCalls, type Book, type BookAction, type BookContext } from './negotiationBook.js';
import { fromNotes, toNotes, type NotesFields } from './requestNotes.js';
import { onePerPerson, rankCandidates, type ShortlistCandidate } from './shortlist.js';

/// View 73 (spec S7, S8, S11): the buyer agent bargains with every seller at
/// once, one negotiation per offer, restart safe.

const ctx = (over: Partial<BookContext> = {}): BookContext => ({
  jobId: '0xJOB',
  budgetUsdc: 222,
  leewayPct: 0,
  range: budgetRange(222),
  marketUsdc: null,
  agreeForMe: true,
  timeUsed: 0.1,
  deadlineDays: 5,
  latestDays: null,
  now: 1_000_000,
  watchdogMs: 180_000,
  liveScores: new Map(),
  ...over,
});

const counters = (actions: BookAction[]) => actions.filter((a): a is Extract<BookAction, { kind: 'counter' }> => a.kind === 'counter');

function threeOffers(c: BookContext = ctx()): { book: Book; actions: BookAction[] } {
  const book: Book = new Map();
  const actions = [
    ...stepBook(book, { kind: 'offer', seller: '0xA', priceUsdc: '120', counterable: true, postedUsdc: '30' }, c),
    ...stepBook(book, { kind: 'offer', seller: '0xB', priceUsdc: '200', counterable: true }, c),
    ...stepBook(book, { kind: 'offer', seller: '0xC', priceUsdc: '260', counterable: true }, c),
  ];
  return { book, actions };
}

test('three offers are countered at once, each from its own opening', () => {
  const { book, actions } = threeOffers();
  const sent = counters(actions);
  assert.deepEqual(sent.map((a) => [a.seller, a.counter.priceUsdc]), [['0xA', '30.00'], ['0xB', '160.00'], ['0xC', '188.70']]);
  assert.deepEqual(sent.map((a) => a.counter.key), ['counter:0xjob:0xa:1', 'counter:0xjob:0xb:1', 'counter:0xjob:0xc:1']);
  for (const n of book.values()) {
    assert.equal(n.state, 'open');
    assert.ok(n.pending, 'written down before it is sent');
    assert.equal(n.watchdogDueAt, 1_180_000);
  }
});

test('a late offer starts its own negotiation', () => {
  const { book } = threeOffers();
  const before = JSON.stringify([...book.values()]);
  const late = stepBook(book, { kind: 'offer', seller: '0xD', priceUsdc: '210', counterable: true }, ctx());
  assert.equal(counters(late).length, 1);
  assert.equal(book.size, 4);
  assert.equal(JSON.stringify([...book.values()].slice(0, 3)), before, 'the others are untouched');
});

test('a reply from one seller moves only that negotiation', () => {
  const { book } = threeOffers();
  const reply = stepBook(book, { kind: 'reply', seller: '0xB', priceUsdc: '190', accepted: false }, ctx());
  const [step] = counters(reply);
  assert.ok(step && Number(step.counter.priceUsdc) > 160 && Number(step.counter.priceUsdc) <= 222);
  assert.equal(step.counter.round, 2);
  assert.equal(book.get('0xa')!.rounds, 1);
  assert.equal(book.get('0xc')!.rounds, 1);
});

test('a Fixed price over the budget is not countered and ends for the near match', () => {
  const book: Book = new Map();
  const out = stepBook(book, { kind: 'offer', seller: '0xF', priceUsdc: '255', counterable: false }, ctx());
  assert.deepEqual(out, [{ kind: 'end', seller: '0xF', reason: 'fixed-over-budget' }]);
  assert.equal(book.get('0xf')!.state, 'ended');
  assert.deepEqual(stepBook(book, { kind: 'reply', seller: '0xF', priceUsdc: '250', accepted: false }, ctx()), []);
});

test('better offer only when it is true', () => {
  const liveScores = new Map([
    ['0xA', { score: 70, priceUsdc: 120 }],
    ['0xB', { score: 60, priceUsdc: 200 }],
    ['0xC', { score: 80, priceUsdc: 190 }],
  ]);
  const sent = counters(threeOffers(ctx({ liveScores })).actions);
  assert.deepEqual(sent.map((a) => [a.seller, a.betterOffer]), [['0xA', false], ['0xB', true], ['0xC', false]]);
});

test('Agree for me off asks the person before agreeing, with the gap', () => {
  const late = ctx({ timeUsed: 1 });
  const off = ctx({ timeUsed: 1, agreeForMe: false });
  for (const [c, expected] of [
    [off, { kind: 'ask-person', seller: '0xA', priceUsdc: '35.00', gapUsdc: '5.00' }],
    [late, { kind: 'agree', seller: '0xA', priceUsdc: '35.00' }],
  ] as const) {
    const book: Book = new Map();
    stepBook(book, { kind: 'offer', seller: '0xA', priceUsdc: '120', counterable: true, postedUsdc: '30' }, c);
    assert.deepEqual(stepBook(book, { kind: 'reply', seller: '0xA', priceUsdc: '35', accepted: false }, c), [expected]);
  }
  const book: Book = new Map();
  stepBook(book, { kind: 'offer', seller: '0xA', priceUsdc: '120', counterable: true, postedUsdc: '30' }, off);
  assert.deepEqual(stepBook(book, { kind: 'reply', seller: '0xA', priceUsdc: '30', accepted: true }, off), [
    { kind: 'ask-person', seller: '0xA', priceUsdc: '30.00', gapUsdc: '0.00' },
  ]);
});

test('a withdrawn offer or a seller who never answers ends that negotiation alone', () => {
  const { book } = threeOffers();
  assert.deepEqual(stepBook(book, { kind: 'withdrawn', seller: '0xA' }, ctx()), [{ kind: 'end', seller: '0xA', reason: 'withdrawn' }]);
  assert.deepEqual(stepBook(book, { kind: 'timeout', seller: '0xB' }, ctx()), [{ kind: 'end', seller: '0xB', reason: 'no-reply' }]);
  assert.equal(book.get('0xc')!.state, 'open');
});

const notes = (book: Book): NotesFields => ({
  bids: new Map(),
  collectionScheduleVersion: 1,
  collectionFired: true,
  counterRoundsBySeller: new Map(),
  lastCounterPriceBySeller: new Map(),
  candidateQueue: [],
  triedSellers: new Set(),
  lastSellerCounterBySeller: new Map(),
  finalized: false,
  counterScheduleVersion: 1,
  escrowFunded: false,
  negotiations: book,
});

test('a restart resends each unsent counter exactly once', () => {
  const { book } = threeOffers(ctx({ liveScores: new Map([['0xA', { score: 90, priceUsdc: 120 }], ['0xB', { score: 50, priceUsdc: 200 }]]) }));
  const restarted = fromNotes(JSON.parse(JSON.stringify(toNotes(notes(book))))).negotiations!;
  const first = counters(resumeBook(restarted));
  assert.deepEqual(first.map((a) => a.counter.key), ['counter:0xjob:0xa:1', 'counter:0xjob:0xb:1', 'counter:0xjob:0xc:1']);
  assert.deepEqual(first.map((a) => a.betterOffer), [false, true, false], 'the resent counter says what the first one said');
  assert.deepEqual(resumeBook(restarted), []);
  counterSent(restarted, '0xA', 'counter:0xjob:0xa:1');
  const again = fromNotes(JSON.parse(JSON.stringify(toNotes(notes(restarted))))).negotiations!;
  assert.deepEqual(counters(resumeBook(again)).map((a) => a.seller), ['0xB', '0xC'], 'a sent counter is not sent again');
});

test('two agents of one person: only the listed row is countered', () => {
  const cand = (seller: string, askedUsdc: number): ShortlistCandidate => ({
    seller,
    sellerUser: '0xsame',
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
    askedUsdc,
    recordChecked: false,
    locationFit: 1,
    country: null,
    rating: { kind: 'new', count: 0 },
    topicalMatch: 80,
  });
  const rows = onePerPerson(rankCandidates([cand('0xDEAR', 200), cand('0xCHEAP', 50)], 222, { bargain: true }));
  const book: Book = new Map();
  const actions = rows.flatMap((r) => stepBook(book, { kind: 'offer', seller: r.seller, priceUsdc: String(r.askedUsdc), counterable: true }, ctx()));
  assert.deepEqual(actions.map((a) => a.seller), ['0xCHEAP']);
  assert.equal(book.has('0xdear'), false);
});

test('your call: agree takes the asked price, keep bargaining counters once more', () => {
  const off = ctx({ timeUsed: 1, agreeForMe: false });
  const asked = () => {
    const book: Book = new Map();
    stepBook(book, { kind: 'offer', seller: '0xA', priceUsdc: '120', counterable: true, postedUsdc: '30' }, off);
    stepBook(book, { kind: 'reply', seller: '0xA', priceUsdc: '35', accepted: false }, off);
    return book;
  };
  const agreed = asked();
  assert.deepEqual(yourCalls(agreed).get('0xa'), { priceUsdc: 35, offeredUsdc: 30 });
  assert.deepEqual(stepBook(agreed, { kind: 'agree', seller: '0xA' }, off), [{ kind: 'agree', seller: '0xA', priceUsdc: '35.00' }]);
  assert.equal(yourCalls(agreed).size, 0);
  assert.deepEqual(stepBook(agreed, { kind: 'agree', seller: '0xA' }, off), [], 'answered once');

  const kept = asked();
  const [counter] = stepBook(kept, { kind: 'keep', seller: '0xA' }, off);
  assert.equal(counter?.kind, 'counter');
  if (counter?.kind === 'counter') assert.equal(counter.counter.priceUsdc, '30.00', 'the agent holds at its own counter');
  assert.equal(kept.get('0xa')!.state, 'open');
  assert.deepEqual(stepBook(new Map(), { kind: 'keep', seller: '0xZ' }, off), [], 'no such negotiation');
});
