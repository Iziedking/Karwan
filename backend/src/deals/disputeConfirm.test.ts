import assert from 'node:assert/strict';
import test from 'node:test';
import { keccak256, toBytes } from 'viem';
import type { DirectDeal } from '../db/deals.js';
import { confirmFinding, panelRuling } from './disputeConfirm.js';
import { findingHash } from './disputeCase.js';
import type { JudgeProposal } from './disputeJudge.js';

const H = 3_600_000;
const WINDOW = 72 * H;
const NOW = 1_800_000_000_000;
const st = { received: 'r', missing: 'm', late: 'no', links: [], submittedAt: 1 };

function finding(over: Partial<JudgeProposal> = {}): JudgeProposal {
  return {
    sellerBps: 10_000, items: [{ item: 'Logo', finding: 'delivered', evidence: 'link' }], confidence: 'clear',
    summary: 'Delivered.', model: 'm', inputsHash: '0xinputs', proposedAt: NOW - H, status: 'awaiting-review', ...over,
  };
}

function deal(over: Partial<DirectDeal> = {}): DirectDeal {
  return {
    jobId: '0xjob', buyer: '0xb', seller: '0xs', escrowVersion: 'suite', disputed: true, disputedAt: NOW - 2 * H,
    disputeStatements: { buyer: st, seller: st }, judgeProposal: finding(), ...over,
  } as DirectDeal;
}

const confirm = (d: DirectDeal, sellerBps = 10_000, reason = 'Delivered as agreed.') =>
  confirmFinding(d, { sellerBps, reason }, 'reviewer@karwan.site', NOW, { windowMs: WINDOW });

test('a reviewer confirms the finding: the share, the reason, who, when and the hash are kept', () => {
  const r = confirm(deal());
  assert.equal(r.ok, true);
  if (!r.ok) return;
  const p = r.proposal;
  assert.equal(p.status, 'confirmed');
  assert.equal(p.reviewedSellerBps, 10_000);
  assert.equal(p.reviewReason, 'Delivered as agreed.');
  assert.equal(p.reviewedBy, 'reviewer@karwan.site');
  assert.equal(p.reviewedAt, NOW);
  assert.equal(
    p.findingHash,
    findingHash({ dealKey: '0xjob', inputsHash: '0xinputs', sellerBps: 10_000, items: p.items, reviewer: 'reviewer@karwan.site', reason: 'Delivered as agreed.', confirmedAt: NOW }),
  );
});

test('a reviewer who sets another share overrides the finding', () => {
  const r = confirm(deal(), 6_000, 'Two of three files arrived.');
  assert.equal(r.ok && r.proposal.status, 'overridden');
  assert.equal(r.ok && r.proposal.reviewedSellerBps, 6_000);
  assert.equal(r.ok && r.proposal.sellerBps, 10_000, 'what the judge found stays on record');
});

test('nobody confirms while a side can still answer', () => {
  const r = confirm(deal({ disputeStatements: { buyer: st } }));
  assert.deepEqual(r.ok ? null : r.code, 'HEARING_OPEN');
  const closed = confirm(deal({ disputeStatements: { buyer: st }, disputedAt: NOW - WINDOW - 1 }));
  assert.equal(closed.ok, true, 'the window has closed');
});

test('there must be a finding, on a disputed escrow family deal, not yet confirmed', () => {
  assert.equal(confirm(deal({ judgeProposal: undefined })).ok ? null : 'NO_FINDING', 'NO_FINDING');
  const codeOf = (d: DirectDeal) => {
    const r = confirm(d);
    return r.ok ? 'ok' : r.code;
  };
  assert.equal(codeOf(deal({ judgeProposal: undefined })), 'NO_FINDING');
  assert.equal(codeOf(deal({ escrowVersion: 'v3' })), 'NOT_FAMILY');
  assert.equal(codeOf(deal({ disputed: false })), 'NOT_DISPUTED');
  assert.equal(codeOf(deal({ judgeProposal: finding({ status: 'confirmed', reviewedSellerBps: 0 }) })), 'ALREADY_CONFIRMED');
});

test('a share outside 0 to 10000, or an empty reason, is refused', () => {
  for (const [bps, reason] of [[-1, 'x'], [10_001, 'x'], [1.5, 'x'], [5_000, '   ']] as const) {
    const r = confirmFinding(deal(), { sellerBps: bps, reason }, 'r', NOW, { windowMs: WINDOW });
    assert.equal(r.ok ? 'ok' : r.code, 'BAD_INPUT', `${bps} ${reason}`);
  }
});

test('the panel signs the confirmed finding hash when it rules the confirmed share, its own reason otherwise', () => {
  const r = confirm(deal(), 6_000, 'Two of three files arrived.');
  assert.ok(r.ok);
  const confirmed = deal({ judgeProposal: r.ok ? r.proposal : undefined });
  assert.equal(panelRuling(confirmed, 6_000, 'Agreed with the finding.').rulingHash, r.ok ? r.proposal.findingHash : null);
  assert.equal(panelRuling(confirmed, 3_000, 'On objection, less was delivered.').rulingHash, keccak256(toBytes('On objection, less was delivered.')));
  assert.equal(panelRuling(deal(), 10_000, 'No confirmation.').rulingHash, keccak256(toBytes('No confirmation.')));
});
