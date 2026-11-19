import assert from 'node:assert/strict';
import test from 'node:test';
import type { DirectDeal } from '../db/deals.js';
import { buildFinding, runDisputeJudge } from './disputeJudgeRunner.js';

const H = 3_600_000;
const st = { received: 'r', missing: 'm', late: 'no', links: [], submittedAt: 1 };
const base = {
  jobId: '0xjob', buyer: '0xb', seller: '0xs', terms: 'A logo', disputed: true, disputedAt: 0,
  deliveryProof: 'https://drive.example/logo', deliveryMatch: { verdict: 'partial', reason: 'source missing', evaluatedAt: 1 },
} as unknown as DirectDeal;

function deps(over: Partial<Parameters<typeof runDisputeJudge>[2]> = {}) {
  const calls = { patched: [] as unknown[], posted: [] as string[], asked: 0, notified: 0 };
  return {
    calls,
    deps: {
      listMessages: async () => [
        { sender: '0xs', kind: 'participant', body: 'Source comes tomorrow', ts: 5 },
        { sender: '0xb', kind: 'participant', body: 'Still waiting', ts: 6 },
        { sender: '0x0', kind: 'system', body: 'x', ts: 7 },
      ],
      generate: async () => { calls.asked++; return { object: { sellerBps: 5000, confidence: 'clear', summary: 'Half done.', items: [{ item: 'Logo', finding: 'delivered', evidence: 'link' }, { item: 'Source', finding: 'missing', evidence: 'check' }] }, model: 'm' }; },
      patchDeal: async (_: string, patch: unknown) => { calls.patched.push(patch); },
      postSystem: async (eventType: string) => { calls.posted.push(eventType); },
      notifyReviewer: () => { calls.notified++; },
      ...over,
    },
  };
}

test('with both statements in, the judge proposes and a reviewer is told', async () => {
  const { calls, deps: d } = deps();
  const deal = { ...base, disputeStatements: { buyer: st, seller: st } } as DirectDeal;
  assert.equal(await runDisputeJudge(deal, H, d, { windowMs: 48 * H }), 'proposed');
  assert.equal(calls.asked, 1);
  const patch = calls.patched[0] as { judgeProposal: { sellerBps: number; status: string } };
  assert.equal(patch.judgeProposal.sellerBps, 5000);
  assert.equal(patch.judgeProposal.status, 'awaiting-review');
  assert.deepEqual(calls.posted, ['deal.dispute.proposed']);
  assert.equal(calls.notified, 1);
});

test('with no model answering, the dispute still reaches a reviewer, marked judge unavailable', async () => {
  const { calls, deps: d } = deps({ generate: async () => { throw new Error('every provider failed'); } });
  const deal = { ...base, disputeStatements: { buyer: st, seller: st } } as DirectDeal;
  assert.equal(await runDisputeJudge(deal, H, d, { windowMs: 48 * H }), 'proposed');
  const patch = calls.patched[0] as { judgeProposal: { rule?: string; confidence: string; status: string } };
  assert.equal(patch.judgeProposal.rule, 'judge-unavailable');
  assert.equal(patch.judgeProposal.confidence, 'inconclusive');
  assert.equal(patch.judgeProposal.status, 'awaiting-review');
  assert.equal(calls.notified, 1);
});

test('a silent seller gets the rule, without asking the model', async () => {
  const { calls, deps: d } = deps();
  const deal = { ...base, disputeStatements: { buyer: st } } as DirectDeal;
  assert.equal(await runDisputeJudge(deal, 49 * H, d, { windowMs: 48 * H }), 'proposed');
  assert.equal(calls.asked, 0);
  assert.equal((calls.patched[0] as { judgeProposal: { rule: string } }).judgeProposal.rule, 'silent-seller');
});

test('nothing happens while the window is open with one statement, or once a proposal exists', async () => {
  const { calls, deps: d } = deps();
  assert.equal(await runDisputeJudge({ ...base, disputeStatements: { buyer: st } } as DirectDeal, H, d, { windowMs: 48 * H }), 'none');
  assert.equal(await runDisputeJudge({ ...base, judgeProposal: { status: 'awaiting-review' } } as unknown as DirectDeal, 49 * H, d, { windowMs: 48 * H }), 'none');
  assert.equal(calls.patched.length, 0);
});

// View 90: the finding on an escrow family deal, built the same way, stored by
// the suite watcher for a reviewer.

test('a finding on both answers comes from the judge, with the check as one input among many', async () => {
  const { deps: d, calls } = deps();
  const f = await buildFinding({ ...base, disputeStatements: { buyer: st, seller: st } } as DirectDeal, 10 * H, d, { judgeOff: false });
  assert.equal(calls.asked, 1);
  assert.equal(f.sellerBps, 5000);
  assert.equal(f.status, 'awaiting-review');
});

test('a silent side is decided by the rule, without asking the model', async () => {
  const { deps: d, calls } = deps();
  const f = await buildFinding({ ...base, disputeStatements: { buyer: st } } as DirectDeal, 80 * H, d, { judgeOff: false });
  assert.equal(calls.asked, 0);
  assert.equal(f.rule, 'silent-seller');
  assert.equal(f.sellerBps, 0);
});

test('with the judge switched off, the finding waits for a person and names no share', async () => {
  const { deps: d, calls } = deps();
  const f = await buildFinding({ ...base, disputeStatements: { buyer: st, seller: st } } as DirectDeal, 10 * H, d, { judgeOff: true });
  assert.equal(calls.asked, 0);
  assert.equal(f.rule, 'judge-unavailable');
  assert.equal(f.confidence, 'inconclusive');
});
