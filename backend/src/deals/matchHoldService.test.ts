import assert from 'node:assert/strict';
import test from 'node:test';
import type { DirectDeal } from '../db/deals.js';
import { applyMatchHoldClear, type MatchHoldDeps } from './matchHoldService.js';

///   npx tsx --test src/deals/matchHoldService.test.ts

const REASON = 'Checked the earlier deal: the flagged link was the seller own site, cleared on review.';

function setup(over: Partial<DirectDeal> = {}) {
  let deal = {
    jobId: '0xd68f', buyer: '0xb', seller: '0xs', dealAmountUsdc: '104.66', acceptedAt: 1, fundTxHash: '0xf',
    matchRisk: {
      decision: 'hold', flags: ['link-offense'], reason: 'r',
      reasons: [{ text: 'The buyer has prior unsafe-link offenses on record (1).', audience: 'seller' }],
      paidConsulted: false, evaluatedAt: 1,
    },
    ...over,
  } as DirectDeal;
  const calls: string[] = [];
  const deps: MatchHoldDeps = {
    getDeal: async () => deal,
    record: async (_snap, patch) => { deal = { ...deal, ...patch }; calls.push('record'); return deal; },
    emitCleared: (_d, role) => { calls.push(`event:${role}`); },
    systemMessage: async (_j, type, body) => { calls.push(`message:${type}:${body.includes('nothing to act on') ? 'ok' : 'other'}`); },
    now: () => 500,
  };
  return { deps, calls, deal: () => deal };
}

test('clearing a hold records who, when and why, tells both people once and logs the event; the money is untouched', async () => {
  const s = setup();
  const before = JSON.stringify({ accepted: s.deal().acceptedAt, fund: s.deal().fundTxHash, amount: s.deal().dealAmountUsdc });
  const out = await applyMatchHoldClear('0xd68f', { role: 'support', reason: REASON }, s.deps);
  assert.ok(out.ok);
  const risk = s.deal().matchRisk!;
  assert.equal(risk.clearedAt, 500);
  assert.equal(risk.clearedBy, 'support');
  assert.equal(risk.clearReason, REASON);
  assert.deepEqual(s.calls, ['record', 'event:support', 'message:security.match.cleared:ok']);
  assert.equal(JSON.stringify({ accepted: s.deal().acceptedAt, fund: s.deal().fundTxHash, amount: s.deal().dealAmountUsdc }), before);
});

test('a refused clear saves nothing and tells nobody', async () => {
  const s = setup({ settledAt: 2 });
  const out = await applyMatchHoldClear('0xd68f', { role: 'admin', reason: REASON }, s.deps);
  assert.ok(!out.ok && out.code === 'closed');
  assert.deepEqual(s.calls, []);
  const short = await applyMatchHoldClear('0xd68f', { role: 'admin', reason: 'ok' }, setup().deps);
  assert.ok(!short.ok && short.code === 'reason-required');
});

test('a hold that changed underneath is not touched, and a missing deal says so', async () => {
  const s = setup();
  s.deps.record = async () => null;
  const out = await applyMatchHoldClear('0xd68f', { role: 'support', reason: REASON }, s.deps);
  assert.ok(!out.ok && out.code === 'changed');
  s.deps.getDeal = async () => null;
  const none = await applyMatchHoldClear('0xd68f', { role: 'support', reason: REASON }, s.deps);
  assert.ok(!none.ok && none.code === 'not-found');
});
