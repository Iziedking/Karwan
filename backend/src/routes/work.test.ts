import assert from 'node:assert/strict';
import test from 'node:test';
import type { Address, Hex } from 'viem';
import { memoryEngagementsStore } from '../db/engagements.js';
import { createEngagements } from '../work/engagements.js';
import { createWorkRoutes } from './work.js';

/// The hourly work routes (view 32): only the hirer and the worker see it.

const HIRER: Address = '0x1111111111111111111111111111111111111111';
const WORKER: Address = '0x2222222222222222222222222222222222222222';
const STRANGER: Address = '0x3333333333333333333333333333333333333333';

function setup() {
  let who: string | null = HIRER;
  const core = createEngagements({
    store: memoryEngagementsStore(),
    asset: '0x3600000000000000000000000000000000000000',
    chain: {
      offer: async () => ({ id: `0x${'e'.repeat(64)}` as Hex, txHash: '0x01' }),
      accept: async () => '0x02',
      cancel: async () => ({ txHash: '0x03', back: 0n }),
      fund: async () => '0x04',
      submit: async () => '0x05',
      approve: async () => ({ txHash: '0x06', paid: 0n }),
      object: async () => ({ txHash: '0x07', paid: 0n }),
      notice: async () => ({ txHash: '0x08', runs: 1 }),
      settle: async () => ({ txHash: '0x09', gross: 0n, back: 0n, paidNow: 0n }),
      fallback: async () => ({ txHash: '0x0a', gross: 0n, back: 0n, paidNow: 0n }),
      close: async () => ({ txHash: '0x0b', refunded: 0n }),
      escalate: async () => '0x0c',
    },
    openingConfig: async () => ({ open: true, feeBps: 100, perDealCap: 1_005_000_000n }),
    resolveWorker: async (raw) => (raw === '@ada' ? WORKER : null),
    buyerAgentFor: async (u) => (u === HIRER ? { walletId: 'hb', address: '0x1111111111111111111111111111111111110001' } : null),
    sellerAgentFor: async (u) => (u === WORKER ? { walletId: 'ws', address: '0x2222222222222222222222222222222222220002' } : null),
    identityOf: async () => 0n,
    balanceOf: async () => 10_000_000_000n,
    guard: async () => ({ ok: true }),
    tellPerson: () => {},
    emit: () => {},
    now: () => Date.UTC(2026, 10, 2),
    newId: () => 'w_1',
    newSalt: () => `0x${'5'.repeat(64)}`,
  });
  const app = createWorkRoutes({ core, session: () => (who ? { address: who } : null) });
  const call = (method: string, path: string, body?: unknown) =>
    app.request(path, { method, headers: { 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { call, as: (a: string | null) => { who = a; } };
}

const terms = { worker: '@ada', kind: 'hourly', rateUsdc: '15', maxHours: 20, periods: 2, title: 'Virtual assistant', brief: 'Inbox' };

test('the draft returns the card, with no wallet ids or terms', async () => {
  const { call } = setup();
  const r = await call('POST', '/draft', terms);
  assert.equal(r.status, 200);
  const body = (await r.json()) as { card: Record<string, unknown> };
  assert.equal(body.card.totalMicros, '301500000');
  assert.equal(JSON.stringify(body).includes('walletId'), false);
});

test('a stranger gets the same answer as for work that does not exist', async () => {
  const { call, as } = setup();
  assert.equal((await call('POST', '/', terms)).status, 200);
  as(STRANGER);
  assert.equal((await call('GET', '/w_1')).status, 404);
  assert.equal((await call('POST', '/w_1/accept')).status, 404);
  assert.equal((await call('GET', '/nope')).status, 404);
  as(WORKER);
  const v = (await (await call('GET', '/w_1')).json()) as { work: { role: string; canAccept: boolean } };
  assert.equal(v.work.role, 'worker');
  assert.equal(v.work.canAccept, true);
  assert.equal((await call('POST', '/w_1/accept')).status, 200);
  as(null);
  assert.equal((await call('GET', '/mine')).status, 401);
});

test('a refusal is a worded 409 or 400, never a crash', async () => {
  const { call } = setup();
  const bad = await call('POST', '/draft', { ...terms, maxHours: 0 });
  assert.equal(bad.status, 400);
  assert.match(((await bad.json()) as { error: string }).error, /most hours a week/);
  assert.equal((await call('POST', '/w_x/hours', { minutes: 'ten' })).status, 400);
});
