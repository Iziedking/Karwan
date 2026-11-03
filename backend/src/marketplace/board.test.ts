import assert from 'node:assert/strict';
import test from 'node:test';
import type { Address, Hex, Log } from 'viem';
import { jobBoardV2Abi } from '../chain/abis/jobBoardV2.js';
import { boardJobId, boardLog, createKarwanBoard, BoardError, type BoardRequest, type ChainBoardReads } from './board.js';
import { memoryBoardStore } from '../db/marketBoard.js';

/// Requests, offers and counters kept in Karwan (view 40, part A): the old
/// request board's rules, its request numbers and its event shapes, with no
/// transaction.

const BUYER: Address = '0x1111111111111111111111111111111111111111';
const SELLER: Address = '0x2222222222222222222222222222222222222222';
const OTHER: Address = '0x3333333333333333333333333333333333333333';
const SALT: Hex = '0x00000000000000000000000000000000000000000000000000000000000000aa';
const NOW = 1_800_000_000;
const DAY = 86_400n;

const noChain: ChainBoardReads = { request: async () => null, offer: async () => null, counter: async () => null };

function setup(chain: ChainBoardReads = noChain, pollMs = 1_000_000) {
  const store = memoryBoardStore();
  let now = NOW;
  const board = createKarwanBoard({ store, chain, now: () => now, pollMs });
  return { board, store, advance: (s: number) => (now += s) };
}

async function post(board: ReturnType<typeof setup>['board'], deadline = BigInt(NOW) + DAY) {
  return board.postRequest({ walletId: 'w-buyer', poster: BUYER, salt: SALT, budget: 100_000_000n, deadline, termsHash: '0xterms' });
}

async function refused(p: Promise<unknown>, code: string) {
  await assert.rejects(p, (e: unknown) => e instanceof BoardError && e.code === code);
}

test('the request number is the old board derivation of poster and salt', async () => {
  // cast keccak $(cast abi-encode 'f(address,bytes32)' 0x1111…1111 0x…aa)
  assert.equal(boardJobId(BUYER, SALT), '0x997c86c1802ffe437273b1480d8a98ed237a0a4d3172ce0434914f9f82207af4');
  const { board } = setup();
  const { jobId } = await post(board);
  assert.equal(jobId, boardJobId(BUYER, SALT));
});

test('posting follows the old board rules', async () => {
  const { board } = setup();
  await refused(board.postRequest({ walletId: 'w', poster: BUYER, salt: SALT, budget: 0n, deadline: BigInt(NOW) + DAY, termsHash: 'x' }), 'InvalidJob');
  await refused(board.postRequest({ walletId: 'w', poster: BUYER, salt: SALT, budget: 1n, deadline: BigInt(NOW), termsHash: 'x' }), 'InvalidJob');
  await post(board);
  await refused(post(board), 'JobAlreadyExists');
  const r = (await board.read(boardJobId(BUYER, SALT))) as BoardRequest;
  assert.equal(r.state, 1);
  assert.equal(r.buyer, BUYER);
  assert.equal(r.budget, 100_000_000n);
});

test('offers, counters and replies follow the old board rules', async () => {
  const { board } = setup();
  const { jobId } = await post(board);
  const later = BigInt(NOW) + DAY;
  await refused(board.placeOffer({ walletId: 's', seller: SELLER, jobId: boardJobId(OTHER, SALT), price: 1n, deadline: later }), 'JobNotOpen');
  await refused(board.placeOffer({ walletId: 's', seller: SELLER, jobId, price: 0n, deadline: later }), 'InvalidBid');
  await refused(board.counter({ walletId: 'b', buyer: BUYER, jobId, seller: SELLER, price: 1n, deadline: later }), 'NoSuchBid');
  await board.placeOffer({ walletId: 's', seller: SELLER, jobId, price: 90_000_000n, deadline: later });
  await refused(board.counter({ walletId: 'x', buyer: OTHER, jobId, seller: SELLER, price: 1n, deadline: later }), 'NotJobBuyer');
  await refused(board.counter({ walletId: 'b', buyer: BUYER, jobId, seller: SELLER, price: 1n, deadline: BigInt(NOW) }), 'InvalidCounter');
  await refused(board.respond({ walletId: 's', seller: SELLER, jobId, accept: true, price: 0n, deadline: 0n }), 'NoSuchBid');
  await board.counter({ walletId: 'b', buyer: BUYER, jobId, seller: SELLER, price: 80_000_000n, deadline: later });
  await refused(board.respond({ walletId: 's', seller: SELLER, jobId, accept: false, price: 0n, deadline: later }), 'InvalidCounter');
  await board.respond({ walletId: 's', seller: SELLER, jobId, accept: true, price: 0n, deadline: 0n });
  await board.accept({ walletId: 'b', buyer: BUYER, jobId, seller: SELLER });
  const r = (await board.read(jobId)) as BoardRequest;
  assert.equal(r.state, 2);
  assert.equal(r.acceptedSeller, SELLER);
  assert.equal(r.acceptedPrice, 80_000_000n, 'an accepted counter becomes the offer');
  await refused(board.placeOffer({ walletId: 's', seller: OTHER, jobId, price: 1n, deadline: later }), 'JobNotOpen');
});

test('events carry checksummed addresses whatever casing the caller used, as the old board did', async () => {
  // Cotton Co's agent bid once in lowercase and once checksummed; the buyer read two sellers.
  const agent: Address = '0x60d921870BEC83E8Ce4A824C8E7d05c74A1f88a8';
  const { board, store } = setup();
  const { jobId } = await post(board);
  const later = BigInt(NOW) + DAY;
  await board.placeOffer({ walletId: 's', seller: agent.toLowerCase() as Address, jobId, price: 90_000_000n, deadline: later });
  await board.placeOffer({ walletId: 's', seller: agent, jobId, price: 85_000_000n, deadline: later });
  await board.counter({ walletId: 'b', buyer: BUYER.toLowerCase() as Address, jobId, seller: agent.toLowerCase() as Address, price: 80_000_000n, deadline: later });
  const logs = (await store.eventsAfter(0, 50)).map(boardLog) as unknown as { eventName: string; args: { seller?: string; buyer?: string } }[];
  const sellers = logs.filter((l) => l.args.seller).map((l) => l.args.seller);
  assert.deepEqual(sellers, [agent, agent, agent]);
  assert.ok(logs.filter((l) => l.args.buyer).every((l) => l.args.buyer === BUYER));
});

test('a stored lowercase event is read back checksummed', () => {
  const log = boardLog({ id: 7, jobId: '0x01', kind: 'BidSubmitted', args: { jobId: '0x01', seller: '0x60d921870bec83e8ce4a824c8e7d05c74a1f88a8', price: '1', deadline: '2' } } as never) as unknown as { args: { seller: string; price: bigint } };
  assert.equal(log.args.seller, '0x60d921870BEC83E8Ce4A824C8E7d05c74A1f88a8');
  assert.equal(log.args.price, 1n);
});

test('a second offer from the same seller replaces the first', async () => {
  const { board } = setup();
  const { jobId } = await post(board);
  const later = BigInt(NOW) + DAY;
  await board.placeOffer({ walletId: 's', seller: SELLER, jobId, price: 90_000_000n, deadline: later });
  await board.placeOffer({ walletId: 's', seller: SELLER, jobId, price: 85_000_000n, deadline: later });
  await board.accept({ walletId: 'b', buyer: BUYER, jobId, seller: SELLER });
  assert.equal(((await board.read(jobId)) as BoardRequest).acceptedPrice, 85_000_000n);
});

test('accepting refuses after the request deadline and on an expired offer', async () => {
  const { board, advance } = setup();
  const { jobId } = await post(board, BigInt(NOW) + 2n * DAY);
  await board.placeOffer({ walletId: 's', seller: SELLER, jobId, price: 1n, deadline: BigInt(NOW) + 100n });
  await refused(board.accept({ walletId: 'b', buyer: BUYER, jobId, seller: OTHER }), 'NoSuchBid');
  advance(200);
  await refused(board.accept({ walletId: 'b', buyer: BUYER, jobId, seller: SELLER }), 'BidExpired');
  advance(Number(2n * DAY));
  await refused(board.accept({ walletId: 'b', buyer: BUYER, jobId, seller: SELLER }), 'MatchWindowClosed');
});

test('watchers get the old board event shapes, each event once', async () => {
  const { board } = setup();
  const seen: Log[] = [];
  const stop = board.watch('BidSubmitted', (logs) => seen.push(...logs), () => {});
  const posted: Log[] = [];
  const stopPosted = board.watch('JobPosted', (logs) => posted.push(...logs), () => {});
  await board.ready();
  const { jobId } = await post(board);
  await board.placeOffer({ walletId: 's', seller: SELLER, jobId, price: 7n, deadline: BigInt(NOW) + DAY });
  await board.pollOnce();
  stop();
  stopPosted();
  assert.equal(seen.length, 1);
  assert.equal(posted.length, 1);
  const event = jobBoardV2Abi.find((x) => x.type === 'event' && x.name === 'BidSubmitted') as { inputs: { name: string }[] };
  const args = (seen[0] as unknown as { args: Record<string, unknown> }).args;
  assert.deepEqual(Object.keys(args).sort(), event.inputs.map((i) => i.name).sort());
  assert.equal(args.price, 7n);
  assert.equal(typeof args.deadline, 'bigint');
  assert.match(seen[0].transactionHash as string, /^0x[0-9a-f]{64}$/);
  assert.notEqual(seen[0].transactionHash, posted[0].transactionHash);
  assert.equal(seen[0].logIndex, 0);
});

test('a watcher that missed the in-process delivery catches up from the store', async () => {
  const { board, store } = setup();
  const seen: Log[] = [];
  board.watch('JobPosted', (logs) => seen.push(...logs), () => {});
  await board.ready();
  // Another process wrote this one: only the store knows.
  await store.update(boardJobId(OTHER, SALT), () => ({
    row: { jobId: boardJobId(OTHER, SALT), buyer: OTHER, budget: '1', deadline: String(NOW + 100), termsHash: 't', state: 1, acceptedSeller: null, acceptedPrice: '0', acceptedDeadline: '0', offers: {}, counters: {} },
    event: { kind: 'JobPosted', args: { jobId: boardJobId(OTHER, SALT), buyer: OTHER, budget: 1n, deadline: BigInt(NOW + 100), termsHash: 't' } },
  }));
  await board.pollOnce();
  await board.pollOnce();
  assert.equal(seen.length, 1);
});

test('a request from the old board is read from the chain and copied in on its first new step', async () => {
  const jobId = boardJobId(OTHER, SALT);
  const chain: ChainBoardReads = {
    request: async (id) => (id === jobId ? { buyer: OTHER, budget: 5n, deadline: BigInt(NOW) + DAY, termsHash: 'old', state: 1, acceptedSeller: '0x0000000000000000000000000000000000000000', acceptedPrice: 0n, acceptedDeadline: 0n } : null),
    offer: async (id, seller) => (id === jobId && seller === SELLER ? { price: 4n, deadline: BigInt(NOW) + DAY } : null),
    counter: async () => null,
  };
  const { board } = setup(chain);
  assert.equal(((await board.read(jobId)) as BoardRequest).termsHash, 'old');
  await board.accept({ walletId: 'b', buyer: OTHER, jobId, seller: SELLER });
  const r = (await board.read(jobId)) as BoardRequest;
  assert.equal(r.state, 2);
  assert.equal(r.acceptedPrice, 4n, 'the offer placed on the old board is honoured');
});

test('a counter sent with a key is made once; sending it again returns the first one', async () => {
  const { board, store } = setup();
  const { jobId } = await post(board);
  const later = BigInt(NOW) + DAY;
  await board.placeOffer({ walletId: 's', seller: SELLER, jobId, price: 90_000_000n, deadline: later });
  const counter = { walletId: 'b', buyer: BUYER, jobId, seller: SELLER, price: 80_000_000n, deadline: later, key: 'counter:job:seller:1' };
  const first = await board.counter(counter);
  assert.equal(first.replayed, false);
  // The seller answers with their own price, which replaces the standing counter.
  await board.respond({ walletId: 's', seller: SELLER, jobId, accept: false, price: 85_000_000n, deadline: later });
  const again = await board.counter(counter);
  assert.equal(again.replayed, true);
  assert.equal(again.ref, first.ref);
  const counters = (await store.eventsAfter(0, 100)).filter((e) => e.kind === 'CounterOfferIssued');
  assert.equal(counters.length, 1);
  assert.equal((await store.get(jobId))?.counters[SELLER.toLowerCase()]?.price, '85000000', 'the replay changed nothing');
});

test('a counter with a new key, the next round, is made', async () => {
  const { board, store } = setup();
  const { jobId } = await post(board);
  const later = BigInt(NOW) + DAY;
  await board.placeOffer({ walletId: 's', seller: SELLER, jobId, price: 90_000_000n, deadline: later });
  await board.counter({ walletId: 'b', buyer: BUYER, jobId, seller: SELLER, price: 80_000_000n, deadline: later, key: 'counter:job:seller:1' });
  const next = await board.counter({ walletId: 'b', buyer: BUYER, jobId, seller: SELLER, price: 82_000_000n, deadline: later, key: 'counter:job:seller:2' });
  assert.equal(next.replayed, false);
  assert.equal((await store.eventsAfter(0, 100)).filter((e) => e.kind === 'CounterOfferIssued').length, 2);
});

test('a reader with a saved position gets the steps written while it was stopped', async () => {
  const { board, store } = setup();
  const { jobId } = await post(board);
  const later = BigInt(NOW) + DAY;
  const seen: string[] = [];
  const stop = board.watch('BidSubmitted', (logs) => seen.push(...logs.map((l) => String((l as unknown as { args: { seller: string } }).args.seller))), () => undefined, { cursorKey: 'buyer:BidSubmitted' });
  await board.ready();
  await board.placeOffer({ walletId: 's', seller: SELLER, jobId, price: 90_000_000n, deadline: later });
  await board.pollOnce();
  assert.deepEqual(seen, [SELLER]);
  stop();

  // Karwan stops; an offer lands before the next poll; Karwan starts again.
  await board.placeOffer({ walletId: 'o', seller: OTHER, jobId, price: 95_000_000n, deadline: later });
  const restarted = createKarwanBoard({ store, chain: noChain, now: () => NOW, pollMs: 1_000_000 });
  const after: string[] = [];
  restarted.watch('BidSubmitted', (logs) => after.push(...logs.map((l) => String((l as unknown as { args: { seller: string } }).args.seller))), () => undefined, { cursorKey: 'buyer:BidSubmitted' });
  await restarted.ready();
  await restarted.pollOnce();
  assert.deepEqual(after, [OTHER], 'the offer written while stopped is delivered, the earlier one is not repeated');
});

test('a reader without a saved position starts at the newest step, as before', async () => {
  const { board, store } = setup();
  const { jobId } = await post(board);
  await board.placeOffer({ walletId: 's', seller: SELLER, jobId, price: 90_000_000n, deadline: BigInt(NOW) + DAY });
  const fresh = createKarwanBoard({ store, chain: noChain, now: () => NOW, pollMs: 1_000_000 });
  const seen: unknown[] = [];
  fresh.watch('BidSubmitted', (logs) => seen.push(...logs), () => undefined, { cursorKey: 'seller:new-reader' });
  await fresh.ready();
  await fresh.pollOnce();
  assert.deepEqual(seen, []);
});
