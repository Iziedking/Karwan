import assert from 'node:assert/strict';
import test from 'node:test';
import type { JobContext } from '../llm/prompts.js';
import { budgetRange, toSellerSide } from './budgetRange.js';

/// View 73, decision 11 (spec S2, S3): sellers see the budget as a range.

const twoFigures = (n: number) => Number(n.toPrecision(2)) === n;

test('a budget of 300002 naira in usdc shows 70 to 100 percent, rounded', () => {
  const b = 300002 / 1500;
  const r = budgetRange(b)!;
  assert.ok(r.lowUsdc <= 0.7 * b && r.lowUsdc > 0.6 * b);
  assert.ok(r.highUsdc >= b && r.highUsdc < 1.1 * b);
  assert.ok(twoFigures(r.lowUsdc) && twoFigures(r.highUsdc));
  assert.deepEqual(r, { lowUsdc: 140, highUsdc: 210 });
  assert.deepEqual(budgetRange(300002), { lowUsdc: 210000, highUsdc: 310000 });
});

test('a round budget keeps its own top', () => {
  assert.deepEqual(budgetRange(200), { lowUsdc: 140, highUsdc: 200 });
  assert.deepEqual(budgetRange(0.29), { lowUsdc: 0.2, highUsdc: 0.29 });
});

test('no budget, no range', () => {
  assert.equal(budgetRange(0), null);
  assert.equal(budgetRange(-5), null);
  assert.equal(budgetRange(Number.NaN), null);
});

test('a seller side request never has the budget', () => {
  const job = {
    jobId: '7',
    buyer: '0xb',
    budgetUsdc: '222',
    deadlineUnix: 1_900_000_000,
    termsHash: '0x',
    buyerReputationBps: 0,
    keywords: ['tailoring'],
    briefText: 'Two kaftans',
  } satisfies JobContext;
  const side = toSellerSide(job);
  assert.equal('budgetUsdc' in side, false);
  assert.equal(JSON.stringify(side).includes('222'), false);
  assert.deepEqual(side.range, { lowUsdc: 150, highUsdc: 230 });
  assert.deepEqual(side.keywords, ['tailoring']);
  assert.equal(toSellerSide({ ...job, budgetUsdc: '' }).range, null);
});
