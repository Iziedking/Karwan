import assert from 'node:assert/strict';
import test from 'node:test';
import { DEAL_STATE, type DealV3View } from '../chain/dealEscrowV3.js';
import { attestationFor, decideRuling, rulingRecord, disputeStep, splitMicros } from './arbiterV3.js';

type Hex = `0x${string}`;
const DAY = 86_400;
const NOW = 1_800_000_000;

function view(over: Partial<DealV3View> = {}): DealV3View {
  const z = `0x${'00'.repeat(20)}` as Hex;
  return {
    state: DEAL_STATE.Disputed, buyer: z, seller: z, buyerId: z, sellerId: z, count: 2, paid: 0, extUsed: 0,
    revision: 1, checkPassed: false, lateMark: false, escalated: false, proposal: false, senior: false,
    deliveredAt: 0n, reviewStartAt: 0n, reviewEnd: 0n, deadline: BigInt(NOW - 10 * DAY), disputedAt: BigInt(NOW - DAY),
    proposedAt: 0n, proposedBps: 0, sellerNet: 0n, feeTotal: 0n, released: 0n, feeReleased: 0n, reserved: 0n,
    termsHash: `0x${'00'.repeat(32)}`, ...over,
  };
}

const base = { reclaimGraceSecs: DAY, nowSecs: NOW, disputedBy: 'buyer' as const, checkFailedRevision: undefined };

// ------------------------------ rule table ------------------------------

test('R1: nothing delivered and the deadline and grace passed: all to the buyer', () => {
  const r = decideRuling({ ...base, view: view() });
  assert.deepEqual([r.kind, r.kind === 'propose' ? r.sellerBps : null, r.ruleId], ['propose', 0, 'R1-no-delivery']);
});

test('nothing delivered but still inside the grace window: wait, never guess', () => {
  const r = decideRuling({ ...base, view: view({ deadline: BigInt(NOW - DAY / 2) }) });
  assert.equal(r.kind, 'wait');
});

test('nothing delivered on an open-ended deal: people decide', () => {
  assert.equal(decideRuling({ ...base, view: view({ deadline: 0n }) }).kind, 'escalate');
});

test('R2: delivered on time, check passed, buyer disputed: all to the seller', () => {
  const r = decideRuling({ ...base, view: view({ deliveredAt: BigInt(NOW - 3 * DAY), checkPassed: true }) });
  assert.deepEqual([r.kind, r.kind === 'propose' ? r.sellerBps : null, r.ruleId], ['propose', 10_000, 'R2-checked-delivery']);
});

test('R2 does not apply to a late delivery, or when the seller disputed', () => {
  const late = decideRuling({ ...base, view: view({ deliveredAt: 1n, checkPassed: true, lateMark: true }) });
  assert.equal(late.kind, 'escalate');
  const bySeller = decideRuling({ ...base, disputedBy: 'seller', view: view({ deliveredAt: 1n, checkPassed: true }) });
  assert.equal(bySeller.kind, 'escalate');
});

test('R3: the check failed on this exact delivery: all to the buyer', () => {
  const r = decideRuling({ ...base, checkFailedRevision: 2, view: view({ deliveredAt: 1n, revision: 2 }) });
  assert.deepEqual([r.kind, r.kind === 'propose' ? r.sellerBps : null, r.ruleId], ['propose', 0, 'R3-check-failed']);
});

test('a failed check on an earlier delivery does not count against a new one', () => {
  const r = decideRuling({ ...base, checkFailedRevision: 1, view: view({ deliveredAt: 1n, revision: 2 }) });
  assert.equal(r.kind, 'escalate');
});

test('delivered with no check result: people decide, never a partial split', () => {
  const r = decideRuling({ ...base, view: view({ deliveredAt: 1n }) });
  assert.equal(r.kind, 'escalate');
});

test('every proposal is all or nothing', () => {
  for (const v of [view(), view({ deliveredAt: 1n, checkPassed: true })]) {
    const r = decideRuling({ ...base, view: v });
    if (r.kind === 'propose') assert.ok(r.sellerBps === 0 || r.sellerBps === 10_000);
  }
});

test('the ruling record hash is stable and changes with any input', () => {
  const r = decideRuling({ ...base, view: view() });
  const a = rulingRecord(r, { ...base, view: view() }, 'deal-1');
  const b = rulingRecord(r, { ...base, view: view() }, 'deal-1');
  const c = rulingRecord(r, { ...base, view: view({ revision: 9 }) }, 'deal-1');
  assert.equal(a.rulingHash, b.rulingHash);
  assert.notEqual(a.rulingHash, c.rulingHash);
  assert.match(a.rulingHash, /^0x[0-9a-f]{64}$/);
});

// ------------------------------ dispute steps ------------------------------

const clocks = { coolOffSecs: 3_600, appealWindowSecs: 3 * DAY, disputeTimeoutSecs: 14 * DAY };

test('after the cool-off, an open dispute gets a decision', () => {
  assert.equal(disputeStep(view({ disputedAt: BigInt(NOW - 60) }), NOW, clocks), 'cooling-off');
  assert.equal(disputeStep(view(), NOW, clocks), 'decide');
});

test('a proposal is executed only after the appeal window', () => {
  const proposed = view({ proposal: true, proposedAt: BigInt(NOW - 3 * DAY + 1) });
  assert.equal(disputeStep(proposed, NOW, clocks), 'appeal-open');
  assert.equal(disputeStep(view({ proposal: true, proposedAt: BigInt(NOW - 3 * DAY) }), NOW, clocks), 'execute');
});

test('an escalated dispute waits for admin review until the timeout, then lapses', () => {
  assert.equal(disputeStep(view({ escalated: true }), NOW, clocks), 'with-review');
  assert.equal(disputeStep(view({ escalated: true, disputedAt: BigInt(NOW - 14 * DAY) }), NOW, clocks), 'lapse');
});

test('a dispute past the timeout lapses even with nothing else done', () => {
  assert.equal(disputeStep(view({ disputedAt: BigInt(NOW - 14 * DAY) }), NOW, clocks), 'lapse');
});

// ------------------------------ attestations ------------------------------

const verdict = `0x${'ee'.repeat(32)}` as Hex;

test('a passing receipt for the current delivery attests pass with the verdict commitment', () => {
  const a = attestationFor({ state: 'pass', evidenceRevision: 2, verdictCommitment: verdict }, 2, view({ revision: 2, deliveredAt: 1n, state: DEAL_STATE.Accepted }));
  assert.deepEqual(a, { pass: true, evidenceHash: verdict, revision: 2 });
});

test('a mismatch attests fail', () => {
  const a = attestationFor({ state: 'mismatch', evidenceRevision: 2, verdictCommitment: verdict }, 2, view({ revision: 2, deliveredAt: 1n, state: DEAL_STATE.Accepted }));
  assert.equal(a?.pass, false);
});

test('no attestation when revisions disagree, the result is already on-chain, or the check is not final', () => {
  const v = view({ revision: 2, deliveredAt: 1n, state: DEAL_STATE.Accepted });
  assert.equal(attestationFor({ state: 'pass', evidenceRevision: 1, verdictCommitment: verdict }, 2, v), null);
  assert.equal(attestationFor({ state: 'pass', evidenceRevision: 2, verdictCommitment: verdict }, 3, v), null);
  assert.equal(attestationFor({ state: 'pass', evidenceRevision: 2, verdictCommitment: verdict }, 2, { ...v, checkPassed: true }), null);
  for (const state of ['unavailable', 'expired', 'stale-delivery', 'not-recorded'] as const) {
    assert.equal(attestationFor({ state, evidenceRevision: 2, verdictCommitment: verdict }, 2, v), null, state);
  }
  assert.equal(attestationFor({ state: 'pass', evidenceRevision: 2, verdictCommitment: verdict }, 2, { ...v, state: DEAL_STATE.Disputed }), null);
});

test('split amounts match the escrow: every unpaid micro goes to seller, buyer or fee', () => {
  const v = { sellerNet: 992_500_000n, released: 496_250_000n, feeTotal: 15_000_000n, feeReleased: 7_500_000n };
  for (const bps of [0, 2_500, 10_000]) {
    const s = splitMicros(v, bps);
    assert.equal(s.toSeller + s.toBuyer + s.fee, 496_250_000n + 7_500_000n, String(bps));
  }
  assert.deepEqual(splitMicros(v, 0), { toSeller: 0n, toBuyer: 503_750_000n, fee: 0n });
  assert.equal(splitMicros(v, 10_000).toBuyer, 0n);
});
