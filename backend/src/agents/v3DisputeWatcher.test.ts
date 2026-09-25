import assert from 'node:assert/strict';
import test from 'node:test';
import { DEAL_STATE, type DealEscrowV3, type DealV3View } from '../chain/dealEscrowV3.js';
import type { EvidenceReceiptView } from '../chain/evidenceReceipt.js';
import type { DirectDeal } from '../db/deals.js';
import { runV3Attestation, runV3Dispute, type V3WatcherDeps } from './v3DisputeWatcher.js';

type Hex = `0x${string}`;
const DAY = 86_400;
const NOW_MS = 1_800_000_000_000;
const NOW = NOW_MS / 1000;

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
    escrowVersion: 'v3',
    escrowDealId: `0x${'aa'.repeat(32)}`,
    buyerAgentWalletId: 'buyer-w',
    disputed: true,
    disputedBy: 'buyer',
    escrowTerms: { reclaimGrace: DAY } as DirectDeal['escrowTerms'],
    ...over,
  } as DirectDeal;
}

function setup(v: DealV3View, receipt: Partial<EvidenceReceiptView> = { state: 'not-recorded' }, arbiter = 'arb-w') {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const patches: Array<Partial<DirectDeal>> = [];
  const events: string[] = [];
  const alerts: string[] = [];
  const record = (name: string) => async (args: Record<string, unknown>) => {
    calls.push({ name, args });
    return { txHash: '0x01' };
  };
  const escrow = {
    proposeRuling: record('proposeRuling'),
    escalate: record('escalate'),
    executeRuling: record('executeRuling'),
    lapseDispute: record('lapseDispute'),
    attestCheck: record('attestCheck'),
  } as unknown as DealEscrowV3;
  const deps: V3WatcherDeps = {
    escrow,
    readView: async () => v,
    readReceipt: async () => ({ agreementVersion: 1, ...receipt }) as EvidenceReceiptView,
    clocks: async () => ({ coolOffSecs: 3_600, appealWindowSecs: 3 * DAY, disputeTimeoutSecs: 14 * DAY }),
    arbiterWalletId: arbiter || undefined,
    guardianWalletId: 'guardian-w',
    patchDeal: async (_id, p) => {
      patches.push(p);
    },
    emit: (e) => {
      events.push(e.type);
    },
    alertOperator: async (_d, m) => {
      alerts.push(m);
    },
    warn: () => undefined,
  };
  return { deps, calls, patches, events, alerts };
}

test('R1 case: the arbiter proposes all to the buyer, with the ruling record hash on-chain', async () => {
  const s = setup(view());
  await runV3Dispute(s.deps, deal(), NOW_MS);
  assert.equal(s.calls[0].name, 'proposeRuling');
  assert.equal(s.calls[0].args.sellerBps, 0);
  const record = s.patches[0].v3Ruling!;
  assert.equal(s.calls[0].args.rulingHash, record.rulingHash);
  assert.equal(record.ruleId, 'R1-no-delivery');
});

test('a case outside the table is escalated and the operator is told', async () => {
  const s = setup(view({ deliveredAt: 1n }));
  await runV3Dispute(s.deps, deal(), NOW_MS);
  assert.deepEqual(s.calls.map((c) => c.name), ['escalate']);
  assert.equal(s.alerts.length, 1);
  assert.ok(s.events.includes('deal.dispute.needs_arbiter'));
});

test('without an arbiter wallet nothing is proposed', async () => {
  const s = setup(view(), undefined, '');
  await runV3Dispute(s.deps, deal(), NOW_MS);
  assert.deepEqual(s.calls, []);
});

test('an unappealed proposal is executed after the window and the deal record follows', async () => {
  const s = setup(view({ proposal: true, proposedBps: 10_000, proposedAt: BigInt(NOW - 3 * DAY) }));
  await runV3Dispute(s.deps, deal(), NOW_MS);
  assert.deepEqual(s.calls.map((c) => c.name), ['executeRuling']);
  assert.equal(s.patches[0].settledAt, NOW_MS);
  assert.equal(s.patches[0].resolvedSellerBps, 10_000);
  assert.equal(s.patches[0].disputeLoser, 'buyer');
});

test('a refund ruling marks the deal cancelled, not settled', async () => {
  const s = setup(view({ proposal: true, proposedBps: 0, proposedAt: BigInt(NOW - 3 * DAY) }));
  await runV3Dispute(s.deps, deal(), NOW_MS);
  assert.equal(s.patches[0].cancelledAt, NOW_MS);
  assert.equal(s.patches[0].settledAt, undefined);
});

test('inside the appeal window nothing happens', async () => {
  const s = setup(view({ proposal: true, proposedAt: BigInt(NOW - DAY) }));
  await runV3Dispute(s.deps, deal(), NOW_MS);
  assert.deepEqual(s.calls, []);
  assert.deepEqual(s.patches, []);
});

test('past the timeout the dispute lapses back to the deal', async () => {
  const s = setup(view({ escalated: true, disputedAt: BigInt(NOW - 14 * DAY) }));
  await runV3Dispute(s.deps, deal(), NOW_MS);
  assert.deepEqual(s.calls.map((c) => c.name), ['lapseDispute']);
  assert.equal(s.patches[0].disputed, false);
  assert.ok(s.events.includes('deal.dispute.lapsed'));
});

test('an escalated dispute alerts the operator once', async () => {
  const s = setup(view({ escalated: true }));
  await runV3Dispute(s.deps, deal(), NOW_MS);
  await runV3Dispute(s.deps, deal({ disputeTimeoutAlertedAt: NOW_MS }), NOW_MS);
  assert.equal(s.alerts.length, 1);
  assert.deepEqual(s.calls, []);
});

test('a dispute already ruled or lapsed on-chain only catches the record up', async () => {
  const ruled = setup(view({ state: DEAL_STATE.Split }));
  await runV3Dispute(ruled.deps, deal(), NOW_MS);
  assert.deepEqual(ruled.calls, []);
  assert.equal(ruled.patches[0].disputed, false);
  const lapsed = setup(view({ state: DEAL_STATE.Accepted }));
  await runV3Dispute(lapsed.deps, deal(), NOW_MS);
  assert.deepEqual(lapsed.calls, []);
  assert.equal(lapsed.patches[0].disputed, false);
});

test('a failed check is attested once and remembered for the arbiter', async () => {
  const v = view({ state: DEAL_STATE.Accepted, deliveredAt: 1n, revision: 2 });
  const s = setup(v, { state: 'mismatch', evidenceRevision: 2, verdictCommitment: `0x${'ee'.repeat(32)}` });
  await runV3Attestation(s.deps, deal({ delivered: true, deliveryRevision: 2, disputed: false }));
  assert.deepEqual(s.calls.map((c) => c.name), ['attestCheck']);
  assert.equal(s.calls[0].args.pass, false);
  assert.deepEqual(s.patches[0], { v3AttestedRevision: 2, v3CheckFailedRevision: 2 });

  const again = setup(v, { state: 'mismatch', evidenceRevision: 2, verdictCommitment: `0x${'ee'.repeat(32)}` });
  await runV3Attestation(again.deps, deal({ delivered: true, deliveryRevision: 2, v3AttestedRevision: 2 }));
  assert.deepEqual(again.calls, []);
});
