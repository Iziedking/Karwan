import assert from 'node:assert/strict';
import test from 'node:test';
import type { DirectDeal } from '../db/deals.js';
import { recordSettlement } from './recordSettlement.js';

///   npx tsx --test src/deals/recordSettlement.test.ts

function setup(settledOnChain: boolean, over: Partial<DirectDeal> = {}) {
  const patches: Array<Partial<DirectDeal>> = [];
  const financed: string[] = [];
  const deal = { jobId: '0xj', ...over } as DirectDeal;
  const deps = {
    finalize: async () => settledOnChain,
    patch: async (_id: string, p: Partial<DirectDeal>) => { patches.push(p); },
    settleFinancing: (id: string) => { financed.push(id); },
  };
  return { deal, deps, patches, financed };
}

test('a claim that settles the escrow records the deal as settled and settles its financing', async () => {
  const s = setup(true);
  assert.equal(await recordSettlement(s.deal, 1000, s.deps), true);
  assert.deepEqual(s.patches, [{ settledAt: 1000, lastReleaseAt: 1000 }]);
  assert.deepEqual(s.financed, ['0xj']);
});

test('an earlier settled date is kept', async () => {
  const s = setup(true, { settledAt: 500 });
  await recordSettlement(s.deal, 1000, s.deps);
  assert.deepEqual(s.patches, [{ settledAt: 500, lastReleaseAt: 1000 }]);
});

test('a part payment only records when it was paid', async () => {
  const s = setup(false);
  assert.equal(await recordSettlement(s.deal, 1000, s.deps), false);
  assert.deepEqual(s.patches, [{ lastReleaseAt: 1000 }]);
  assert.deepEqual(s.financed, []);
});
