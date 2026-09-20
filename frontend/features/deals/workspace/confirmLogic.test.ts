import assert from 'node:assert/strict';
import test from 'node:test';
import type { DirectDeal } from '../../../core/api.js';
import { classifyConfirmError, dealMovedSinceSnapshot, snapshotDeal } from './confirmLogic.js';

const baseDeal: DirectDeal = {
  jobId: 'job-1',
  buyer: '0xBuyer',
  seller: '0xSeller',
  dealAmountUsdc: '600',
  firstReleasePct: 50,
  terms: 'Ship the goods.',
  delivered: false,
  onChain: null,
  createdAt: 0,
  updatedAt: 0,
  agreementVersion: 1,
  agreementDigest: '0xdigest',
  view: {
    stage: 'awaiting-first-release',
    money: { line: 'held' },
    progress: [],
    next: { action: 'release', actor: 'you', amountUsdc: '600' },
    automatic: null,
  },
};

test('a snapshot mirrors exactly what the sheet needs to compare later', () => {
  assert.deepEqual(snapshotDeal(baseDeal), {
    agreementVersion: 1,
    agreementDigest: '0xdigest',
    nextAction: 'release',
    milestonesReleased: null,
  });
});

test('an unchanged deal never blocks its own confirm', () => {
  const snapshot = snapshotDeal(baseDeal);
  assert.equal(dealMovedSinceSnapshot(snapshot, baseDeal), false);
});

test('a milestone claimed elsewhere blocks the stale confirm', () => {
  const snapshot = snapshotDeal(baseDeal);
  const moved: DirectDeal = { ...baseDeal, onChain: { ...baseDeal.onChain!, milestonesReleased: 1 } as DirectDeal['onChain'] };
  assert.equal(dealMovedSinceSnapshot(snapshot, moved), true);
});

test('the deal moving to a different next action blocks the stale confirm', () => {
  const snapshot = snapshotDeal(baseDeal);
  const moved: DirectDeal = { ...baseDeal, view: { ...baseDeal.view!, next: { action: 'claim', actor: 'you', amountUsdc: '600' } } };
  assert.equal(dealMovedSinceSnapshot(snapshot, moved), true);
});

test('an edited agreement digest blocks the stale confirm', () => {
  const snapshot = snapshotDeal(baseDeal);
  const moved: DirectDeal = { ...baseDeal, agreementDigest: '0xnew' };
  assert.equal(dealMovedSinceSnapshot(snapshot, moved), true);
});

test('AGREEMENT_CHANGED and QUOTE_CHANGED map to their own copy', () => {
  assert.equal(classifyConfirmError({ code: 'AGREEMENT_CHANGED' }), 'agreement-changed');
  assert.equal(classifyConfirmError({ code: 'QUOTE_CHANGED' }), 'quote-changed');
});

test('a shortfall in balance or stake reads as insufficient-balance', () => {
  assert.equal(classifyConfirmError({ code: 'INSUFFICIENT_AGENT_BALANCE' }), 'insufficient-balance');
  assert.equal(classifyConfirmError({ code: 'INSUFFICIENT_STAKE' }), 'insufficient-balance');
});

test('a dropped connection or a server crash never reads as failed', () => {
  assert.equal(classifyConfirmError({ status: 0 }), 'silent');
  assert.equal(classifyConfirmError({ status: 500 }), 'silent');
  assert.equal(classifyConfirmError({ status: 503 }), 'silent');
});

test('a written 4xx response is shown as the server wrote it', () => {
  assert.equal(classifyConfirmError({ status: 400 }), 'message');
  assert.equal(classifyConfirmError({ status: 409 }), 'message');
  assert.equal(classifyConfirmError({}), 'message');
});
