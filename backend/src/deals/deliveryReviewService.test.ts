import assert from 'node:assert/strict';
import test from 'node:test';
import type { DirectDeal } from '../db/deals.js';
import { applyDeliveryReview, type DeliveryReviewDeps } from './deliveryReviewService.js';

///   npx tsx --test src/deals/deliveryReviewService.test.ts

const REASON = 'Opened in a sandbox: a plain Google Drive folder with the logo files.';

function setup(over: Partial<DirectDeal> = {}) {
  let deal = {
    jobId: '0xabc', buyer: '0xb', seller: '0xs', delivered: true, deliveredAt: 1, deliveryRevision: 1,
    verificationStatus: 'suspicious', verificationReasons: ['new domain'], releaseBlockedReason: 'security-hold', ...over,
  } as DirectDeal;
  const calls: string[] = [];
  const deps: DeliveryReviewDeps = {
    getDeal: async () => deal,
    record: async (_snap, patch) => { deal = { ...deal, ...patch }; calls.push('record'); return deal; },
    recordForRevision: async (_snap, revision, patch) => { deal = { ...deal, ...patch }; calls.push(`recordRevision:${revision}`); return deal; },
    releaseHold: async () => { calls.push('releaseHold'); },
    withdrawOffense: (i) => { calls.push(`withdraw:${i.verdict}`); },
    publishEvidence: async () => { calls.push('publish'); },
    emitCleared: () => { calls.push('cleared'); },
    systemMessage: async (_j, _e, body) => { calls.push(`message:${body.includes('found it safe') ? 'safe' : 'blocked'}`); },
    now: () => 500,
  };
  return { deps, calls, deal: () => deal };
}

test('clearing a link makes the delivery clean, lifts the hold and tells both people', async () => {
  const s = setup();
  const out = await applyDeliveryReview('0xabc', { role: 'support', decision: 'safe', reason: REASON }, s.deps);
  assert.ok(out.ok);
  const d = s.deal();
  assert.equal(d.verificationStatus, 'clean');
  assert.deepEqual(d.verificationReasons, []);
  assert.equal(d.releaseBlockedReason, undefined);
  assert.equal(d.deliveredAt, 500);
  assert.equal(d.deliveryReview?.decision, 'safe');
  assert.deepEqual(s.calls, ['record', 'withdraw:suspicious', 'releaseHold', 'publish', 'cleared', 'message:safe']);
});

test('clearing a link also marks that delivery clean in the history, so its photos reach the buyer', async () => {
  const s = setup({
    deliveryRevision: 2,
    deliveryHistory: [
      { revision: 1, submittedAt: 1, deliveryProof: 'first.xyz', verificationStatus: 'suspicious' },
      { revision: 2, submittedAt: 2, deliveryProof: 'second.xyz', verificationStatus: 'suspicious', photos: 1 },
    ],
  } as Partial<DirectDeal>);
  await applyDeliveryReview('0xabc', { role: 'support', decision: 'safe', reason: REASON }, s.deps);
  const history = s.deal().deliveryHistory ?? [];
  assert.equal(history[0]?.verificationStatus, 'suspicious');
  assert.equal(history[1]?.verificationStatus, 'clean');
});

test('keeping it blocked changes nothing but the record and tells the seller', async () => {
  const s = setup();
  const out = await applyDeliveryReview('0xabc', { role: 'admin', decision: 'unsafe', reason: REASON }, s.deps);
  assert.ok(out.ok);
  assert.equal(s.deal().verificationStatus, 'suspicious');
  assert.equal(s.deal().deliveryReview?.decision, 'unsafe');
  assert.deepEqual(s.calls, ['record', 'message:blocked']);
});

test('a malicious link waiting for the second credential changes nothing a person sees', async () => {
  const s = setup({ verificationStatus: 'malicious' });
  await applyDeliveryReview('0xabc', { role: 'support', decision: 'safe', reason: REASON }, s.deps);
  assert.equal(s.deal().verificationStatus, 'malicious');
  assert.equal(s.deal().deliveryReview?.decision, 'pending-approval');
  assert.deepEqual(s.calls, ['record']);
});

test('clearing a replaced delivery corrects the record and the offence, and touches nothing for the money', async () => {
  const s = setup({
    deliveryRevision: 3, verificationStatus: 'clean', verificationReasons: [], releaseBlockedReason: undefined, deliveredAt: 3, settledAt: 9,
    deliveryHistory: [
      { revision: 1, submittedAt: 1, deliveryProof: 'www.arcrun.xyz', verificationStatus: 'suspicious' },
      { revision: 2, submittedAt: 2, deliveryProof: 'arcrun.xyz', verificationStatus: 'suspicious' },
      { revision: 3, submittedAt: 3, deliveryProof: 'outlier.ai/x', verificationStatus: 'clean' },
    ],
  } as Partial<DirectDeal>);
  const out = await applyDeliveryReview('0xabc', { role: 'support', decision: 'safe', reason: REASON, revision: 2 }, s.deps);
  assert.ok(out.ok && out.scope === 'record-only' && out.clears);
  const d = s.deal();
  assert.equal(d.deliveryHistory?.[1]?.verificationStatus, 'clean');
  assert.equal(d.deliveryHistory?.[0]?.verificationStatus, 'suspicious', 'revision 1 is not touched');
  assert.equal(d.verificationStatus, 'clean');
  assert.equal(d.deliveredAt, 3, 'the review window is not restarted');
  assert.equal(d.settledAt, 9);
  assert.equal(d.deliveryReview, undefined, 'the current delivery has no review');
  assert.equal(d.deliveryReviews?.[0]?.deliveryRevision, 2);
  assert.deepEqual(s.calls, ['recordRevision:2', 'withdraw:suspicious', 'message:safe']);
});

test('keeping a replaced delivery blocked records the decision and nothing else', async () => {
  const s = setup({
    deliveryRevision: 2, verificationStatus: 'clean', releaseBlockedReason: undefined,
    deliveryHistory: [{ revision: 1, submittedAt: 1, deliveryProof: 'x.xyz', verificationStatus: 'suspicious' }],
  } as Partial<DirectDeal>);
  const out = await applyDeliveryReview('0xabc', { role: 'admin', decision: 'unsafe', reason: REASON, revision: 1 }, s.deps);
  assert.ok(out.ok && out.scope === 'record-only' && !out.clears);
  assert.equal(s.deal().deliveryHistory?.[0]?.verificationStatus, 'suspicious');
  assert.deepEqual(s.calls, ['recordRevision:1']);
});

test('a current review is also kept in the per-revision list', async () => {
  const s = setup();
  await applyDeliveryReview('0xabc', { role: 'support', decision: 'safe', reason: REASON }, s.deps);
  assert.equal(s.deal().deliveryReviews?.length, 1);
  assert.equal(s.deal().deliveryReviews?.[0]?.scope, 'current');
});

test('a delivery that changed underneath is not touched', async () => {
  const s = setup();
  s.deps.record = async () => null;
  const out = await applyDeliveryReview('0xabc', { role: 'support', decision: 'safe', reason: REASON }, s.deps);
  assert.ok(!out.ok && out.code === 'changed');
});
