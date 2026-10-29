import assert from 'node:assert/strict';
import test from 'node:test';
import type { Address, Hex } from 'viem';
import { memoryContestsStore } from '../db/contests.js';
import { createContests, type ContestPorts } from './contests.js';

/// Contests on the job escrow (view 40): the prize held from the start, entries
/// from sellers, the buyer picks the winners, an unpicked prize goes back.

const BUYER: Address = '0x1111111111111111111111111111111111111111';
const BUYER_AGENT: Address = '0x2222222222222222222222222222222222222222';
const S1: Address = '0x3333333333333333333333333333333333333333';
const S2: Address = '0x4444444444444444444444444444444444444444';
const S3: Address = '0x5555555555555555555555555555555555555555';
const agentOf = (s: Address) => (`0xa${s.slice(3)}`) as Address;
const DAY = 86_400_000;
const T0 = 1_800_000_000_000;
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1]);

function setup(over: Partial<ContestPorts> = {}) {
  let now = T0;
  let n = 0;
  const sent: string[] = [];
  const told: string[] = [];
  const store = memoryContestsStore();
  const ports: ContestPorts = {
    store,
    saveEntryFiles: () => {},
    savePreview: () => {},
    openingConfig: async () => ({ open: true, feeBps: 100, perDealCap: 1_005_000_000n }),
    buyerAgentFor: async (b) => (b === BUYER ? { walletId: 'w-buyer', address: BUYER_AGENT } : null),
    sellerAgentFor: async (s) => ({ walletId: `w-${s}`, address: agentOf(s) }),
    identityOf: async (a) => ({ [BUYER_AGENT]: 7n, [BUYER]: 7n } as Record<string, bigint>)[a] ?? 0n,
    balanceOf: async () => 1_000_000_000n,
    guard: async () => ({ ok: true }),
    chain: {
      open: async () => { sent.push('open'); return { jobId: 4n, txHash: '0x01' as Hex }; },
      enter: async (_w, _id, fp) => { sent.push(`enter:${fp}`); return '0x02' as Hex; },
      award: async (_w, _id, winners) => { sent.push(`award:${winners.length}`); return '0x03' as Hex; },
      cancel: async () => { sent.push('cancel'); return { txHash: '0x04' as Hex, back: 301_500_000n }; },
      giveBack: async () => { sent.push('return'); return { txHash: '0x05' as Hex, back: 301_500_000n }; },
    },
    tell: (kind) => { told.push(kind); },
    now: () => now,
    newId: (p) => `${p}_${++n}`,
    ...over,
  };
  return { core: createContests(ports), store, sent, told, advance: (ms: number) => (now += ms) };
}

const input = { title: 'Best logo', brief: 'A logo for a bakery in Kano', prizeUsdc: '300', places: 3, entriesDays: 7 };
const file = () => ({ files: [{ bytes: PNG, contentType: 'image/png' as const }], note: 'three colours' });

test('a draft says what the buyer puts up, what each place gets, and what happens if nobody is picked', () => {
  const { core } = setup();
  const d = core.draft(input, 100);
  assert.ok(d.ok);
  if (!d.ok) return;
  assert.equal(d.card.totalMicros, '301500000');
  assert.equal(d.card.feeHalfMicros, '1500000');
  assert.deepEqual(d.card.shares, [5000, 3000, 2000]);
  assert.deepEqual(d.card.placeNetMicros, ['149250000', '89550000', '59700000']);
  assert.equal(d.card.awardBy - d.card.entriesBy, 7 * DAY);
  assert.match(d.card.ifNobody, /comes back/);
});

test('a draft refuses what the contract or the app would not take', () => {
  const { core } = setup();
  for (const bad of [
    { ...input, places: 0 }, { ...input, places: 4 }, { ...input, prizeUsdc: '0' }, { ...input, entriesDays: 0 },
    { ...input, entriesDays: 31 }, { ...input, awardDays: 61 }, { ...input, shares: [6000, 3000] }, { ...input, shares: [10000, 0, 0] },
  ]) {
    assert.equal(core.draft(bad, 100).ok, false, JSON.stringify(bad));
  }
});

test('posting refuses over the cap and when the buying agent is short, before anything is sent', async () => {
  const capped = setup();
  const over = await capped.core.post(BUYER, { ...input, prizeUsdc: '1001' });
  assert.equal(over.ok, false);
  assert.deepEqual(capped.sent, []);
  const short = setup({ balanceOf: async () => 300_000_000n });
  const r = await short.core.post(BUYER, input);
  assert.equal(r.ok ? 'ok' : r.code, 'BUYER_AGENT_SHORT');
  assert.equal(r.ok ? null : r.needMicros, '1500000');
  assert.deepEqual(short.sent, []);
});

test('two taps on post open one contest', async () => {
  const { core, sent, store } = setup();
  const [a, b] = await Promise.all([core.post(BUYER, input), core.post(BUYER, input)]);
  assert.equal([a, b].filter((r) => r.ok).length, 1);
  assert.equal(sent.filter((s) => s === 'open').length, 1);
  assert.equal((await store.list({ status: ['open'] })).length, 1);
});

async function opened() {
  const s = setup();
  const r = await s.core.post(BUYER, input);
  assert.ok(r.ok);
  return { ...s, id: r.ok ? r.contest.id : '' };
}

test('the buyer, their own agent, or another wallet of theirs cannot enter', async () => {
  const s = setup({ identityOf: async (a) => (a === BUYER_AGENT || a === agentOf(S1) ? 7n : 0n) });
  const r = await s.core.post(BUYER, input);
  assert.ok(r.ok);
  const id = r.ok ? r.contest.id : '';
  assert.equal((await s.core.enter(BUYER, id, file())).ok, false);
  const sameId = await s.core.enter(S1, id, file());
  assert.equal(sameId.ok ? 'ok' : sameId.code, 'OWN_CONTEST');
  assert.ok(!s.sent.some((x) => x.startsWith('enter')), 'refused before anything is sent');
});

test('a seller enters once and replaces their entry; entries close on the date', async () => {
  const { core, store, id, advance } = await opened();
  const first = await core.enter(S1, id, file());
  const second = await core.enter(S1, id, { ...file(), note: 'two colours' });
  assert.ok(first.ok && second.ok);
  const all = await store.entries(id);
  assert.deepEqual(all.map((e) => e.status).sort(), ['in', 'replaced']);
  advance(8 * DAY);
  assert.equal((await core.enter(S2, id, file())).ok, false);
});

test('picking before entries close needs every place; after, fewer places return the rest', async () => {
  const { core, id, advance, store } = await opened();
  const e1 = await core.enter(S1, id, file());
  const e2 = await core.enter(S2, id, file());
  assert.ok(e1.ok && e2.ok);
  const ids = [e1.ok ? e1.entry.id : '', e2.ok ? e2.entry.id : ''];
  assert.equal((await core.award(BUYER, id, ids)).ok, false, 'three places, two picked, entries still open');
  advance(8 * DAY);
  const r = await core.award(BUYER, id, ids);
  assert.ok(r.ok);
  const c = await store.get(id);
  assert.equal(c?.status, 'awarded');
  assert.deepEqual(c?.winners?.map((w) => w.netMicros), ['149250000', '89550000']);
  assert.equal(c?.backMicros, String(301_500_000 - 149_250_000 - 89_550_000 - 2_400_000));
  assert.deepEqual((await store.entries(id)).map((e) => e.status).sort(), ['won', 'won']);
});

test('only the buyer picks, only entrants can be picked, and two taps award once', async () => {
  const { core, id, sent, advance } = await opened();
  const e1 = await core.enter(S1, id, file());
  const e3 = await core.enter(S3, id, file());
  advance(8 * DAY);
  const ids = [e1.ok ? e1.entry.id : '', e3.ok ? e3.entry.id : ''];
  assert.equal((await core.award(S1, id, ids)).ok, false);
  assert.equal((await core.award(BUYER, id, ['e_nobody'])).ok, false);
  const both = await Promise.all([core.award(BUYER, id, ids), core.award(BUYER, id, ids)]);
  assert.equal(both.filter((r) => r.ok).length, 1);
  assert.equal(sent.filter((s) => s.startsWith('award')).length, 1);
});

test('the full files reach the buyer only after that entry won', async () => {
  const { core, id, advance } = await opened();
  const e1 = await core.enter(S1, id, file());
  const eid = e1.ok ? e1.entry.id : '';
  assert.equal(await core.mayReadFiles(BUYER, eid), false);
  assert.equal(await core.mayReadFiles(S1, eid), true, 'the entrant always can');
  advance(8 * DAY);
  await core.award(BUYER, id, [eid]);
  assert.equal(await core.mayReadFiles(BUYER, eid), true);
  assert.equal(await core.mayReadFiles(S2, eid), false);
});

test('taking a contest back works only while nobody has entered', async () => {
  const a = await opened();
  assert.ok((await a.core.cancel(BUYER, a.id)).ok);
  assert.equal((await a.store.get(a.id))?.status, 'cancelled');
  const b = await opened();
  await b.core.enter(S1, b.id, file());
  assert.equal((await b.core.cancel(BUYER, b.id)).ok, false);
});

test('a prize nobody picked goes back after the award date, and only then', async () => {
  const { core, id, advance, store, told } = await opened();
  await core.enter(S1, id, file());
  assert.equal(await core.returnDue(), 0);
  advance(15 * DAY);
  assert.equal(await core.returnDue(), 1);
  assert.equal((await store.get(id))?.status, 'returned');
  assert.ok(told.includes('contest.returned'));
});

test('a failed return leaves the contest open for the next pass', async () => {
  const s = setup();
  const r = await s.core.post(BUYER, input);
  const id = r.ok ? r.contest.id : '';
  const failing = setup({ store: s.store, chain: { ...({} as ContestPorts['chain']), giveBack: async () => { throw new Error('rpc down'); } } });
  failing.advance(15 * DAY);
  assert.equal(await failing.core.returnDue(), 0);
  assert.equal((await s.store.get(id))?.status, 'open');
});
