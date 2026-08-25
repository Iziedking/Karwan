import { InMemoryFinancialCommandLedger, decideFinancialCommand } from '../financial/commandBoundary.js';
import { InMemoryNegotiationRuntime } from '../negotiation/runtime.js';
import { decideReengagement } from '../negotiation/structuredOffer.js';
import { decideStakeQualification } from '../staking/policy.js';
import { InMemoryEvidencePurchaseLedger, planEvidenceAcquisition } from '../evidence/planner.js';
import { evaluateCandidate } from '../matching/engine.js';
import type { MatchingCandidateSnapshot, MatchingMandateSnapshot } from '../matching/types.js';
import { buildLegacyEscrowFundingObservation } from '../agents/financialCommandProjection.js';
import { buildStakeApprovalResumeOperation } from '../agents/stakeFinancialProjection.js';

export interface ReliabilitySimulationReport {
  scenarios: readonly string[];
  invariants: Readonly<Record<string, boolean>>;
  passed: boolean;
}

function offer(version: number, id: string) {
  return {
    dealRoomId: 'room-1', offerId: id, offerVersion: version, senderRole: 'buyer' as const, recipientRole: 'seller' as const,
    kind: version === 1 ? 'OPENING' as const : 'COUNTER' as const, action: 'REVISE_PRICE' as const, priceUsdc: '125', deadlineUnix: 2_000,
    buyerMandateVersion: 3, sellerMandateVersion: 4, ...(version === 1 ? {} : { previousOfferId: `offer-${version - 1}`, previousOfferVersion: version - 1 }),
    terms: { scope: 'research', delivery: '48 hours', paymentTerms: 'after acceptance' },
  };
}

export function runReliabilitySimulation(): ReliabilitySimulationReport {
  const scenarios = [
    'duplicate offer delivery', 'stale offer acceptance', 'duplicate re-engagement trigger',
    'financial unknown replay', 'stake shortfall while deal closes', 'cooldown with identical state',
    'approval expiry and replay', 'provider timeout before provider id',
    'provider timeout after provider id', 'contradictory evidence cannot qualify',
    'bounded impasse leaves deal open', 'negotiation spend cap suppresses re-engagement', 'stale paid evidence requires replacement',
    'duplicate evidence purchase remains idempotent', 're-engagement reuses fresh evidence',
    'minimum evidence threshold blocks a high-score candidate',
    'strong match label requires settled referenced evidence',
    'pre-funding authorization precedes acceptance without V2 mutation',
    'approved stake resumes into a reviewed operation without mutating approval state',
  ];
  const negotiation = new InMemoryNegotiationRuntime();
  const mandates = { buyerMaxPriceUsdc: '150', sellerMinPriceUsdc: '100', buyerMandateVersion: 3, sellerMandateVersion: 4 };
  negotiation.seedRoom({ dealRoomId: 'room-1', mandates });
  const first = negotiation.publishOffer({ commandId: 'offer-1', expectedDealRoomVersion: 1, rawOffer: offer(1, 'offer-1'), mandates, nowUnix: 100 });
  const replay = negotiation.publishOffer({ commandId: 'offer-1', expectedDealRoomVersion: 1, rawOffer: offer(1, 'offer-1'), mandates, nowUnix: 200 });
  const second = negotiation.publishOffer({ commandId: 'offer-2', expectedDealRoomVersion: 2, rawOffer: offer(2, 'offer-2'), mandates, nowUnix: 300 });
  const stale = negotiation.accept({ commandId: 'accept-old', dealRoomId: 'room-1', expectedDealRoomVersion: 2, offerId: 'offer-1', offerVersion: 1, buyerMandateVersion: 3, sellerMandateVersion: 4 });
  const reentry = negotiation.scheduleReengagement({ dealRoomId: 'room-1', trigger: 'TERMS_CHANGED', triggerReference: 'event-1', nowUnix: 400, maxAttempts: 3, currentFingerprint: 'changed' });
  const reentryReplay = negotiation.scheduleReengagement({ dealRoomId: 'room-1', trigger: 'TERMS_CHANGED', triggerReference: 'event-1', nowUnix: 400, maxAttempts: 3, currentFingerprint: 'changed' });
  const spendCapped = new InMemoryNegotiationRuntime();
  spendCapped.seedRoom({ dealRoomId: 'room-spend-cap', mandates, negotiationSpendCapUsdc: '0.05' });
  const spendFirst = spendCapped.scheduleReengagement({
    dealRoomId: 'room-spend-cap', trigger: 'TERMS_CHANGED', triggerReference: 'event-spend-1',
    nowUnix: 400, maxAttempts: 3, currentFingerprint: 'changed-1', nextAttemptCostUsdc: '0.03',
  });
  const spendSecond = spendCapped.scheduleReengagement({
    dealRoomId: 'room-spend-cap', trigger: 'TERMS_CHANGED', triggerReference: 'event-spend-2',
    nowUnix: 401, maxAttempts: 3, currentFingerprint: 'changed-2', nextAttemptCostUsdc: '0.020001',
  });
  const financial = new InMemoryFinancialCommandLedger();
  const policy = { autonomousMaxUsdc: '250', allowedDestinations: ['0x2222222222222222222222222222222222222222'], requireApprovalFor: [] as const };
  const financialCommand = { commandId: 'financial-1', idempotencyKey: 'stake:room-1', operation: 'STAKE' as const, amountUsdc: '100', sourceAddress: '0x1111111111111111111111111111111111111111', destinationAddress: '0x2222222222222222222222222222222222222222', expectedDealRoomVersion: 1, mandateVersion: 3, nowUnix: 100 };
  const financialFirst = financial.decide(financialCommand, policy, { dealRoomVersion: 1, mandateVersion: 3 });
  const financialReplay = financial.decide({ ...financialCommand, amountUsdc: '200' }, policy, { dealRoomVersion: 1, mandateVersion: 3 });
  const unknown = financial.recordSubmission(financialCommand.idempotencyKey, { lifecycle: 'UNKNOWN', providerId: 'provider-1' });
  const unknownReplay = financial.recordSubmission(financialCommand.idempotencyKey, { lifecycle: 'SUBMITTED', providerId: 'provider-2' });
  const expiredApproval = decideFinancialCommand(
    { ...financialCommand, approvalId: 'approval-1', approvalVersion: 2, nowUnix: 100 },
    policy,
    { dealRoomVersion: 1, mandateVersion: 3, approval: { id: 'approval-1', version: 2, expiresAtUnix: 99, amountUsdc: '100' } },
  );
  const staleApproval = decideFinancialCommand(
    { ...financialCommand, approvalId: 'approval-1', approvalVersion: 1, nowUnix: 100 },
    policy,
    { dealRoomVersion: 1, mandateVersion: 3, approval: { id: 'approval-1', version: 2, expiresAtUnix: 1_000, amountUsdc: '100' } },
  );
  const providerTimeouts = new InMemoryFinancialCommandLedger();
  const timeoutBeforeProviderId = providerTimeouts.recordSubmission(
    'sim:timeout:before-provider-id',
    { lifecycle: 'UNKNOWN' },
  );
  const timeoutBeforeProviderIdReplay = providerTimeouts.recordSubmission(
    'sim:timeout:before-provider-id',
    { lifecycle: 'SUBMITTED', providerId: 'provider-late' },
  );
  const timeoutAfterProviderId = providerTimeouts.recordSubmission(
    'sim:timeout:after-provider-id',
    { lifecycle: 'UNKNOWN', providerId: 'provider-known' },
  );
  const timeoutAfterProviderIdReplay = providerTimeouts.recordSubmission(
    'sim:timeout:after-provider-id',
    { lifecycle: 'SUBMITTED', providerId: 'provider-other' },
  );
  const stake = decideStakeQualification({ requirementVersion: 1, requiredStakeUsdc: '500', stakeOwner: financialCommand.sourceAddress, fundingWallet: financialCommand.sourceAddress, vaultAddress: '0x3333333333333333333333333333333333333333', asset: 'USDC', network: 'arc-testnet' }, { freeStakeUsdc: '0', liquidFundingUsdc: '500', dealRoomOpen: false, mandateVersion: 3, expectedRequirementVersion: 1 }, { autonomousMaxUsdc: '250', allowedVaults: ['0x3333333333333333333333333333333333333333'], allowedNetworks: ['arc-testnet'], allowedAssets: ['USDC'] });
  const cooldown = decideReengagement({ trigger: 'COOLDOWN_ELAPSED', triggerReference: 'clock-1', nowUnix: 500, attemptCount: 1, maxAttempts: 3, currentFingerprint: 'same', previousFingerprint: 'same' });
  const evidenceNeed = {
    needId: 'sim-evidence-1', claim: 'completed-transactions' as const, subject: '0x1111111111111111111111111111111111111111',
    decision: 'qualification' as const, requiredFreshnessSeconds: 3_600, minimumReliability: 70,
    maximumPriceUsdc: '1', mandateVersion: 1, policyVersion: 'policy-1', expiresAtUnix: 1_000,
  };
  const uncertainEvidence = {
    snapshotId: 'sim-unknown', needId: evidenceNeed.needId, source: 'x402' as const, capturedAtUnix: 100,
    reliability: 0, status: 'unknown' as const, provenance: ['aggregate-payment'], responseHash: 'unknown-hash',
  };
  const freshEvidence = {
    ...uncertainEvidence, snapshotId: 'sim-fresh', source: 'onchain' as const, reliability: 90,
    status: 'fresh' as const, provenance: ['receipt'], responseHash: 'fresh-hash',
  };
  const plannerBase = {
    need: evidenceNeed, nowUnix: 100, cachedSnapshots: [], providers: [], expectedDecisionValueUsdc: '5',
    perDealSpentUsdc: '0', perDealBudgetUsdc: '1', allowedNetworks: [], allowedAssets: [], allowedPayTo: [],
  };
  const uncertainPlan = planEvidenceAcquisition({ ...plannerBase, directSnapshot: uncertainEvidence });
  const freshPlan = planEvidenceAcquisition({ ...plannerBase, directSnapshot: freshEvidence });
  const contradictoryPlan = planEvidenceAcquisition({
    ...plannerBase,
    directSnapshot: { ...freshEvidence, snapshotId: 'sim-contradictory', status: 'contradictory', responseHash: 'contradictory-hash' },
  });
  const approvedPaidProvider = {
    providerId: 'sim-paid-provider', source: 'x402' as const,
    endpoint: 'https://provider.example/evidence', network: 'base', asset: 'USDC',
    payTo: '0x2222222222222222222222222222222222222222', priceUsdc: '0.10',
    expectedReliability: 90, responseLimitBytes: 10_000,
  };
  const stalePlan = planEvidenceAcquisition({
    ...plannerBase,
    directSnapshot: { ...freshEvidence, snapshotId: 'sim-stale', status: 'stale' },
    providers: [approvedPaidProvider], allowedNetworks: ['base'], allowedAssets: ['USDC'],
    allowedPayTo: [approvedPaidProvider.payTo],
  });
  const evidenceLedger = new InMemoryEvidencePurchaseLedger();
  const ledgerCreated = evidenceLedger.recordStatus(evidenceNeed, 'CREATED');
  const ledgerDuplicate = evidenceLedger.recordStatus(evidenceNeed, 'CREATED');
  const reusableSnapshot = evidenceLedger.recordSnapshot(evidenceNeed, freshEvidence);
  const duplicateSnapshot = evidenceLedger.recordSnapshot(evidenceNeed, freshEvidence);
  const cachedReusePlan = planEvidenceAcquisition({
    ...plannerBase,
    cachedSnapshots: [reusableSnapshot],
    providers: [approvedPaidProvider], allowedNetworks: ['base'], allowedAssets: ['USDC'],
    allowedPayTo: [approvedPaidProvider.payTo],
  });
  const matchingMandate: MatchingMandateSnapshot = {
    mandateId: 'sim-matching-mandate', version: 1,
    ownerAddress: '0x1111111111111111111111111111111111111111',
    agentAddress: '0x4444444444444444444444444444444444444444',
    lane: 'service', budgetUsdc: '100', maxBudgetUsdc: '100', maxDeadlineUnix: 2_000,
    requiredKeywords: ['backend'],
  };
  const matchingCandidate: MatchingCandidateSnapshot = {
    candidateId: 'sim-matching-candidate', version: 1, kind: 'profile',
    sellerAgentAddress: '0x2222222222222222222222222222222222222222',
    sellerOwnerAddress: '0x3333333333333333333333333333333333333333',
    lane: 'service', keywords: ['backend'], declaredSkills: ['backend'],
    priceUsdc: '90', deadlineUnix: 1_500, capacityAvailable: true,
    tier: 'strong',
  };
  const thresholdBlocked = evaluateCandidate({
    mandate: matchingMandate,
    candidate: {
      ...matchingCandidate,
      transactionEvidence: [{
        source: 'paid_x402', completed: 100, disputed: 0, failed: 0,
        verified: true, paymentStatus: 'UNKNOWN', evidenceId: 'sim-pending-evidence',
      }],
    },
    nowUnix: 1_000,
    minimumReliability: 80,
  });
  const strongLabel = evaluateCandidate({
    mandate: matchingMandate,
    candidate: {
      ...matchingCandidate,
      transactionEvidence: [{
        source: 'paid_x402', completed: 100, disputed: 0, failed: 0,
        verified: true, paymentStatus: 'SETTLED', evidenceId: 'sim-settled-evidence',
      }],
    },
    nowUnix: 1_000,
    minimumReliability: 80,
  });
  const preFundingInsufficient = buildLegacyEscrowFundingObservation({
    dealRoomId: 'room-prefund-sim',
    buyerAgentAddress: '0x1111111111111111111111111111111111111111',
    escrowAddress: '0x2222222222222222222222222222222222222222',
    fundedAmountUsdc: '12.500000',
    observedAtUnix: 100,
    preFundingObservation: {
      balanceUsdc: '2.000000',
      requiredUsdc: '12.500000',
      outcome: 'insufficient',
      observedAtUnix: 100,
    },
  });
  const preFundingSufficient = buildLegacyEscrowFundingObservation({
    dealRoomId: 'room-prefund-sim',
    buyerAgentAddress: '0x1111111111111111111111111111111111111111',
    escrowAddress: '0x2222222222222222222222222222222222222222',
    fundedAmountUsdc: '12.500000',
    observedAtUnix: 200,
    preFundingObservation: {
      balanceUsdc: '20.000000',
      requiredUsdc: '12.500000',
      outcome: 'sufficient',
      observedAtUnix: 200,
    },
  });
  const preFundingReplay = buildLegacyEscrowFundingObservation({
    dealRoomId: 'room-prefund-sim',
    buyerAgentAddress: '0x1111111111111111111111111111111111111111',
    escrowAddress: '0x2222222222222222222222222222222222222222',
    fundedAmountUsdc: '12.500000',
    observedAtUnix: 300,
    preFundingObservation: {
      balanceUsdc: '20.000000',
      requiredUsdc: '12.500000',
      outcome: 'sufficient',
      observedAtUnix: 300,
    },
  });
  const stakeResumeInput = {
    dealRoomId: 'room-stake-resume-sim',
    approvalId: 'approval:stake-resume-sim', observedAtUnix: 100,
    requirement: {
      requirementVersion: 2, requiredStakeUsdc: '500',
      stakeOwner: '0x1111111111111111111111111111111111111111',
      fundingWallet: '0x2222222222222222222222222222222222222222',
      vaultAddress: '0x3333333333333333333333333333333333333333', asset: 'USDC' as const, network: 'arc-testnet',
    },
    snapshot: { freeStakeUsdc: '100', liquidFundingUsdc: '400', dealRoomOpen: true, mandateVersion: 7, expectedRequirementVersion: 2 },
    policy: { autonomousMaxUsdc: '250', allowedVaults: ['0x3333333333333333333333333333333333333333'], allowedNetworks: ['arc-testnet'], allowedAssets: ['USDC'] },
    actorAddress: '0x9999999999999999999999999999999999999999',
    execution: { walletId: 'circle-seller-wallet-1', contractAddress: '0x3333333333333333333333333333333333333333', feeLevel: 'LOW' as const, callData: '0x1234' },
  };
  const approvedStakeResume = buildStakeApprovalResumeOperation(stakeResumeInput, {
    id: stakeResumeInput.approvalId, dealRoomId: stakeResumeInput.dealRoomId, requestKey: 'stake:resume-sim', kind: 'STAKE',
    state: 'approved', version: 2, createdAt: 90, updatedAt: 95, expiresAt: 1_000,
    data: { amountUsdc: '400', requirementVersion: 2, mandateVersion: 7, approverAddress: stakeResumeInput.actorAddress },
  });
  const wrongStakeResume = buildStakeApprovalResumeOperation({ ...stakeResumeInput, actorAddress: '0x8888888888888888888888888888888888888888' }, {
    id: stakeResumeInput.approvalId, dealRoomId: stakeResumeInput.dealRoomId, requestKey: 'stake:resume-sim', kind: 'STAKE',
    state: 'approved', version: 2, createdAt: 90, updatedAt: 95, expiresAt: 1_000,
    data: { amountUsdc: '400', requirementVersion: 2, mandateVersion: 7, approverAddress: stakeResumeInput.actorAddress },
  });
  const boundedImpasse = decideReengagement({
    trigger: 'COOLDOWN_ELAPSED', triggerReference: 'attempt-cap', nowUnix: 600,
    attemptCount: 3, maxAttempts: 3, currentFingerprint: 'new-terms', previousFingerprint: 'old-terms',
  });
  const roomAfterImpasse = negotiation.getRoom('room-1');
  const invariants = {
    duplicateOfferReplayed: replay === first,
    staleOfferRejected: stale.outcome === 'stale' && stale.reason === 'STALE_OFFER',
    newerOfferPublished: second.outcome === 'published',
    reentryScheduledOnce: reentry.outcome === 'schedule' && reentryReplay.outcome === 'suppress',
    negotiationSpendCapSuppressesReengagement: spendFirst.outcome === 'schedule'
      && spendSecond.outcome === 'suppress' && spendSecond.reason === 'SPEND_CAP'
      && spendCapped.getRoom('room-spend-cap').negotiationSpendUsdc === '0.03',
    financialDecisionIdempotent: financialFirst === financialReplay,
    providerUnknownDoesNotResubmit: unknown === unknownReplay && unknown.lifecycle === 'UNKNOWN',
    expiredApprovalCannotExecute: expiredApproval.decision === 'REJECTED' && expiredApproval.reason === 'EXPIRED_APPROVAL',
    staleApprovalReplayCannotExecute: staleApproval.decision === 'REJECTED' && staleApproval.reason === 'STALE_APPROVAL',
    timeoutBeforeProviderIdIsSticky: timeoutBeforeProviderId === timeoutBeforeProviderIdReplay
      && timeoutBeforeProviderId.lifecycle === 'UNKNOWN'
      && timeoutBeforeProviderId.providerId === undefined,
    timeoutAfterProviderIdIsSticky: timeoutAfterProviderId === timeoutAfterProviderIdReplay
      && timeoutAfterProviderId.lifecycle === 'UNKNOWN'
      && timeoutAfterProviderId.providerId === 'provider-known',
    closedStakeDoesNotResume: stake.outcome === 'blocked' && stake.reason === 'DEAL_CLOSED',
    unchangedCooldownSuppressed: cooldown.outcome === 'suppress' && cooldown.reason === 'NO_MATERIAL_CHANGE',
    uncertainEvidenceCannotQualify: uncertainPlan.action === 'wait' && uncertainPlan.reason === 'NO_APPROVED_PROVIDER',
    freshEvidenceReusedWithoutPurchase: freshPlan.action === 'use' && freshPlan.source === 'onchain',
    contradictoryEvidenceCannotQualify: contradictoryPlan.action === 'wait' && contradictoryPlan.reason === 'NO_APPROVED_PROVIDER',
    boundedImpasseLeavesDealOpen: boundedImpasse.outcome === 'suppress' && boundedImpasse.reason === 'ATTEMPT_CAP'
      && roomAfterImpasse.activeOfferId === 'offer-2' && roomAfterImpasse.doNotReengage === false,
    stalePaidEvidenceRequiresReplacement: stalePlan.action === 'purchase'
      && stalePlan.source === 'x402'
      && stalePlan.reason === 'PAID_CLAIM_CAN_CHANGE_DECISION',
    duplicateEvidencePurchaseIsIdempotent: ledgerCreated === 'CREATED'
      && ledgerDuplicate === 'CREATED'
      && duplicateSnapshot === reusableSnapshot,
    reengagementReusesFreshEvidence: cachedReusePlan.action === 'use'
      && cachedReusePlan.source === 'fresh-cache'
      && cachedReusePlan.reason === 'FRESH_EVIDENCE_REUSED'
      && cachedReusePlan.snapshot === reusableSnapshot,
    minimumEvidenceThresholdBlocksCandidate: thresholdBlocked.eligible === false
      && thresholdBlocked.decision === 'ambiguous'
      && thresholdBlocked.matchLabel === 'EVIDENCE_PENDING'
      && thresholdBlocked.reasons.includes('RELIABILITY_BELOW_THRESHOLD'),
    strongMatchRequiresSettledReferencedEvidence: strongLabel.eligible === true
      && strongLabel.matchLabel === 'STRONG_MATCH'
      && strongLabel.evidence.reliableTransactionCount === 1,
    preFundingObservationIsDistinctAndIdempotent: preFundingInsufficient.command.operation === 'ESCROW_FUNDING'
      && preFundingInsufficient.policy.requireApprovalFor.includes('ESCROW_FUNDING')
      && preFundingInsufficient.command.idempotencyKey !== preFundingSufficient.command.idempotencyKey
      && preFundingSufficient.command.idempotencyKey === preFundingReplay.command.idempotencyKey
      && preFundingSufficient.preFundingObservation?.outcome === 'sufficient',
    approvedStakeResumeIsExactAndActorBound: approvedStakeResume.allowed === true
      && approvedStakeResume.operation.command.operation === 'STAKE'
      && approvedStakeResume.operation.command.approvalId === stakeResumeInput.approvalId
      && wrongStakeResume.allowed === false
      && wrongStakeResume.reason === 'WRONG_APPROVER',
  };
  scenarios.push(
    'uncertain evidence cannot qualify',
    'fresh evidence reused without purchase',
  );
  return { scenarios, invariants, passed: Object.values(invariants).every(Boolean) && first.outcome === 'published' };
}
