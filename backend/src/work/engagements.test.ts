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

/// View 76: monthly work, session by session.
const lessons: WorkInput = { worker: '@ada', kind: 'monthly', rateUsdc: '300', periods: 2, sessions: 12, title: 'Maths lessons', brief: 'Three a week' };
const SESSION_TERMS = { rate: 300_000_000n, unitScale: 12 };

test('a month of sessions: each one recorded, flagged by a note, paid after the month, the rest back', async () => {
  const { work, calls, told, at } = world();
  const d = await work.draft(HIRER, lessons);
  assert.ok(d.ok);
  assert.equal(d.card.totalMicros, '301500000');
  assert.equal(d.card.sessions, 12);
  await work.offer(HIRER, lessons);
  await work.accept(WORKER, 'w_1');
  const e = (await work.get('w_1'))!;
  assert.equal(e.sessions, 12);
  const win = windowsOf(e, 0);
  assert.equal(win.end - win.start, 28 * DAY);

  at(win.start + DAY);
  const badLink = await work.logHours(WORKER, 'w_1', { minutes: 1, note: 'Fractions', link: 'ftp://files/rec' });
  assert.ok(!badLink.ok && badLink.code === 'BAD_HOURS');
  assert.ok((await work.logHours(WORKER, 'w_1', { minutes: 1, note: 'Fractions', link: 'https://example.com/rec1' })).ok);
  at(win.start + 3 * DAY);
  assert.ok((await work.logHours(WORKER, 'w_1', { minutes: 1, note: 'Decimals' })).ok);
  at(win.start + 5 * DAY);
  assert.ok((await work.logHours(WORKER, 'w_1', { minutes: 1 })).ok);
  assert.deepEqual(calls.slice(2), ['submit:0:1', 'submit:0:2', 'submit:0:3']);
  assert.ok(told.some((t) => t.to === HIRER && /Session 2 of 12 recorded: Decimals\. Say now if it did not happen/.test(t.text)));
  const logged = (await work.get('w_1'))!.weeks[0]!;
  assert.equal(logged.log[0]!.link, 'https://example.com/rec1');

  const early = await work.approveHours(HIRER, 'w_1', 0);
  assert.ok(!early.ok && early.code === 'TOO_EARLY', 'the month is reviewed after it ends');
  assert.equal((await work.view('w_1', HIRER))!.weeks[0]!.canApprove, false);

  const before = calls.length;
  assert.ok(!(await work.flagSession(WORKER, 'w_1', { k: 0, n: 2, note: 'x' })).ok, 'only the hirer flags');
  const none = await work.flagSession(HIRER, 'w_1', { k: 0, n: 4, note: 'Nobody came' });
  assert.ok(!none.ok && none.code === 'BAD_HOURS');
  assert.ok((await work.flagSession(HIRER, 'w_1', { k: 0, n: 2, note: 'Nobody came' })).ok);
  assert.equal(calls.length, before, 'a flag is a note: nothing goes on chain');
  assert.equal((await work.get('w_1'))!.weeks[0]!.log[1]!.flagged?.note, 'Nobody came');
  assert.ok(told.some((t) => t.to === WORKER && /session 2 of month 1 did not happen: "Nobody came"/.test(t.text)));

  // One note a session; the hirer takes it back to change it (S-16, S-18).
  const twice = await work.flagSession(HIRER, 'w_1', { k: 0, n: 2, note: 'Again' });
  assert.ok(!twice.ok && twice.code === 'ALREADY_FLAGGED');
  assert.equal((await work.get('w_1'))!.weeks[0]!.log[1]!.flagged?.note, 'Nobody came');
  const seen = (await work.view('w_1', HIRER))!.weeks[0]!;
  assert.equal(seen.canFlag, true, 'two sessions still have no note');
  assert.equal(seen.canUnflag, true);
  assert.equal((await work.view('w_1', WORKER))!.weeks[0]!.canUnflag, false);
  assert.ok(!(await work.unflagSession(WORKER, 'w_1', { k: 0, n: 2 })).ok, 'only the hirer takes a note back');
  const plain = await work.unflagSession(HIRER, 'w_1', { k: 0, n: 1 });
  assert.ok(!plain.ok && plain.code === 'NOT_FLAGGED');
  assert.ok((await work.unflagSession(HIRER, 'w_1', { k: 0, n: 2 })).ok);
  assert.equal(calls.length, before, 'taking a note back puts nothing on chain');
  assert.equal((await work.get('w_1'))!.weeks[0]!.log[1]!.flagged, undefined);
  assert.equal((await work.get('w_1'))!.weeks[0]!.log[1]!.note, 'Decimals');
  assert.ok(told.some((t) => t.to === WORKER && /took back the note on session 2 of month 1/.test(t.text)));
  assert.equal((await work.view('w_1', HIRER))!.weeks[0]!.canUnflag, false);
  assert.ok((await work.flagSession(HIRER, 'w_1', { k: 0, n: 2, note: 'Cut short' })).ok, 'a new note can follow');
  assert.ok((await work.unflagSession(HIRER, 'w_1', { k: 0, n: 2 })).ok);

  at(win.end);
  const ok = await work.approveHours(HIRER, 'w_1', 0);
  assert.ok(ok.ok);
  const want = payFor(SESSION_TERMS, 100, 3, 301_500_000n);
  assert.equal(ok.paidMicros, want.net.toString());
  assert.ok(told.some((t) => t.to === WORKER && /3 sessions of month 1 approved/.test(t.text)));
  at(win.logBy);
  await work.runDue();
  const done = (await work.get('w_1'))!.weeks[0]!;
  assert.equal(done.status, 'settled');
  assert.equal(done.backMicros, want.back.toString());
});

test('no more sessions than the month holds, and sessions only on monthly work', async () => {
  const { work, at } = world();
  const code = async (i: Partial<WorkInput>) => {
    const r = await work.draft(HIRER, { ...lessons, ...i });
    return r.ok ? 'ok' : r.code;
  };
  assert.equal(await code({ sessions: 0 }), 'BAD_TERMS');
  assert.equal(await code({ sessions: 61 }), 'BAD_TERMS');
  assert.equal(await code({ sessions: 2.5 }), 'BAD_TERMS');
  const hourly = await work.draft(HIRER, { ...va, sessions: 12 });
  assert.ok(hourly.ok && hourly.card.sessions === undefined, 'by the hour has no sessions');

  await work.offer(HIRER, { ...lessons, sessions: 2, periods: 1 });
  await work.accept(WORKER, 'w_1');
  const win = windowsOf((await work.get('w_1'))!, 0);
  at(win.start + 1);
  assert.ok((await work.logHours(WORKER, 'w_1', { minutes: 1 })).ok);
  assert.ok((await work.logHours(WORKER, 'w_1', { minutes: 1 })).ok);
  const third = await work.logHours(WORKER, 'w_1', { minutes: 1 });
  assert.ok(!third.ok && third.code === 'OVER_SESSIONS');
  assert.match(third.message, /holds 2 sessions/);
});

test('sessions the hirer objects to go to review, and the others are paid at once', async () => {
  const { work, told, at } = world();
  await work.offer(HIRER, lessons);
  await work.accept(WORKER, 'w_1');
  const win = windowsOf((await work.get('w_1'))!, 0);
  at(win.start + 1);
  for (let i = 0; i < 3; i += 1) await work.logHours(WORKER, 'w_1', { minutes: 1 });
  at(win.logBy);
  const tooMany = await work.objectHours(HIRER, 'w_1', { k: 0, minutes: 4, reason: 'x' });
  assert.ok(!tooMany.ok && tooMany.code === 'BAD_HOURS');
  assert.match(tooMany.message, /up to 3 sessions/);
  assert.ok((await work.objectHours(HIRER, 'w_1', { k: 0, minutes: 1, reason: 'Nobody came on the 9th' })).ok);
  const w = (await work.get('w_1'))!.weeks[0]!;
  assert.equal(w.paidNetMicros, payFor(SESSION_TERMS, 100, 2, 301_500_000n).net.toString());
  assert.ok(told.some((t) => t.to === WORKER && /1 session of month 1 did not happen/.test(t.text)));
});

test('silence pays the recorded sessions when the review ends', async () => {
  const { work, at } = world();
  await work.offer(HIRER, { ...lessons, periods: 1 });
  await work.accept(WORKER, 'w_1');
  const win = windowsOf((await work.get('w_1'))!, 0);
  at(win.start + 1);
  for (let i = 0; i < 9; i += 1) await work.logHours(WORKER, 'w_1', { minutes: 1 });
  at(win.reviewBy);
  await work.runDue();
  const s = (await work.get('w_1'))!;
  const want = payFor(SESSION_TERMS, 100, 9, 301_500_000n);
  assert.equal(s.weeks[0]!.paidNetMicros, want.net.toString());
  assert.equal(s.weeks[0]!.backMicros, want.back.toString());
});

test('halfway through a month of sessions, both are told once when fewer than half are recorded', async () => {
  const pace = (told: { to: string; text: string }[]) => told.filter((t) => /behind the pace/.test(t.text));
  const start = async (recorded: number, sessions = 12) => {
    const w = world();
    await w.work.offer(HIRER, { ...lessons, sessions, periods: 1 });
    await w.work.accept(WORKER, 'w_1');
    const win = windowsOf((await w.work.get('w_1'))!, 0);
    w.at(win.start + 1);
    for (let i = 0; i < recorded; i += 1) await w.work.logHours(WORKER, 'w_1', { minutes: 1 });
    return { ...w, win };
  };

  const behind = await start(3);
  behind.at(behind.win.start + 14 * DAY - 1);
  await behind.work.runDue();
  assert.equal(pace(behind.told).length, 0, 'not before the halfway point');
  behind.at(behind.win.start + 14 * DAY);
  await behind.work.runDue();
  await behind.work.runDue();
  const said = pace(behind.told);
  assert.deepEqual(said.map((t) => t.to).sort(), [HIRER, WORKER].sort(), 'each side once');
  assert.match(said[0]!.text, /month 1 is halfway and 3 of 12 sessions are recorded\. That is behind the pace you agreed\./);
  assert.equal((await behind.work.get('w_1'))!.weeks[0]!.status, 'logged', 'nothing else changes');

  const onPace = await start(6);
  onPace.at(onPace.win.start + 14 * DAY);
  await onPace.work.runDue();
  assert.equal(pace(onPace.told).length, 0, 'half recorded is on pace');

  const odd = await start(2, 5);
  odd.at(odd.win.start + 20 * DAY);
  await odd.work.runDue();
  assert.equal(pace(odd.told).length, 2, '2 of 5 is under half');

  const late = await start(1);
  late.at(late.win.end);
  await late.work.runDue();
  assert.equal(pace(late.told).length, 0, 'never after the month has ended');
});
