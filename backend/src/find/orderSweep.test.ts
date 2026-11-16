import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { claimDueOrders, newOrder, orderOf, removeOrder, resetOrdersForTests, saveOrder, saveRun, validateOrder, type StandingOrder } from './orders.js';
import type { RunOutcome } from './orderRun.js';
import { orderNote, runOrderSweep, type OrderSweepDeps } from './orderSweep.js';

/// The standing order sweep (view 87, step 4), on the memory store.
///
///   node ../scripts/run-tests.mjs src/find/orderSweep.test.ts

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 10, 16, 12);

beforeEach(() => resetOrdersForTests());

function order(id: string, over: Partial<StandingOrder> = {}): StandingOrder {
  const v = validateOrder({ side: 'buy', need: 'A 50kg bag of rice', budgetUsdc: 40, kind: 'goods' }, 0, NOW);
  assert.ok(v.ok);
  return { ...newOrder('0xbuyer', v.order, id, NOW, 13, '2026-11-16'), ...over };
}

function sweep(outcome: (o: StandingOrder) => RunOutcome, over: Partial<OrderSweepDeps> = {}) {
  const told: Array<{ id: string; kind: string }> = [];
  const ran: string[] = [];
  const deps: OrderSweepDeps = {
    claim: claimDueOrders,
    zoneOf: async () => ({ timeZone: 'Africa/Lagos', quiet: { from: 21, to: 7 } }),
    run: async (o) => {
      ran.push(o.id);
      return { order: { ...o, today: { ...o.today, asked: o.today.asked + 3 } }, outcome: outcome(o) };
    },
    save: saveRun,
    tell: async (o, out) => void told.push({ id: o.id, kind: out.kind }),
    ...over,
  };
  return { deps, told, ran };
}

test('two sweeps at the same moment run each due order once and tell once', async () => {
  await saveOrder(order('o1'));
  await saveOrder(order('o2', { state: 'paused' }));
  const s = sweep(() => ({ kind: 'asked', n: 3, names: ['Ngozi', 'Amaka', 'Tunde'] }));
  const [a, b] = await Promise.all([runOrderSweep(NOW + 1, s.deps), runOrderSweep(NOW + 1, s.deps)]);
  assert.equal(a + b, 1);
  assert.deepEqual(s.ran, ['o1']);
  assert.deepEqual(s.told, [{ id: 'o1', kind: 'asked' }]);
  const saved = await orderOf('0xbuyer', 'o1');
  assert.equal(saved?.today.asked, 3);
  assert.equal(saved?.nextAt, NOW + DAY, 'tomorrow at the hour it was started');
  assert.equal(await runOrderSweep(NOW + 60_000, s.deps), 0, 'nothing is due a minute later');
});

test('an order stopped while its run worked is not saved back and nothing is said', async () => {
  await saveOrder(order('o1'));
  const s = sweep(() => ({ kind: 'asked', n: 1, names: ['Ngozi'] }));
  s.deps.run = async (o) => {
    await removeOrder('0xbuyer', 'o1');
    return { order: o, outcome: { kind: 'asked', n: 1, names: ['Ngozi'] } };
  };
  assert.equal(await runOrderSweep(NOW + 1, s.deps), 0);
  assert.deepEqual(s.told, []);
  assert.equal(await orderOf('0xbuyer', 'o1'), null);
});

test('a run that fails does not hold the other orders, and keeps its next run', async () => {
  await saveOrder(order('o1'));
  await saveOrder(order('o2', { createdAt: NOW + 1 }));
  const s = sweep(() => ({ kind: 'waiting' }));
  const run = s.deps.run;
  s.deps.run = async (o, now) => {
    if (o.id === 'o1') throw new Error('directory down');
    return run(o, now);
  };
  assert.equal(await runOrderSweep(NOW + 1, s.deps), 1);
  assert.equal((await orderOf('0xbuyer', 'o1'))?.nextAt, NOW + DAY);
});

test('what a run says: asked, pitched, nobody on day three, and what it waits for once', () => {
  const o = { need: 'A 50kg bag of rice', side: 'buy' as const };
  const said = (outcome: RunOutcome, side: 'buy' | 'sell' = 'buy') => orderNote({ ...o, side }, outcome, 'en');
  assert.deepEqual(said({ kind: 'asked', n: 3, names: ['Ngozi', 'Amaka', 'Tunde'] }), {
    heading: 'Your standing order',
    lines: ['I asked 3 people for "A 50kg bag of rice": Ngozi, Amaka, Tunde.', 'Their offers come to you as they answer.'],
  });
  assert.equal(said({ kind: 'asked', n: 1, names: ['Ngozi'] })?.lines[0], 'I asked Ngozi for "A 50kg bag of rice".');
  assert.equal(said({ kind: 'pitched', n: 2 }, 'sell')?.lines[0], 'I offered your work to 2 buyers who need it regularly.');
  assert.equal(said({ kind: 'pitched', n: 1 }, 'sell')?.lines[0], 'I offered your work to 1 buyer who needs it regularly.');
  assert.equal(said({ kind: 'nobody', days: 1 }), null);
  assert.equal(said({ kind: 'nobody', days: 2 }), null);
  assert.match(said({ kind: 'nobody', days: 3 })!.lines[0]!, /^Three days and nobody new fits/);
  assert.match(said({ kind: 'nobody', days: 3 }, 'sell')!.lines[0]!, /no new buyer/);
  assert.equal(said({ kind: 'nobody', days: 4 }), null);
  assert.match(said({ kind: 'needs-location', first: true })!.lines[0]!, /roughly where you are/);
  assert.equal(said({ kind: 'needs-location', first: false }), null);
  assert.match(said({ kind: 'short', first: true })!.lines[0]!, /balance is too low/);
  assert.equal(said({ kind: 'short', first: false }), null);
  assert.match(said({ kind: 'ended', why: 'date' })!.lines[0]!, /reached its date/);
  for (const quiet of [{ kind: 'ended', why: 'locked' }, { kind: 'off' }, { kind: 'waiting' }, { kind: 'not-posted' }] as RunOutcome[]) assert.equal(said(quiet), null);
});

test('the notes exist in every language and none carries a long dash', () => {
  const outcomes: RunOutcome[] = [
    { kind: 'asked', n: 2, names: ['A', 'B'] }, { kind: 'asked', n: 1, names: ['A'] }, { kind: 'pitched', n: 2 }, { kind: 'pitched', n: 1 },
    { kind: 'nobody', days: 3 }, { kind: 'needs-location', first: true }, { kind: 'short', first: true }, { kind: 'ended', why: 'date' },
  ];
  const en = outcomes.map((out) => orderNote({ need: 'rice', side: 'buy' }, out, 'en')!.lines.join(' '));
  for (const locale of ['fr', 'ar', 'hi', 'sw'] as const) {
    outcomes.forEach((out, i) => {
      const note = orderNote({ need: 'rice', side: 'buy' }, out, locale)!;
      const text = [note.heading, ...note.lines].join(' ');
      assert.notEqual(note.lines.join(' '), en[i], `${locale} ${out.kind} is translated`);
      assert.ok(!/[—–]/.test(text), `${locale} ${out.kind}`);
      assert.ok(!/\{[a-z]+\}/.test(text), `${locale} ${out.kind} has every figure filled in`);
    });
  }
});
