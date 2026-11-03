import assert from 'node:assert/strict';
import test from 'node:test';
import { researchRefundPlan } from './researchRefund.js';

/// The research credit is gone (view 48, decision 2); what people prepaid goes
/// back to the buying agent it came from, or to their own wallet without one.

const A = '0x00000000000000000000000000000000000000a1';
const AGENT_A = '0x00000000000000000000000000000000000000a2';
const B = '0x00000000000000000000000000000000000000b1';

test('only credit left is returned, in USDC micros, to the buying agent', () => {
  const plan = researchRefundPlan(
    [
      { address: A, research: { active: true, creditUsdc: 1.234567, activatedAt: 1 } },
      { address: B, research: { active: false, creditUsdc: 0, activatedAt: 1 } },
      { address: '0x00000000000000000000000000000000000000c1' },
    ],
    new Map([[A, AGENT_A]]),
  );
  assert.deepEqual(plan.rows, [{ owner: A, to: AGENT_A, toAgent: true, amountMicros: 1_234_567n }]);
  assert.equal(plan.totalMicros, 1_234_567n);
});

test('without a buying agent the credit goes back to the person, and dust under a micro is dropped', () => {
  const plan = researchRefundPlan([
    { address: B, research: { active: true, creditUsdc: 0.5, activatedAt: 1 } },
    { address: A, research: { active: true, creditUsdc: 0.0000004, activatedAt: 1 } },
  ], new Map());
  assert.deepEqual(plan.rows, [{ owner: B, to: B, toAgent: false, amountMicros: 500_000n }]);
});

test('a refund already sent is never planned again', () => {
  const plan = researchRefundPlan([{ address: A, research: { active: true, creditUsdc: 2, activatedAt: 1, refundTx: '0xsent' } }], new Map([[A, AGENT_A]]));
  assert.equal(plan.rows.length, 0);
});
