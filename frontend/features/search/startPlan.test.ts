import assert from 'node:assert/strict';
import test from 'node:test';
import { startPlan } from './startPlan';

const base = { kind: 'request' as const, activated: true, hasRoleProfile: true, topUpNeededUsdc: 0, balance: 500, pool: 0 };

test('a funded, set-up buyer just posts', () => {
  assert.deepEqual(startPlan(base), { kind: 'ready', steps: ['post'], moveUsdc: null, source: null });
});

test('first time: set up, then move, then post, in that order', () => {
  assert.deepEqual(startPlan({ ...base, activated: false, topUpNeededUsdc: 122 }), {
    kind: 'ready', steps: ['setup', 'move', 'post'], moveUsdc: 122, source: 'balance',
  });
});

test('the move comes from the pool only when the balance cannot cover it', () => {
  const plan = startPlan({ ...base, topUpNeededUsdc: 122, balance: 10, pool: 200 });
  assert.equal(plan.kind === 'ready' && plan.source, 'pool');
});

test('not enough anywhere says exactly how much to add first', () => {
  assert.deepEqual(startPlan({ ...base, topUpNeededUsdc: 122, balance: 100, pool: 20 }), { kind: 'needsMoney', shortfall: 22 });
});

test('a missing role profile is sent to finish it, never invented', () => {
  assert.deepEqual(startPlan({ ...base, hasRoleProfile: false }), { kind: 'needsProfile' });
});

test('an offer never moves money', () => {
  assert.deepEqual(startPlan({ ...base, kind: 'offer', activated: false, topUpNeededUsdc: null, balance: 0 }), {
    kind: 'ready', steps: ['setup', 'post'], moveUsdc: null, source: null,
  });
});

test('unknown facts wait instead of guessing', () => {
  assert.deepEqual(startPlan({ ...base, activated: null }), { kind: 'loading' });
  assert.deepEqual(startPlan({ ...base, topUpNeededUsdc: null }), { kind: 'loading' });
  assert.deepEqual(startPlan({ ...base, topUpNeededUsdc: 5, balance: null }), { kind: 'loading' });
});
