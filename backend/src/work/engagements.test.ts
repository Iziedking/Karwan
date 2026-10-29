import assert from 'node:assert/strict';
import test from 'node:test';
import type { Address, Hex } from 'viem';
import { grossOf, payFor, weekCost } from '../chain/timeEscrow.js';
import { memoryEngagementsStore } from '../db/engagements.js';
import { COOL_OFF_MS, createEngagements, hoursText, RULING_MS, windowsOf, type WorkChain, type WorkInput } from './engagements.js';

/// Hourly work and retainers (view 32): the rules a person meets, with a chain
/// that does the contract's maths.

const HIRER: Address = '0x1111111111111111111111111111111111111111';
const HIRER_AGENT: Address = '0x1111111111111111111111111111111111110001';
const WORKER: Address = '0x2222222222222222222222222222222222222222';
const WORKER_AGENT: Address = '0x2222222222222222222222222222222222220002';
const DAY = 86_400_000;
const T0 = Date.UTC(2026, 10, 2, 9);

function world(over: { balance?: bigint; cap?: bigint; finished?: boolean; workerAgent?: boolean } = {}) {
  let now = T0;
  const calls: string[] = [];
  const told: Array<{ to: string; text: string }> = [];
  const store = memoryEngagementsStore();
  if (over.finished) {
    void store.create({
      id: 'w_old', salt: '0x00', kind: 'hourly', hirer: '0x9999999999999999999999999999999999999999', hirerAgent: '0x9999999999999999999999999999999999999999',
      worker: WORKER, workerAgent: WORKER_AGENT, title: 'old', brief: '', rateMicros: '1', maxHours: 1, periods: 1, startsAt: 0, feeBps: 100,
      termsHash: '0x00', terms: {} as never, status: 'closed', tx: {}, createdAt: 0, updatedAt: 0,
      weeks: [{ k: 0, fundedMicros: '1', loggedMinutes: 60, approvedMinutes: 60, objectedMinutes: 0, log: [], status: 'settled', paidNetMicros: '5' }],
    });
  }
  const units: Record<number, { claimed: number; approved: number; paid: bigint }> = {};
  const fee = 100;
  let terms: Parameters<WorkChain['offer']>[1]['terms'] | null = null;
  const week = (k: number) => (units[k] ??= { claimed: 0, approved: 0, paid: 0n });
  const total = () => weekCost(terms!, fee).total;
  const pay = (k: number, toUnits: number) => {
    const before = payFor(terms!, fee, week(k).approved, total()).net;
    const after = payFor(terms!, fee, toUnits, total()).net;
    week(k).approved = toUnits;
    return after - before;
  };
  const chain: WorkChain = {
    async offer(_w, i) {
      calls.push('offer');
      terms = i.terms;
      return { id: `0x${'e'.repeat(64)}` as Hex, txHash: '0x01' };
    },
    async accept() { calls.push('accept'); return '0x02'; },
    async cancel() { calls.push('cancel'); return { txHash: '0x03', back: total() }; },
    async fund(_w, i) { calls.push(`fund:${i.k}`); return '0x04'; },
    async submit(_w, i) { calls.push(`submit:${i.k}:${i.units}`); week(i.k).claimed = i.units; return '0x05'; },
    async approve(_w, i) { calls.push(`approve:${i.k}:${i.units}`); return { txHash: '0x06', paid: pay(i.k, i.units) }; },
    async object(_w, i) {
      calls.push(`object:${i.k}:${i.units}`);
      return { txHash: '0x07', paid: pay(i.k, week(i.k).claimed - i.units) };
    },
    async notice() { calls.push('notice'); return { txHash: '0x08', runs: 2 }; },
    async settle(i) {
      calls.push(`settle:${i.k}`);
      const w = week(i.k);
      const paidNow = pay(i.k, w.claimed);
      return { txHash: '0x09', gross: grossOf(terms!, w.claimed), back: payFor(terms!, fee, w.claimed, total()).back, paidNow };
    },
    async fallback(i) {
      calls.push(`fallback:${i.k}`);
      const w = week(i.k);
      const base = grossOf(terms!, w.approved);
      const award = ((grossOf(terms!, w.claimed) - base) * 5000n) / 10_000n;
      const gross = base + award;
      const f = (gross * 100n) / 10_000n;
      const net = gross - (f - f / 2n);
      const paidNow = net - payFor(terms!, fee, w.approved, total()).net;
      return { txHash: '0x0a', gross, back: total() - gross - f / 2n, paidNow };
    },
    async close() { calls.push('close'); return { txHash: '0x0b', refunded: 0n }; },
    async escalate(i) { calls.push(`escalate:${i.k}`); return '0x0c'; },
  };
  const work = createEngagements({
    store, chain, asset: '0x3600000000000000000000000000000000000000',
    openingConfig: async () => ({ open: true, feeBps: fee, perDealCap: over.cap ?? 1_005_000_000n }),
    resolveWorker: async (raw) => (raw === '@ada' ? WORKER : raw === '@me' ? HIRER : null),
    buyerAgentFor: async (u) => (u === HIRER ? { walletId: 'hb', address: HIRER_AGENT } : null),
    sellerAgentFor: async (u) => (u === WORKER && over.workerAgent !== false ? { walletId: 'ws', address: WORKER_AGENT } : null),
    identityOf: async () => 0n,
    balanceOf: async () => over.balance ?? 10_000_000_000n,
    guard: async () => ({ ok: true }),
    tellPerson: (to, text) => told.push({ to, text }),
    emit: () => {},
    now: () => now,
    newId: (prefix) => `${prefix}_1`,
    newSalt: () => `0x${'5'.repeat(64)}`,
  });
  return { work, calls, told, store, at: (ms: number) => { now = ms; } };
}

const va: WorkInput = { worker: '@ada', kind: 'hourly', rateUsdc: '15', maxHours: 20, periods: 2, title: 'Virtual assistant', brief: 'Inbox and calendar' };

test('the card shows week 1 at 301.50 and the most it can cost', async () => {
  const { work } = world();
  const d = await work.draft(HIRER, va);
  assert.ok(d.ok);
  assert.equal(d.card.totalMicros, '301500000');
  assert.equal(d.card.mostMicros, '603000000');
  assert.equal(d.card.startsAt, T0 + 2 * DAY);
});

test('what the draft refuses, in words', async () => {
  const { work } = world();
  const code = async (i: Partial<WorkInput>) => {
    const r = await work.draft(HIRER, { ...va, ...i });
    return r.ok ? 'ok' : r.code;
  };
  assert.equal(await code({ worker: '@me' }), 'OWN_WORK');
  assert.equal(await code({ worker: '@nobody' }), 'NO_WORKER');
  assert.equal(await code({ rateUsdc: '0' }), 'BAD_TERMS');
  assert.equal(await code({ maxHours: 81 }), 'BAD_TERMS');
  assert.equal(await code({ periods: 53 }), 'BAD_TERMS');
  assert.equal(await code({ kind: 'monthly', periods: 13 }), 'BAD_TERMS');
  assert.equal(await code({ startsInDays: 31 }), 'BAD_TERMS');
  const over = await work.draft(HIRER, { ...va, rateUsdc: '60' });
  assert.ok(!over.ok && over.code === 'OVER_CAP');
  assert.match(over.message, /at most 16 hours a week/);
  const noSeller = await world({ workerAgent: false }).work.draft(HIRER, va);
  assert.ok(!noSeller.ok && noSeller.code === 'NO_SELLER_AGENT');
});

test('a hirer who is short is told how much to add, and nothing is sent', async () => {
  const { work, calls } = world({ balance: 100_000_000n });
  const r = await work.offer(HIRER, va);
  assert.ok(!r.ok && r.code === 'BUYER_AGENT_SHORT' && r.needMicros === '201500000');
  assert.deepEqual(calls, []);
});

test('a double tap on the offer sends one offer', async () => {
  const { work, calls } = world();
  const both = await Promise.all([work.offer(HIRER, va), work.offer(HIRER, va)]);
  assert.equal(both.filter((r) => r.ok).length, 1);
  assert.deepEqual(calls, ['offer']);
});

test('a full week: accept, log by the minute, approve, settle exactly', async () => {
  const { work, calls, told, at } = world();
  const o = await work.offer(HIRER, va);
  assert.ok(o.ok);
  assert.ok(!(await work.accept(HIRER, 'w_1')).ok, 'only the worker accepts');
  assert.ok((await work.accept(WORKER, 'w_1')).ok);
  const e = (await work.get('w_1'))!;
  const win = windowsOf(e, 0);

  at(win.start - 1);
  const early = await work.logHours(WORKER, 'w_1', { minutes: 60 });
  assert.ok(!early.ok && early.code === 'NOT_STARTED');
  at(win.start + DAY);
  assert.ok((await work.logHours(WORKER, 'w_1', { minutes: 450, note: 'Inbox' })).ok);
  assert.ok((await work.logHours(WORKER, 'w_1', { minutes: 300 })).ok);
  const over = await work.logHours(WORKER, 'w_1', { minutes: 451 });
  assert.ok(!over.ok && over.code === 'OVER_HOURS');
  assert.match(over.message, /7 h 30 m is left/);

  const ok = await work.approveHours(HIRER, 'w_1', 0);
  assert.ok(ok.ok);
  assert.equal(ok.paidMicros, '186562500');
  at(win.logBy);
  const late = await work.logHours(WORKER, 'w_1', { minutes: 10, k: 0 });
  assert.ok(!late.ok && late.code === 'LOG_CLOSED');
  await work.runDue();
  const done = (await work.get('w_1'))!;
  assert.equal(done.weeks[0]!.status, 'settled');
  assert.equal(done.weeks[0]!.paidNetMicros, '186562500');
  assert.equal(done.weeks[0]!.backMicros, '113062500');
  assert.deepEqual(calls.slice(0, 5), ['offer', 'accept', 'submit:0:450', 'submit:0:750', 'approve:0:750']);
  assert.ok(told.some((t) => t.to === HIRER && /113\.0625 USDC not used came back/.test(t.text)));
  assert.equal(hoursText(750), '12 h 30 m');
});

test('silence pays the logged hours when review ends, not before', async () => {
  const { work, calls, at } = world();
  await work.offer(HIRER, va);
  await work.accept(WORKER, 'w_1');
  const e = (await work.get('w_1'))!;
  const win = windowsOf(e, 0);
  at(win.start + 1);
  await work.logHours(WORKER, 'w_1', { minutes: 600 });
  at(win.reviewBy - 1);
  await work.runDue();
  assert.ok(!calls.includes('settle:0'));
  at(win.reviewBy);
  await work.runDue();
  assert.ok(calls.includes('settle:0'));
  assert.equal((await work.get('w_1'))!.weeks[0]!.paidNetMicros, payFor({ rate: 15_000_000n, unitScale: 60 }, 100, 600, 301_500_000n).net.toString());
});

test('objected hours: only inside the window, the rest paid, then the review team, then half each', async () => {
  const { work, calls, at } = world();
  await work.offer(HIRER, va);
  await work.accept(WORKER, 'w_1');
  const e = (await work.get('w_1'))!;
  const win = windowsOf(e, 0);
  at(win.start + 1);
  await work.logHours(WORKER, 'w_1', { minutes: 1200 });
  const early = await work.objectHours(HIRER, 'w_1', { k: 0, minutes: 300, reason: 'Not worked on Friday' });
  assert.ok(!early.ok && early.code === 'TOO_EARLY');
  at(win.logBy);
  const tooMany = await work.objectHours(HIRER, 'w_1', { k: 0, minutes: 1201, reason: 'x' });
  assert.ok(!tooMany.ok && tooMany.code === 'BAD_HOURS');
  assert.ok((await work.objectHours(HIRER, 'w_1', { k: 0, minutes: 300, reason: 'Not worked on Friday' })).ok);
  const w = (await work.get('w_1'))!.weeks[0]!;
  assert.equal(w.paidNetMicros, payFor({ rate: 15_000_000n, unitScale: 60 }, 100, 900, 301_500_000n).net.toString(), '15 hours paid at once');

  at(win.logBy + COOL_OFF_MS - 1);
  await work.runDue();
  assert.ok(!calls.includes('escalate:0'));
  at(win.logBy + COOL_OFF_MS);
  await work.runDue();
  assert.ok(calls.includes('escalate:0'));
  at(win.logBy + COOL_OFF_MS + RULING_MS);
  await work.runDue();
  assert.ok(calls.includes('fallback:0'));
  const s = (await work.get('w_1'))!.weeks[0]!;
  assert.equal(s.status, 'settled');
  // 15 hours plus half of 5: 17.5 hours gross, less half the fee.
  const gross = 262_500_000n;
  const f = 2_625_000n;
  assert.equal(s.paidNetMicros, (gross - (f - f / 2n)).toString());
});

test('a new worker is paid one week at a time; a finished one up to four ahead', async () => {
  const fresh = world();
  await fresh.work.offer(HIRER, { ...va, periods: 6, maxHours: 10 });
  await fresh.work.accept(WORKER, 'w_1');
  const ahead = await fresh.work.fundNext(HIRER, 'w_1');
  assert.ok(!ahead.ok && ahead.code === 'AHEAD_LIMIT');
  const e = (await fresh.work.get('w_1'))!;
  fresh.at(windowsOf(e, 0).start);
  assert.ok((await fresh.work.fundNext(HIRER, 'w_1')).ok, 'once week 1 starts, week 2 can be paid for');

  const known = world({ finished: true });
  await known.work.offer(HIRER, { ...va, periods: 6, maxHours: 10 });
  await known.work.accept(WORKER, 'w_1');
  for (let i = 0; i < 3; i += 1) assert.ok((await known.work.fundNext(HIRER, 'w_1')).ok, `week ${i + 2}`);
  const fifth = await known.work.fundNext(HIRER, 'w_1');
  assert.ok(!fifth.ok && fifth.code === 'AHEAD_LIMIT', 'four weeks ahead at most');

  const big = world({ finished: true });
  await big.work.offer(HIRER, { ...va, periods: 6 });
  await big.work.accept(WORKER, 'w_1');
  assert.ok((await big.work.fundNext(HIRER, 'w_1')).ok);
  assert.ok((await big.work.fundNext(HIRER, 'w_1')).ok);
  const capped = await big.work.fundNext(HIRER, 'w_1');
  assert.ok(!capped.ok && capped.code === 'OVER_CAP', 'three weeks of 301.50 fit under 1,005, a fourth does not');
});

test('an unfunded week cannot take hours, both are told once, and the work closes after it ends', async () => {
  const { work, calls, told, at } = world();
  await work.offer(HIRER, va);
  await work.accept(WORKER, 'w_1');
  const e = (await work.get('w_1'))!;
  const w1 = windowsOf(e, 1);
  at(windowsOf(e, 0).start + 1);
  await work.logHours(WORKER, 'w_1', { minutes: 60 });
  at(w1.start + 1);
  const r = await work.logHours(WORKER, 'w_1', { minutes: 60 });
  assert.ok(!r.ok && r.code === 'NOT_FUNDED', 'hours go to the week running now, never quietly to last week');
  assert.ok((await work.logHours(WORKER, 'w_1', { minutes: 30, k: 0 })).ok, 'last week, named, while its logging is open');
  await work.runDue();
  await work.runDue();
  assert.equal(told.filter((t) => /is not paid for yet, so hold off/.test(t.text)).length, 1);
  at(w1.end);
  await work.runDue();
  assert.ok(calls.includes('settle:0'));
  assert.ok(calls.includes('close'));
  assert.equal((await work.get('w_1'))!.status, 'closed');
});

test('an offer nobody accepts comes back after the start; a declined one at once', async () => {
  const a = world();
  await a.work.offer(HIRER, va);
  const e = (await a.work.get('w_1'))!;
  a.at(e.startsAt - 1);
  await a.work.runDue();
  assert.ok(!a.calls.includes('cancel'));
  const late = await (async () => { a.at(e.startsAt); return a.work.accept(WORKER, 'w_1'); })();
  assert.ok(!late.ok && late.code === 'TOO_LATE');
  await a.work.runDue();
  assert.equal((await a.work.get('w_1'))!.status, 'cancelled');

  const b = world();
  await b.work.offer(HIRER, va);
  assert.ok((await b.work.decline(WORKER, 'w_1')).ok);
  await b.work.runDue();
  assert.equal((await b.work.get('w_1'))!.status, 'cancelled');
  assert.ok(b.told.some((t) => t.to === HIRER && /301\.5 USDC is back/.test(t.text)));
});

test('hired from an offer: the worker already agreed, so their agent accepts in the same step', async () => {
  const { work, calls, told } = world();
  const r = await work.offer(HIRER, va, { workerAgreed: true, fromJob: 'job', fromOffer: 'o1' });
  assert.ok(r.ok && r.work.status === 'active');
  assert.deepEqual(calls, ['offer', 'accept']);
  assert.ok(told.some((t) => t.to === WORKER && /You're hired/.test(t.text)));
});

test('a stranger sees nothing', async () => {
  const { work } = world();
  await work.offer(HIRER, va);
  assert.equal(await work.view('w_1', '0x3333333333333333333333333333333333333333'), null);
  const v = await work.view('w_1', WORKER);
  assert.equal(v?.role, 'worker');
  assert.equal(v?.canAccept, true);
  assert.equal((v as Record<string, unknown>).salt, undefined);
});

test('a monthly retainer is claimed once and paid in full by silence', async () => {
  const { work, at } = world();
  await work.offer(HIRER, { ...va, kind: 'monthly', rateUsdc: '400', periods: 1 });
  await work.accept(WORKER, 'w_1');
  const e = (await work.get('w_1'))!;
  const win = windowsOf(e, 0);
  at(win.end);
  assert.ok((await work.logHours(WORKER, 'w_1', { minutes: 0 })).ok);
  const again = await work.logHours(WORKER, 'w_1', { minutes: 0 });
  assert.ok(!again.ok && again.code === 'ALREADY_LOGGED');
  at(win.reviewBy);
  await work.runDue();
  const s = (await work.get('w_1'))!;
  assert.equal(s.weeks[0]!.paidNetMicros, '398000000');
  assert.equal(s.status, 'closed');
});
