import assert from 'node:assert/strict';
import test from 'node:test';
import type { DirectDeal } from '../db/deals.js';
import { liftWorkMismatch, workMismatchOpen } from './workMismatch.js';
import { applyWorkMismatchLift, type WorkMismatchDeps } from './workMismatchService.js';
import { releaseBlockReasonForDelivery } from './releaseBlock.js';
import { deliveryCheckState } from './deliveryCheckState.js';

/// The work check read a delivery as not matching the request, and nothing but
/// a new delivery could move the deal (testnet 0x9de5…, 7 Nov 2026). The buyer
/// may accept it after their own review, and a person at Karwan may clear it.

const NOW = 1_800_000_000_000;
const ORIGINAL = 'The link appears to be a Skilljar platform login/account page rather than actual teaching content about programming.';

function deal(over: Partial<DirectDeal> = {}): DirectDeal {
  return {
    jobId: '0x9de5',
    buyer: '0xb',
    seller: '0xs',
    delivered: true,
    deliveredAt: NOW - 86_400_000,
    deliveryRevision: 2,
    deliveryProof: 'https://anthropic.skilljar.com/',
    terms: 'Teach me how to program',
    verificationStatus: 'clean',
    deliveryMatch: { verdict: 'mismatch', reason: ORIGINAL },
    deliveryHistory: [
      { revision: 1, submittedAt: 1, deliveryProof: 'https://t.mercor.com/x', verificationStatus: 'clean', deliveryMatch: { verdict: 'aligned', reason: 'ok' } },
      { revision: 2, submittedAt: 2, deliveryProof: 'https://anthropic.skilljar.com/', verificationStatus: 'clean', deliveryMatch: { verdict: 'mismatch', reason: ORIGINAL } },
    ],
    ...over,
  } as DirectDeal;
}

test('a mismatch on the current delivery of an open deal can be lifted; nothing else can', () => {
  assert.equal(workMismatchOpen(deal()), true);
  assert.equal(workMismatchOpen(deal({ deliveryMatch: { verdict: 'partial', reason: 'x' } })), false, 'partial never pauses');
  assert.equal(workMismatchOpen(deal({ settledAt: NOW })), false);
  assert.equal(workMismatchOpen(deal({ cancelledAt: NOW })), false);
  assert.equal(workMismatchOpen(deal({ delivered: false })), false);
  assert.equal(workMismatchOpen(deal({ verificationStatus: 'suspicious' })), false, 'a held link is reviewed on its own path');
});

test('the buyer accepts after their own review: the work reads as matching for that delivery only', () => {
  const r = liftWorkMismatch(deal(), { by: 'buyer' }, NOW);
  assert.ok(r.ok);
  assert.equal(r.patch.deliveryMatch?.verdict, 'aligned');
  assert.deepEqual(r.patch.workCheckOverride, { deliveryRevision: 2, by: 'buyer', at: NOW, originalReason: ORIGINAL });
  assert.equal(r.patch.deliveryHistory?.find((e) => e.revision === 2)?.deliveryMatch?.verdict, 'aligned');
  assert.equal(r.patch.deliveryHistory?.find((e) => e.revision === 1)?.deliveryMatch?.reason, 'ok');
  assert.equal(r.patch.deliveredAt, undefined, 'the buyer has looked, their clock is not reset');
  const after = { ...deal(), ...r.patch };
  assert.equal(releaseBlockReasonForDelivery(after), null);
  assert.equal(deliveryCheckState(after), 'passed');
  assert.equal(workMismatchOpen(after), false);
});

test('a person at Karwan clears it with a reason, and the buyer review window starts then', () => {
  assert.equal(liftWorkMismatch(deal(), { by: 'admin', reason: 'short' }, NOW).ok, false);
  const r = liftWorkMismatch(deal({ releaseBlockedReason: 'requirement-mismatch', releaseBlockedAt: 5, releaseBlockedDetail: 'off-request' }), { by: 'support', reason: 'Opened it: the Claude course catalogue the lessons use.' }, NOW);
  assert.ok(r.ok);
  assert.equal(r.patch.deliveredAt, NOW);
  assert.equal(r.patch.workCheckOverride?.by, 'support');
  assert.equal(r.patch.workCheckOverride?.reason, 'Opened it: the Claude course catalogue the lessons use.');
  assert.ok('releaseBlockedReason' in r.patch && r.patch.releaseBlockedReason === undefined);
  assert.ok('releaseBlockedDetail' in r.patch && r.patch.releaseBlockedDetail === undefined);
});

test('another kind of release pause is left alone', () => {
  const r = liftWorkMismatch(deal({ releaseBlockedReason: 'evidence-unavailable', releaseBlockedAt: 5 }), { by: 'buyer' }, NOW);
  assert.ok(r.ok);
  assert.equal('releaseBlockedReason' in r.patch, false);
});

test('nothing to lift says so', () => {
  const r = liftWorkMismatch(deal({ deliveryMatch: { verdict: 'aligned', reason: 'ok' } }), { by: 'buyer' }, NOW);
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.code, 'not-held');
  const closed = liftWorkMismatch(deal({ settledAt: NOW }), { by: 'admin', reason: 'checked it, it is right' }, NOW);
  if (!closed.ok) assert.equal(closed.code, 'closed');
});

function deps(current: DirectDeal | null, saved: DirectDeal | null = current) {
  const calls: string[] = [];
  const d: WorkMismatchDeps = {
    getDeal: async () => current,
    record: async (_s, patch) => (saved ? { ...saved, ...patch } : null),
    emitLifted: () => { calls.push('event'); },
    systemMessage: async (_j, _t, body) => { calls.push(body); },
    now: () => NOW,
  };
  return { d, calls };
}

test('lifting tells both people in the deal chat, in words that fit who lifted it', async () => {
  const buyer = deps(deal());
  const out = await applyWorkMismatchLift('0x9de5', { by: 'buyer' }, buyer.d);
  assert.ok(out.ok);
  assert.equal(buyer.calls[0], 'event');
  assert.match(buyer.calls[1]!, /buyer checked this delivery and accepted it/i);
  const admin = deps(deal());
  await applyWorkMismatchLift('0x9de5', { by: 'admin', reason: 'Checked it, the course is the work.' }, admin.d);
  assert.match(admin.calls[1]!, /Karwan support checked this delivery/);
  assert.doesNotMatch(admin.calls[1]!, /course is the work/, 'the reviewer note stays private');
});

test('a delivery that changed while saving is not lifted', async () => {
  const { d, calls } = deps(deal(), null);
  const out = await applyWorkMismatchLift('0x9de5', { by: 'buyer' }, d);
  assert.equal(out.ok, false);
  if (!out.ok) assert.equal(out.code, 'changed');
  assert.equal(calls.length, 0);
  const missing = await applyWorkMismatchLift('0x0', { by: 'buyer' }, deps(null).d);
  if (!missing.ok) assert.equal(missing.code, 'not-found');
});

test('the release card says the check found a gap, and its release carries the buyer acceptance on every channel', async () => {
  const { buildReleaseConfirm } = await import('../assistant/actions.js');
  const { ROUTES } = await import('../channels/executor.js');
  const base = { caller: '0xb', jobId: '0x9de5', counterparty: 'ade', milestoneNumber: 2, totalMilestones: 3, amountUsdc: '11.55', remainingUsdc: '11.9', isFinal: false };
  const plain = buildReleaseConfirm(base);
  assert.equal('acceptedAfterReview' in plain.payload, false);
  assert.equal(plain.confirmLabel, 'Release payment');
  const gap = buildReleaseConfirm({ ...base, workGap: true });
  assert.equal(gap.payload.acceptedAfterReview, true);
  assert.ok(gap.fields.some((f) => /gap with your request/.test(f.value)));
  const step = ROUTES.release_milestone!(gap.payload as never, gap as never);
  assert.deepEqual(step.body, { caller: '0xb', acceptedAfterReview: true });
  assert.deepEqual(ROUTES.release_milestone!(plain.payload as never, plain as never).body, { caller: '0xb' });
});
