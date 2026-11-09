import assert from 'node:assert/strict';
import test from 'node:test';
import { AddressMap, AddressSet } from '../identity/address.js';
import { type NotesBid, type NotesFields, fromNotes, resumeAt, toNotes, withTerminalFacts } from './requestNotes.js';

const A = '0x00000000000000000000000000000000000000aA';
const B = '0x00000000000000000000000000000000000000bB';

function fields(): NotesFields {
  const bidA = { seller: A, priceUsdc: '120', priceWei: 120_000_000n, deadlineUnix: 2_000, score: 81, sellerDisplayName: 'Ada' } as NotesBid;
  const bidB = { seller: B, priceUsdc: '140', priceWei: 140_000_000n, deadlineUnix: 2_100 } as NotesBid;
  const bids = new AddressMap<string, NotesBid>();
  bids.set(A, bidA);
  bids.set(B, bidB);
  const rounds = new AddressMap<string, number>();
  rounds.set(A, 2);
  const lastPrice = new AddressMap<string, string>();
  lastPrice.set(A, '100');
  const sellerCounter = new AddressMap<string, string>();
  sellerCounter.set(A, '110');
  return {
    bids,
    directOffers: new Set([B.toLowerCase()]),
    withdrawnSellers: new Set(),
    pendingRevisions: new Map([[B.toLowerCase(), { priceUsdc: '130', deadlineUnix: 2_100 }]]),
    collectionStartedAt: 1_000,
    collectionCloseAt: 1_045,
    collectionScheduleVersion: 1_700_000_000_000_001,
    collectionFired: true,
    counterRoundsBySeller: rounds,
    lastCounterPriceBySeller: lastPrice,
    candidateQueue: [bidB],
    triedSellers: new AddressSet([B]),
    shortlist: [{ seller: A, recommended: true }],
    sellersAtLastPass: new AddressSet([A, B]),
    lastSellerCounterBySeller: sellerCounter,
    finalized: false,
    counterWatchdogSeller: A,
    counterWatchdogDueAt: 1_300,
    counterWatchdogRound: 2,
    counterScheduleVersion: 1_700_000_000_000_002,
    parkedAgreement: null,
    escrowFunded: false,
    pendingCounter: { seller: A, priceUsdc: '105', deadlineUnix: 3_000, deadlineDays: 5, round: 2, key: 'counter:0xjob:a:2' },
    pendingProposal: { seller: B, priceUsdc: '140', humanChosen: true },
  };
}

test('every kept field survives a round trip through the stored JSON', () => {
  const stored = JSON.parse(JSON.stringify(toNotes(fields())));
  const back = fromNotes(stored);
  assert.equal(back.bids.get(A.toLowerCase())?.priceWei, 120_000_000n);
  assert.equal((back.bids.get(A) as NotesBid & { sellerDisplayName?: string }).sellerDisplayName, 'Ada');
  assert.equal(back.counterRoundsBySeller.get(A.toUpperCase().replace('0X', '0x')), 2);
  assert.equal(back.lastCounterPriceBySeller.get(A), '100');
  assert.equal(back.lastSellerCounterBySeller.get(A), '110');
  assert.equal(back.triedSellers.has(B.toLowerCase()), true);
  assert.deepEqual([...back.pendingRevisions!.entries()], [[B.toLowerCase(), { priceUsdc: '130', deadlineUnix: 2_100 }]]);
  assert.equal(back.collectionScheduleVersion, 1_700_000_000_000_001);
  assert.equal(back.counterWatchdogSeller, A);
  assert.equal(back.counterWatchdogDueAt, 1_300);
  assert.equal(back.counterScheduleVersion, 1_700_000_000_000_002);
  assert.equal(back.parkedAgreement, null);
  assert.deepEqual(back.shortlist, [{ seller: A, recommended: true }]);
  assert.equal(back.pendingCounter?.key, 'counter:0xjob:a:2');
  assert.equal(back.pendingProposal?.humanChosen, true);
  assert.deepEqual(toNotes(back), toNotes(fields()));
});

test('the queue points at the same offers as the offers map', () => {
  const back = fromNotes(JSON.parse(JSON.stringify(toNotes(fields()))));
  assert.equal(back.candidateQueue.length, 1);
  assert.equal(back.candidateQueue[0], back.bids.get(B));
});

test('a queued seller with no offer left is dropped from the queue', () => {
  const notes = toNotes(fields());
  const stored = { ...notes, bids: notes.bids.filter((b) => b.seller !== B) };
  assert.deepEqual(fromNotes(stored).candidateQueue, []);
});

test('stored notes with an unknown field or a broken price are refused', () => {
  const notes = toNotes(fields());
  assert.throws(() => fromNotes({ ...notes, extra: true }), /Unrecognized key/);
  assert.throws(() => fromNotes({ ...notes, bids: [{ ...notes.bids[0], priceWei: '1.5' }] }));
});

test('the stored request and the deal win over the notes', () => {
  const ended = withTerminalFacts(fields(), { ended: true, negotiationEndedAt: 9, negotiationEndReason: 'no-fit', escrowFunded: false });
  assert.equal(ended.finalized, true);
  assert.equal(ended.negotiationEndReason, 'no-fit');
  const funded = withTerminalFacts(fields(), { ended: false, escrowFunded: true });
  assert.equal(funded.finalized, true);
  assert.equal(funded.escrowFunded, true);
  const open = withTerminalFacts(fields(), { ended: false, escrowFunded: false });
  assert.equal(open.finalized, false);
});

test('notes round-trip negotiations', () => {
  const negotiation = {
    seller: A,
    openedUsdc: 258,
    standingUsdc: '240.00',
    mine: '200.00',
    myOpeningUsdc: 188.7,
    exchanges: 2,
    rounds: 3,
    midpointUsed: false,
    traded: true,
    counterable: true,
    state: 'open' as const,
    pending: { seller: A, priceUsdc: '200.00', deadlineUnix: 3_000, deadlineDays: 7, round: 3, key: 'counter:0xjob:a:3' },
    pendingBetterOffer: true,
    watchdogDueAt: 1_180_000,
    resumed: true,
  };
  const withBook = { ...fields(), negotiations: new Map([[A.toLowerCase(), negotiation]]) };
  const back = fromNotes(JSON.parse(JSON.stringify(toNotes(withBook))));
  const { resumed: _resumed, ...stored } = negotiation;
  assert.deepEqual(back.negotiations?.get(A), stored, 'kept except the in-process resend mark');
  assert.equal(fromNotes(toNotes(fields())).negotiations, undefined, 'absent stays absent');
  assert.throws(() => fromNotes({ ...toNotes(withBook), negotiations: { a: { ...stored, state: 'won' } } }));
});

test('an open window or wait is armed again at its own time, or now if it has passed', () => {
  assert.equal(resumeAt(5_000, 4_000), 5_000);
  assert.equal(resumeAt(3_000, 4_000), 4_000);
  assert.equal(resumeAt(undefined, 4_000), null);
});
