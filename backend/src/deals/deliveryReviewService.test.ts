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

test('a delivery that changed underneath is not touched', async () => {
  const s = setup();
  s.deps.record = async () => null;
  const out = await applyDeliveryReview('0xabc', { role: 'support', decision: 'safe', reason: REASON }, s.deps);
  assert.ok(!out.ok && out.code === 'changed');
});
