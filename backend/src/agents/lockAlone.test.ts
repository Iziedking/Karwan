import assert from 'node:assert/strict';
import test from 'node:test';
import { newAgentRecord, type AgentRecord, type LockEntry } from './agentRecord.js';
import { lockAlone, type LockDeps, type LockNews, type LockPick, type LockStep } from './lockAlone.js';

/// The agent locks the money for a deal it agreed (view 87, step 3).
///
///   npx tsx --test src/agents/lockAlone.test.ts

const NOW = Date.UTC(2026, 10, 16, 12);
const JOB = '0xjob';
const PICK: LockPick = { owner: '0xowner', seller: '0xseller', priceUsdc: '42', openedAtUsdc: '55' };

interface World {
  record: AgentRecord;
  step: LockStep | null;
  funded: boolean;
  fundCalls: number;
  asked: Array<{ reason: string; addUsdc?: string }>;
  told: LockNews[];
  deps: LockDeps;
}

function world(over: Partial<LockDeps> = {}, locks: LockEntry[] = []): World {
  const w: World = {
    record: { ...newAgentRecord('0xowner'), lock: { perDeal: { usdc: 50 }, perWeek: { usdc: 100 }, perDay: 3, who: 'record', locks } },
    step: null,
    funded: false,
    fundCalls: 0,
    asked: [],
    told: [],
    deps: undefined as unknown as LockDeps,
  };
  w.deps = {
    serverOn: () => true,
    familyOpen: () => true,
    pick: async () => PICK,
    step: async () => w.step,
    writeStep: async (_j, s) => { w.step = s; },
    funded: async () => w.funded,
    person: async () => ({ agentOn: true, lock: true, timeZone: 'Africa/Lagos' }),
    family: async () => true,
    totalUsdc: async (p) => (Number(p) * 1.01).toFixed(2),
    shortBy: async () => null,
    seller: async () => ({ verified: false, settledDeals: 3, upheldDisputes: 0 }),
    marketUsdc: async () => 40,
    outlierPct: 40,
    reserve: async (_o, decide) => {
      const d = decide(w.record);
      if (d.ok) w.record = d.record;
      return { ok: d.ok, record: w.record };
    },
    update: async (_o, change) => (w.record = change(w.record)),
    shortlistOk: async () => true,
    worldStep: async () => 'proceed',
    sellerAnswer: async () => 'go',
    fund: async () => {
      w.fundCalls += 1;
      w.funded = true;
      return { ok: true, txHash: '0xtx' };
    },
    ask: async (i) => { w.asked.push({ reason: i.reason, ...(i.addUsdc ? { addUsdc: i.addUsdc } : {}) }); },
    tell: (n) => { w.told.push(n); },
    ...over,
  };
  return w;
}

const held = (w: World) => w.record.lock?.locks ?? [];

test('inside the rules it funds once, counts the lock and tells the person', async () => {
  const w = world();
  assert.deepEqual(await lockAlone(w.deps, JOB, NOW), { kind: 'locked', txHash: '0xtx' });
  assert.equal(w.fundCalls, 1);
  assert.deepEqual(held(w), [{ at: NOW, usdc: 42.42, jobId: JOB, state: 'done' }]);
  assert.equal(w.step?.state, 'done');
  assert.deepEqual(w.told, [{ type: 'agent.locked', owner: '0xowner', jobId: JOB, seller: '0xseller', priceUsdc: '42', totalUsdc: '42.42', openedAtUsdc: '55', txHash: '0xtx' }]);
  assert.deepEqual(await lockAlone(w.deps, JOB, NOW + 1), { kind: 'skipped', why: 'done' }, 'a second run does nothing');
  assert.equal(w.told.length, 1);
});

test('nothing to lock, or a switch that is off, is silent', async () => {
  for (const over of [
    { serverOn: () => false },
    { pick: async () => null },
    { person: async () => ({ agentOn: false, lock: true, timeZone: 'UTC' }) },
    { person: async () => ({ agentOn: true, lock: false, timeZone: 'UTC' }) },
  ] as Array<Partial<LockDeps>>) {
    const w = world(over);
    assert.equal((await lockAlone(w.deps, JOB, NOW)).kind, 'skipped');
    assert.equal(w.fundCalls + w.asked.length + w.told.length + held(w).length, 0);
  }
  const stopped = world();
  stopped.record = { ...stopped.record, stopped: { at: NOW - 1, reason: 'lock-failures' } };
  assert.deepEqual(await lockAlone(stopped.deps, JOB, NOW), { kind: 'skipped', why: 'stopped' });
  const tapped = world();
  tapped.funded = true;
  assert.deepEqual(await lockAlone(tapped.deps, JOB, NOW), { kind: 'skipped', why: 'funded' }, 'the person locked it themselves');
});

test('past a limit, a seller with no record or a price far from the market becomes a question; nothing is held or funded', async () => {
  const cases: Array<[Partial<LockDeps>, LockEntry[], string]> = [
    [{ totalUsdc: async () => '50.01' }, [], 'over-deal'],
    [{}, [{ at: NOW - 1000, usdc: 60, jobId: '0xother', state: 'done' }], 'over-week'],
    [{ seller: async () => ({ verified: false, settledDeals: 0, upheldDisputes: 0 }) }, [], 'who'],
    [{ marketUsdc: async () => 20 }, [], 'price-outlier'],
    [{ family: async () => false, familyOpen: () => false }, [], 'not-family'],
  ];
  for (const [over, locks, reason] of cases) {
    const w = world(over, locks);
    assert.deepEqual(await lockAlone(w.deps, JOB, NOW), { kind: 'asked', reason });
    assert.deepEqual(w.asked, [{ reason }]);
    assert.equal(w.fundCalls, 0);
    assert.equal(held(w).length, locks.length);
  }
});

test('a fourth lock in a day, or a deal aimed off the escrow family, stops the agent and says so once', async () => {
  const three: LockEntry[] = [1, 2, 3].map((n) => ({ at: NOW - n * 1000, usdc: 1, jobId: `0x${n}`, state: 'done' as const }));
  const day = world({}, three);
  assert.deepEqual(await lockAlone(day.deps, JOB, NOW), { kind: 'stopped', reason: 'locks-today' });
  assert.equal(day.record.stopped?.reason, 'locks-today');
  assert.deepEqual(day.told, [{ type: 'agent.stopped', owner: '0xowner', reason: 'locks-today' }]);
  assert.equal(day.fundCalls, 0);
  const off = world({ family: async () => false });
  assert.deepEqual(await lockAlone(off.deps, JOB, NOW), { kind: 'stopped', reason: 'not-family' });
});

test('the checks a tap runs still run: an unverified seller and World ID are asked, and what was held is given back', async () => {
  const unverified = world({ shortlistOk: async () => false });
  assert.deepEqual(await lockAlone(unverified.deps, JOB, NOW), { kind: 'asked', reason: 'unverified' });
  assert.deepEqual(held(unverified), []);
  const worldId = world({ worldStep: async () => 'buyer' });
  assert.deepEqual(await lockAlone(worldId.deps, JOB, NOW), { kind: 'asked', reason: 'world-id' });
  assert.deepEqual(held(worldId), []);
  assert.equal(unverified.fundCalls + worldId.fundCalls, 0);
});

test('a seller who must answer first keeps the amount held; their yes funds, their no gives it back', async () => {
  const w = world({ sellerAnswer: async () => 'wait' });
  assert.deepEqual(await lockAlone(w.deps, JOB, NOW), { kind: 'waiting-seller' });
  assert.equal(held(w)[0]?.state, 'held');
  assert.equal(w.fundCalls, 0);
  assert.deepEqual(await lockAlone(w.deps, JOB, NOW + 60_000, { sellerSaidYes: true }), { kind: 'locked', txHash: '0xtx' });
  assert.equal(held(w).length, 1);
  assert.equal(held(w)[0]?.state, 'done');
  const no = world({ sellerAnswer: async () => 'declined' });
  assert.deepEqual(await lockAlone(no.deps, JOB, NOW), { kind: 'skipped', why: 'seller-declined' });
  assert.deepEqual(held(no), []);
});

test('the seller says yes after the limit was lowered: nothing is locked and the person is asked', async () => {
  const w = world({ sellerAnswer: async () => 'wait' });
  await lockAlone(w.deps, JOB, NOW);
  w.record = { ...w.record, lock: { ...w.record.lock!, perDeal: { usdc: 20 } } };
  assert.deepEqual(await lockAlone(w.deps, JOB, NOW + 60_000, { sellerSaidYes: true }), { kind: 'asked', reason: 'over-deal' });
  assert.equal(w.fundCalls, 0);
});

test('short of money: nothing is funded, the ask names what to add', async () => {
  const w = world({ shortBy: async () => '12.42' });
  assert.deepEqual(await lockAlone(w.deps, JOB, NOW), { kind: 'asked', reason: 'short' });
  assert.deepEqual(w.asked, [{ reason: 'short', addUsdc: '12.42' }]);
  assert.equal(w.fundCalls, 0);
  assert.equal(w.step, null, 'no step is written before the money is there');
  assert.deepEqual(held(w), []);
});

test('a restart between the written step and the funding ends funded once and told once', async () => {
  const crashed = world({ fund: async () => { throw new Error('process died'); } });
  await assert.rejects(lockAlone(crashed.deps, JOB, NOW));
  assert.equal(crashed.step?.state, 'started');
  // After the restart the escrow is still empty: the step runs once.
  const again = world();
  again.record = crashed.record;
  again.step = crashed.step;
  assert.deepEqual(await lockAlone(again.deps, JOB, NOW + 5000), { kind: 'locked', txHash: '0xtx' });
  assert.equal(again.fundCalls, 1);
  assert.equal(held(again).length, 1);
  // The other order: the money went in before the process died.
  const paid = world();
  paid.record = crashed.record;
  paid.step = crashed.step;
  paid.funded = true;
  assert.deepEqual(await lockAlone(paid.deps, JOB, NOW + 5000), { kind: 'locked', txHash: '' });
  assert.equal(paid.fundCalls, 0);
  assert.equal(paid.told.length, 1);
  assert.equal(held(paid)[0]?.state, 'done');
});

test('a funding that fails is asked about, and the third in a row stops the agent', async () => {
  const w = world({ fund: async () => ({ ok: false, code: 'FUND_FAILED', message: 'no' }) });
  assert.deepEqual(await lockAlone(w.deps, JOB, NOW), { kind: 'asked', reason: 'failed' });
  assert.deepEqual(held(w), []);
  await lockAlone(w.deps, JOB, NOW + 1);
  assert.deepEqual(await lockAlone(w.deps, JOB, NOW + 2), { kind: 'stopped', reason: 'lock-failures' });
  assert.deepEqual(w.told, [{ type: 'agent.stopped', owner: '0xowner', reason: 'lock-failures' }]);
  const already = world({ fund: async () => ({ ok: false, code: 'ALREADY_APPROVED', message: '' }) });
  assert.equal((await lockAlone(already.deps, JOB, NOW)).kind, 'locked', 'a deal funded by another path counts as done');
});
