import assert from 'node:assert/strict';
import test from 'node:test';
import { decodeFunctionData, type Hex } from 'viem';
import { agreementEscrowAbi } from '../chain/abis/agreementEscrow.js';
import { DEAL_STATE, type DealV3View } from '../chain/dealEscrowV3.js';
import type { EvidenceReceiptView } from '../chain/evidenceReceipt.js';
import type { DirectDeal } from '../db/deals.js';
import type { JudgeProposal } from '../deals/disputeJudge.js';
import { runSuiteCheck, runSuiteDispute, suiteRuleCall, type SuiteWatcherDeps } from './suiteDisputeWatcher.js';

const DAY = 86_400;
const NOW_MS = 1_800_000_000_000;
const NOW = NOW_MS / 1000;
const ID = `0x${'aa'.repeat(32)}` as Hex;
const AGREEMENT = `0x${'55'.repeat(20)}` as Hex;
const REVIEW_SAFE = `0x${'4e'.repeat(20)}` as Hex;

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

function deal(over: Partial<DirectDeal> = {}): DirectDeal {
  return {
    jobId: 'deal-1',
    buyer: '0xbuyer',
    seller: '0xseller',
    escrowVersion: 'suite',
    escrowDealId: ID,
    buyerAgentWalletId: 'buyer-w',
    disputed: true,
    disputedBy: 'buyer',
    delivered: true,
    deliveryRevision: 1,
    escrowTerms: { reclaimGrace: DAY } as DirectDeal['escrowTerms'],
    ...over,
  } as DirectDeal;
}

function setup(v: DealV3View, opts: { escalatedAt?: bigint; after?: Partial<DealV3View>; receipt?: Partial<EvidenceReceiptView>; arbiter?: boolean } = {}) {
  let current = v;
  const sent: Array<{ fn: string; args: unknown[] }> = [];
  const calls: Array<{ name: string; walletId: string }> = [];
  const checks: Array<{ revision: number; pass: boolean }> = [];
  const patches: Array<Partial<DirectDeal>> = [];
  const alerts: string[] = [];
  const events: string[] = [];
  const anyone = (name: string) => async (args: { walletId: string }) => {
    calls.push({ name, walletId: args.walletId });
    current = { ...current, ...(opts.after ?? { state: DEAL_STATE.Split }) };
    return { txHash: '0x02' };
  };
  const deps: SuiteWatcherDeps = {
    escrow: { executeRuling: anyone('executeRuling'), applyFallback: anyone('applyFallback') },
    arbiter:
      opts.arbiter === false
        ? null
        : {
            arbiterSend: async (fn, args) => {
              sent.push({ fn, args });
              return { txHash: '0x01' as Hex };
            },
            submitCheck: async ({ revision, pass }) => {
              checks.push({ revision, pass });
              return { txHash: '0x03' as Hex };
            },
          },
    readView: async () => current,
    readEscalatedAt: async () => opts.escalatedAt ?? 0n,
    readReceipt: async () => ({ agreementVersion: 1, state: 'not-recorded', ...opts.receipt }) as EvidenceReceiptView,
    coolOffSecs: 3_600,
    patchDeal: async (_id, p) => {
      patches.push(p);
    },
    emit: (e) => events.push(e.type),
    alertOperator: async (_d, m) => {
      alerts.push(m);
    },
    warn: () => undefined,
  };
  return { deps, sent, calls, checks, patches, alerts, events };
}

test('proposes_from_the_table_after_the_cooling_off', async () => {
  // Nothing delivered, deadline and grace long past: R1, a full refund.
  const s = setup(view());
  await runSuiteDispute(s.deps, deal({ delivered: false }), NOW_MS);
  assert.equal(s.sent[0]!.fn, 'proposeRuling');
  assert.deepEqual(s.sent[0]!.args.slice(0, 2), [ID, 0]);
  assert.equal(s.patches[0]!.v3Ruling?.ruleId, 'R1-no-delivery');

  const early = setup(view({ disputedAt: BigInt(NOW - 60) }));
  await runSuiteDispute(early.deps, deal({ delivered: false }), NOW_MS);
  assert.deepEqual(early.sent, [], 'still cooling off');
});

test('a_dispute_outside_the_table_is_escalated_by_the_arbiter', async () => {
  const s = setup(view({ deliveredAt: BigInt(NOW - 2 * DAY) }));
  await runSuiteDispute(s.deps, deal(), NOW_MS);
  assert.deepEqual(s.sent.map((x) => x.fn), ['escalate']);
  assert.equal(s.alerts.length, 1);
  assert.ok(s.events.includes('deal.dispute.needs_arbiter'));
});

test('executes_after_the_appeal_window', async () => {
  const open = setup(view({ proposal: true, proposedBps: 0, proposedAt: BigInt(NOW - 71 * 3600) }));
  await runSuiteDispute(open.deps, deal(), NOW_MS);
  assert.deepEqual(open.calls, [], 'the appeal window is still open');

  const s = setup(view({ proposal: true, proposedBps: 0, proposedAt: BigInt(NOW - 73 * 3600) }));
  await runSuiteDispute(s.deps, deal(), NOW_MS);
  assert.deepEqual(s.calls, [{ name: 'executeRuling', walletId: 'buyer-w' }]);
  assert.equal(s.patches[0]!.cancelledAt, NOW_MS, 'a full refund ends the deal for the buyer');
  assert.equal(s.patches[0]!.resolvedSellerBps, 0);
});

test('a_ruling_on_an_earlier_tranche_lets_the_deal_carry_on', async () => {
  const s = setup(view({ proposal: true, proposedBps: 10_000, proposedAt: BigInt(NOW - 4 * DAY) }), { after: { state: DEAL_STATE.Accepted, paid: 1 } });
  await runSuiteDispute(s.deps, deal(), NOW_MS);
  assert.equal(s.patches[0]!.disputed, false);
  assert.equal(s.patches[0]!.settledAt, undefined);
  assert.equal(s.patches[0]!.cancelledAt, undefined);
});

test('leaves_an_escalated_deal_to_the_review_safe', async () => {
  const s = setup(view({ escalated: true }), { escalatedAt: BigInt(NOW - DAY) });
  await runSuiteDispute(s.deps, deal(), NOW_MS);
  assert.deepEqual(s.sent, []);
  assert.deepEqual(s.calls, []);
  assert.equal(s.alerts.length, 1);
  assert.equal(s.patches[0]!.disputeTimeoutAlertedAt, NOW_MS);
});

test('the_terms_fallback_applies_once_the_reviewer_misses_the_ruling_period', async () => {
  const s = setup(view({ escalated: true }), { escalatedAt: BigInt(NOW - 5 * DAY - 1) });
  await runSuiteDispute(s.deps, deal(), NOW_MS);
  assert.deepEqual(s.calls, [{ name: 'applyFallback', walletId: 'buyer-w' }]);
});

test('checked_deal_result_goes_to_submit_check', async () => {
  const s = setup(view({ state: DEAL_STATE.Accepted, deliveredAt: BigInt(NOW - 60) }), {
    receipt: { state: 'pass', evidenceRevision: 1, verdictCommitment: `0x${'ee'.repeat(32)}` },
  });
  await runSuiteCheck(s.deps, deal({ disputed: false }));
  assert.deepEqual(s.checks, [{ revision: 1, pass: true }]);
  assert.equal(s.patches[0]!.v3AttestedRevision, 1);

  const failed = setup(view({ state: DEAL_STATE.Accepted, deliveredAt: BigInt(NOW - 60) }), {
    receipt: { state: 'mismatch', evidenceRevision: 1, verdictCommitment: `0x${'ee'.repeat(32)}` },
  });
  await runSuiteCheck(failed.deps, deal({ disputed: false }));
  assert.equal(failed.patches[0]!.v3CheckFailedRevision, 1);
});

test('admin_gets_the_rule_call_for_the_deals_reviewer', () => {
  const r = suiteRuleCall({ view: view({ escalated: true }), reviewer: REVIEW_SAFE, agreement: AGREEMENT, dealId: ID, sellerBps: 2500, rulingHash: `0x${'dd'.repeat(32)}` });
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.safe, REVIEW_SAFE);
  assert.equal(r.to, AGREEMENT);
  const call = decodeFunctionData({ abi: agreementEscrowAbi, data: r.data });
  assert.equal(call.functionName, 'rule');
  assert.deepEqual(call.args, [ID, 2500, `0x${'dd'.repeat(32)}`]);

  const notYet = suiteRuleCall({ view: view(), reviewer: REVIEW_SAFE, agreement: AGREEMENT, dealId: ID, sellerBps: 2500, rulingHash: `0x${'dd'.repeat(32)}` });
  assert.deepEqual(notYet.ok ? null : notYet.code, 'not-escalated');
});

// View 90, first slice: with the hearing switch on, nothing is proposed until
// both sides are heard and a reviewer has confirmed the finding.

const HASH = `0x${'f1'.repeat(32)}` as Hex;
const statement = { received: 'r', missing: 'm', late: 'no', links: [], submittedAt: 1 };
const both = { buyer: statement, seller: statement };

function finding(over: Partial<JudgeProposal> = {}): JudgeProposal {
  return {
    sellerBps: 10_000, items: [], confidence: 'clear', summary: 'Delivered as agreed.', model: 'test',
    inputsHash: '0xinputs', proposedAt: NOW_MS - 3_600_000, status: 'awaiting-review', ...over,
  };
}

function heard(v: DealV3View, opts: Parameters<typeof setup>[1] & { built?: JudgeProposal } = {}) {
  const s = setup(v, opts);
  const built: DirectDeal[] = [];
  const ready: DirectDeal[] = [];
  const warnings: string[] = [];
  s.deps.warn = (_c, m) => {
    warnings.push(m);
  };
  s.deps.hearing = {
    on: true,
    windowSecs: 3 * DAY,
    deadlineSecs: 4 * DAY + 12 * 3600,
    buildFinding: async (d) => {
      built.push(d);
      return opts.built ?? finding();
    },
    findingReady: async (d) => {
      ready.push(d);
    },
  };
  return { ...s, built, ready, warnings };
}

const delivered = { deliveredAt: BigInt(NOW - 2 * DAY), checkPassed: true };

test('with_the_hearing_on_a_passed_check_one_hour_in_decides_nothing', async () => {
  const s = heard(view({ ...delivered, disputedAt: BigInt(NOW - 3600) }));
  await runSuiteDispute(s.deps, deal({ disputeStatements: { buyer: statement } }), NOW_MS);
  assert.deepEqual(s.sent, [], 'no proposal while the seller has not answered');
  assert.deepEqual(s.built, []);
  assert.deepEqual(s.calls, []);
});

test('once_both_have_answered_a_finding_is_written_for_a_reviewer_and_nothing_is_sent', async () => {
  const s = heard(view({ ...delivered, disputedAt: BigInt(NOW - 3600) }));
  await runSuiteDispute(s.deps, deal({ disputeStatements: both }), NOW_MS);
  assert.equal(s.built.length, 1);
  assert.equal(s.patches[0]!.judgeProposal?.status, 'awaiting-review');
  assert.equal(s.ready.length, 1);
  assert.deepEqual(s.sent, []);
});

test('a_finding_waiting_a_day_for_a_reviewer_alerts_once', async () => {
  const waiting = finding({ proposedAt: NOW_MS - 25 * 3_600_000 });
  const s = heard(view({ ...delivered, disputedAt: BigInt(NOW - 2 * DAY) }));
  await runSuiteDispute(s.deps, deal({ disputeStatements: both, judgeProposal: waiting }), NOW_MS);
  assert.deepEqual(s.sent, []);
  assert.equal(s.alerts.length, 1);
  assert.equal(s.patches[0]!.disputeReviewAlertedAt, NOW_MS);

  const again = heard(view({ ...delivered, disputedAt: BigInt(NOW - 2 * DAY) }));
  await runSuiteDispute(again.deps, deal({ disputeStatements: both, judgeProposal: waiting, disputeReviewAlertedAt: NOW_MS - 60_000 }), NOW_MS);
  assert.equal(again.alerts.length, 0);
});

test('a_confirmed_all_or_nothing_finding_is_proposed_once_with_its_hash', async () => {
  const confirmed = finding({ status: 'confirmed', reviewedSellerBps: 10_000, findingHash: HASH, reviewReason: 'Delivered as agreed.' });
  const s = heard(view({ ...delivered, disputedAt: BigInt(NOW - 2 * DAY) }));
  await runSuiteDispute(s.deps, deal({ disputeStatements: both, judgeProposal: confirmed }), NOW_MS);
  assert.deepEqual(s.sent.map((x) => x.fn), ['proposeRuling']);
  assert.deepEqual(s.sent[0]!.args, [ID, 10_000, HASH]);
  assert.equal(s.patches[0]!.v3Ruling?.rulingHash, HASH);

  const next = heard(view({ ...delivered, proposal: true, proposedBps: 10_000, proposedAt: BigInt(NOW - 60) }));
  await runSuiteDispute(next.deps, deal({ disputeStatements: both, judgeProposal: confirmed }), NOW_MS);
  assert.deepEqual(next.sent, [], 'the proposal on chain is the one already sent');
});

test('a_confirmed_part_share_goes_to_the_review_safe_and_is_never_proposed', async () => {
  const part = finding({ status: 'overridden', reviewedSellerBps: 6_000, findingHash: HASH, reviewReason: 'Two of three files.' });
  const s = heard(view({ ...delivered, disputedAt: BigInt(NOW - 2 * DAY) }));
  await runSuiteDispute(s.deps, deal({ disputeStatements: both, judgeProposal: part }), NOW_MS);
  assert.deepEqual(s.sent.map((x) => x.fn), ['escalate']);
  assert.equal(s.alerts.length, 1);
  assert.ok(s.events.includes('deal.dispute.needs_arbiter'));
});

test('no_confirmation_by_the_deadline_goes_to_the_review_safe_before_day_five', async () => {
  const s = heard(view({ ...delivered, disputedAt: BigInt(NOW - 4 * DAY - 13 * 3600) }));
  await runSuiteDispute(s.deps, deal({ disputeStatements: both, judgeProposal: finding() }), NOW_MS);
  assert.deepEqual(s.sent.map((x) => x.fn), ['escalate']);
  assert.ok(s.patches.some((p) => p.disputeReferredAt === NOW_MS));
});

test('a_held_link_goes_to_people_during_the_hearing', async () => {
  const s = heard(view({ ...delivered, disputedAt: BigInt(NOW - 3600) }));
  await runSuiteDispute(s.deps, deal({ verificationStatus: 'suspicious' } as Partial<DirectDeal>), NOW_MS);
  assert.deepEqual(s.sent.map((x) => x.fn), ['escalate']);
});

test('a_confirmed_finding_without_its_hash_is_never_sent', async () => {
  const s = heard(view({ ...delivered, disputedAt: BigInt(NOW - 2 * DAY) }));
  await runSuiteDispute(s.deps, deal({ disputeStatements: both, judgeProposal: finding({ status: 'confirmed', reviewedSellerBps: 0 }) }), NOW_MS);
  assert.deepEqual(s.sent, []);
  assert.equal(s.warnings.length, 1);
});

test('with_the_hearing_off_the_table_runs_as_before', async () => {
  const s = setup(view({ ...delivered, disputedAt: BigInt(NOW - 2 * 3600) }));
  await runSuiteDispute(s.deps, deal({ disputeStatements: { buyer: statement } }), NOW_MS);
  assert.deepEqual(s.sent.map((x) => x.fn), ['proposeRuling']);
  assert.deepEqual(s.sent[0]!.args.slice(0, 2), [ID, 10_000]);
});
