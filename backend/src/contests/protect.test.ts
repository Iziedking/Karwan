import assert from 'node:assert/strict';
import test from 'node:test';
import { keccak256, toBytes, type Address, type Hex } from 'viem';
import { memoryContestsStore, type Contest } from '../db/contests.js';
import { createContests, type ContestChain, type ContestPorts } from './contests.js';

/// Contests on the second job escrow (view 88): once someone has entered, the
/// prize goes to entrants. The buyer picks during judging or the 3-day wait
/// after it, can mark an entry not valid with a reason, and after the wait the
/// earliest valid entries are paid. Contests opened on the first escrow keep
/// the old rule.

const BUYER: Address = '0x1111111111111111111111111111111111111111';
const BUYER_AGENT: Address = '0x2222222222222222222222222222222222222222';
const S1: Address = '0x3333333333333333333333333333333333333333';
const S2: Address = '0x4444444444444444444444444444444444444444';
const S3: Address = '0x5555555555555555555555555555555555555555';
const agentOf = (s: Address) => (`0xa${s.slice(3)}`) as Address;
const DAY = 86_400_000;
const T0 = 1_800_000_000_000;
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1]);

type PaidOut = Awaited<ReturnType<ContestChain['payOut']>>;

function setup(o: { payOut?: (jobId: bigint) => PaidOut } = {}) {
  let now = T0;
  let n = 0;
  const sent: string[] = [];
  const old: string[] = [];
  const told: { kind: string; payload: Record<string, unknown> }[] = [];
  const store = memoryContestsStore();
  const chain = (log: string[]): ContestChain => ({
    open: async () => { log.push('open'); return { jobId: 9n, txHash: '0x01' as Hex }; },
    enter: async (_w, _id, fp) => { log.push(`enter:${fp}`); return '0x02' as Hex; },
    award: async (_w, _id, winners) => { log.push(`award:${winners.join(',')}`); return '0x03' as Hex; },
    cancel: async () => { log.push('cancel'); return { txHash: '0x04' as Hex, back: 301_500_000n }; },
    giveBack: async () => { log.push('return'); return { txHash: '0x05' as Hex, back: 301_500_000n }; },
    markNotValid: async (_w, _id, entrant, reason) => { log.push(`mark:${entrant}:${reason}`); return '0x06' as Hex; },
    payOut: async (jobId) => {
      log.push('payout');
      return o.payOut ? o.payOut(jobId) : { txHash: '0x07' as Hex, paid: [], back: 301_500_000n };
    },
  });
  const ports: ContestPorts = {
    store,
    saveEntryFiles: () => {},
    savePreview: () => {},
    openingConfig: async () => ({ open: true, feeBps: 100, perDealCap: 1_005_000_000n }),
    buyerAgentFor: async (b) => (b === BUYER ? { walletId: 'w-buyer', address: BUYER_AGENT } : null),
    sellerAgentFor: async (s) => ({ walletId: `w-${s}`, address: agentOf(s) }),
    identityOf: async () => 0n,
    balanceOf: async () => 1_000_000_000n,
    guard: async () => ({ ok: true }),
    protects: true,
    chain: chain(sent),
    legacyChain: chain(old),
    tell: (kind, payload) => { told.push({ kind, payload }); },
    now: () => now,
    newId: (p) => `${p}_${++n}`,
  };
  return { core: createContests(ports), store, sent, old, told, at: (ms: number) => (now = T0 + ms) };
}

const input = { title: 'Best logo', brief: 'A logo for a bakery in Kano', prizeUsdc: '300', places: 3, entriesDays: 7 };
const work = (note = 'three colours') => ({ files: [{ bytes: PNG, contentType: 'image/png' as const }], note });

async function contestWithEntries(s: ReturnType<typeof setup>, sellers: Address[] = [S1, S2, S3]) {
  const posted = await s.core.post(BUYER, input);
  assert.ok(posted.ok);
  if (!posted.ok) throw new Error('not posted');
  const ids: string[] = [];
  for (const [i, seller] of sellers.entries()) {
    s.at(i * 60_000 + 1);
    const e = await s.core.enter(seller, posted.contest.id, work(`entry ${i}`));
    assert.ok(e.ok);
    if (e.ok) ids.push(e.entry.id);
  }
  return { contest: posted.contest, entries: ids };
}

test('a draft shows the judging end, the payout date and what happens if nobody is picked', () => {
  const { core } = setup();
  const d = core.draft(input, 100);
  assert.ok(d.ok);
  if (!d.ok) return;
  assert.equal(d.card.kind, 'design');
  assert.equal(d.card.awardBy - d.card.entriesBy, 7 * DAY);
  assert.equal(d.card.payoutFrom, d.card.awardBy + 3 * DAY);
  assert.match(d.card.ifNobody, /earliest entries/);
  assert.doesNotMatch(d.card.ifNobody, /comes back to you/);
});

test('each kind of contest has its own entry and judging periods', () => {
  const { core } = setup();
  const bug = core.draft({ ...input, kind: 'bugs', entriesDays: 60, awardDays: 30 }, 100);
  assert.ok(bug.ok);
  const hack = core.draft({ ...input, kind: 'hackathon', entriesDays: 45 }, 100);
  assert.ok(hack.ok);
  if (hack.ok) assert.equal(hack.card.awardBy - hack.card.entriesBy, 14 * DAY, 'a hackathon is reviewed for 14 days unless they say');
  for (const bad of [
    { ...input, entriesDays: 31 },
    { ...input, awardDays: 2 },
    { ...input, awardDays: 15 },
    { ...input, kind: 'bugs' as const, entriesDays: 61 },
    { ...input, kind: 'hackathon' as const, awardDays: 31 },
  ]) {
    assert.equal(core.draft(bad, 100).ok, false, JSON.stringify(bad));
  }
});

test('a contest opens on the second escrow and remembers its kind', async () => {
  const s = setup();
  const posted = await s.core.post(BUYER, { ...input, kind: 'bugs', entriesDays: 20, awardDays: 10 });
  assert.ok(posted.ok);
  if (!posted.ok) return;
  assert.equal(posted.contest.protects, true);
  assert.equal(posted.contest.kind, 'bugs');
  assert.deepEqual(s.sent, ['open']);
  assert.deepEqual(s.old, []);
});

test('the buyer can still pick winners during the 3-day wait, and not after it', async () => {
  const s = setup();
  const { contest, entries } = await contestWithEntries(s);
  s.at(contest.awardBy - T0 + 2 * DAY);
  const late = await s.core.award(BUYER, contest.id, [entries[1]!]);
  assert.ok(late.ok, 'a late pick inside the wait is paid');
  assert.deepEqual(s.sent.at(-1), `award:${agentOf(S2)}`);

  const t = setup();
  const second = await contestWithEntries(t);
  t.at(second.contest.awardBy - T0 + 3 * DAY);
  const after = await t.core.award(BUYER, second.contest.id, [second.entries[0]!]);
  assert.equal(after.ok, false);
  if (!after.ok) assert.equal(after.code, 'AWARD_CLOSED');
});

test('the buyer marks an entry not valid with a reason the entrant can read', async () => {
  const s = setup();
  const { contest, entries } = await contestWithEntries(s);
  const reason = 'This is a copy of a logo already in use.';
  const marked = await s.core.markNotValid(BUYER, contest.id, entries[0]!, reason);
  assert.ok(marked.ok);
  assert.equal(s.sent.at(-1), `mark:${agentOf(S1)}:${keccak256(toBytes(reason))}`);
  const e = await s.store.entry(entries[0]!);
  assert.equal(e?.notValid?.reason, reason);
  assert.ok(s.told.some((t) => t.kind === 'contest.entry_marked' && t.payload.seller === S1));

  const again = await s.core.markNotValid(BUYER, contest.id, entries[0]!, reason);
  assert.equal(again.ok, false, 'an entry is marked once');
  const win = await s.core.award(BUYER, contest.id, [entries[0]!, entries[1]!, entries[2]!]);
  assert.equal(win.ok, false, 'a marked entry never wins');
});

test('marking needs the buyer, a reason, a live entry and the second escrow, before the payout opens', async () => {
  const s = setup();
  const { contest, entries } = await contestWithEntries(s);
  const no = async (who: Address, entryId: string, reason: string, code: string) => {
    const r = await s.core.markNotValid(who, contest.id, entryId, reason);
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.code, code);
  };
  await no(S2, entries[0]!, 'Not what was asked for.', 'NOT_BUYER');
  await no(BUYER, entries[0]!, 'no', 'BAD_REASON');
  await no(BUYER, entries[0]!, 'x'.repeat(281), 'BAD_REASON');
  await no(BUYER, 'e_missing', 'Not what was asked for.', 'NOT_FOUND');
  s.at(contest.awardBy - T0 + 3 * DAY);
  await no(BUYER, entries[0]!, 'Not what was asked for.', 'MARK_CLOSED');

  const older: Contest = { ...contest, id: 'c_old', protects: undefined };
  await s.store.create(older);
  const r = await s.core.markNotValid(BUYER, 'c_old', entries[0]!, 'Not what was asked for.');
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.code, 'OLD_RULE');
});

test('nobody picked: after the wait the earliest valid entries are paid and told', async () => {
  const s = setup({
    payOut: () => ({ txHash: '0x07' as Hex, paid: [{ agent: agentOf(S2), netMicros: 179_100_000n }, { agent: agentOf(S3), netMicros: 119_400_000n }], back: 0n }),
  });
  const { contest, entries } = await contestWithEntries(s);
  await s.core.markNotValid(BUYER, contest.id, entries[0]!, 'Copied from another site.');

  s.at(contest.awardBy - T0);
  assert.equal(await s.core.returnDue(), 0, 'not due at the end of judging');
  assert.ok(!s.sent.includes('payout'));

  s.at(contest.awardBy - T0 + 3 * DAY);
  assert.equal(await s.core.returnDue(), 1);
  const done = await s.store.get(contest.id);
  assert.equal(done?.status, 'awarded');
  assert.equal(done?.auto, true);
  assert.deepEqual(done?.winners?.map((w) => [w.entryId, w.place, w.netMicros]), [
    [entries[1], 1, '179100000'],
    [entries[2], 2, '119400000'],
  ]);
  assert.equal((await s.store.entry(entries[0]!))?.status, 'lost');
  assert.equal((await s.store.entry(entries[1]!))?.status, 'won');
  const told = s.told.find((t) => t.kind === 'contest.awarded');
  assert.equal(told?.payload.auto, true);
  assert.deepEqual(s.old, [], 'the first escrow is never called');
});

test('nobody entered, or every entry marked: after the wait the prize goes back', async () => {
  const s = setup();
  const posted = await s.core.post(BUYER, input);
  assert.ok(posted.ok);
  if (!posted.ok) return;
  s.at(posted.contest.awardBy - T0 + 3 * DAY);
  assert.equal(await s.core.returnDue(), 1);
  const done = await s.store.get(posted.contest.id);
  assert.equal(done?.status, 'returned');
  assert.equal(done?.backMicros, '301500000');
});

test('a contest opened on the first escrow keeps the old rule on the old escrow', async () => {
  const s = setup();
  const older: Contest = {
    id: 'c_old', chainId: '3', buyer: BUYER, buyerAgent: BUYER_AGENT, title: 'Old', brief: 'Old', tags: [],
    prizeMicros: '300000000', feeBps: 100, shares: [10_000], entriesBy: T0 + DAY, awardBy: T0 + 8 * DAY,
    status: 'open', createdAt: T0, updatedAt: T0,
  };
  await s.store.create(older);
  s.at(8 * DAY);
  assert.equal(await s.core.returnDue(), 1);
  assert.deepEqual(s.old, ['return']);
  assert.deepEqual(s.sent, []);
  assert.equal((await s.store.get('c_old'))?.status, 'returned');
});
