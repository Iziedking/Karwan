import { formatUnits, parseUnits } from 'viem';
import type { AgreementEscrow } from '../chain/agreementEscrow.js';
import {
  AgreementTermsError,
  agreementTermsHash,
  buildAgreementTerms,
  buyerPaysMicros,
  reviveAgreementTerms,
  storeAgreementTerms,
  type AgreementLimits,
  type AgreementTerms,
  type DealKind,
  type StoredAgreementTerms,
} from '../chain/agreementTerms.js';
import { DEAL_STATE, EscrowProofError, type DealV3View } from '../chain/dealEscrowV3.js';
import type { ContractCallLifecycle } from '../chain/txs.js';
import type { DirectDeal } from '../db/deals.js';
import { IdentityNeeded } from '../identity/suiteIdentity.js';
import type { PlanMovementLegInput } from '../money/model.js';
import { CHECK_POLICY_V1, fundingSaltV3 } from './fundDirectV3.js';
import { termsFloorMs } from './releaseWindow.js';

/// Funding a direct deal on the escrow family's Agreement escrow (view 27): the
/// buying agent approves and funds with the full terms, then the selling agent
/// accepts the same terms hash. The same guarantees as fundDirectV3.ts:
/// - intent (escrow, deal id, salt, terms) is saved before any transaction, and
///   the salt is fixed per deal, so a retry after a crash can never fund twice;
/// - every refusal the escrow would make (cap, terms, quote, balance) and the
///   missing record come before money moves;
/// - a Circle COMPLETE is never success: each step is proven by the receipt
///   event and a fresh read.

type Hex = `0x${string}`;

const USDC_DECIMALS = 6;
const DAY = 86_400;
const ACCEPT_WINDOW_SECS = 3 * DAY;
const DEFAULT_DELIVERY_SECS = 30 * DAY;
export const BETA_CAP_COPY = 'Deals can be up to 1,000 USDC while Karwan is in beta.';

export interface FundDirectSuiteDeps {
  escrow: AgreementEscrow;
  asset: Hex;
  /// The check verifier a checked deal names.
  verifier: Hex;
  readView(dealId: Hex): Promise<DealV3View>;
  readLimits(): Promise<AgreementLimits>;
  settings: { baseReviewSecs: number; reclaimGraceSecs: number };
  requireIdentity(userAddress: string, role: 'buyer' | 'seller'): Promise<void>;
  readUsdcBalance(owner: Hex): Promise<bigint>;
  readUsdcAllowance(owner: Hex, spender: Hex): Promise<bigint>;
  approveUsdc(input: { walletId: string; spender: Hex; amount: bigint; idempotencyKey: string; lifecycle?: ContractCallLifecycle }): Promise<void>;
  movements: {
    ensure(input: { operationKey: string; amountMicros: bigint; buyer: string; seller: string; jobId: string }): Promise<{ reference: string; amountMicros: string }>;
    prepareLeg(reference: string, leg: PlanMovementLegInput): Promise<{ legId: string; idempotencyKey: string; lifecycle?: ContractCallLifecycle }>;
    verifyLeg(reference: string, legId: string): Promise<void>;
    needsAttention(reference: string, code: string, nextActor: 'buyer' | 'seller' | 'karwan'): Promise<void>;
    complete(reference: string, patch: { amountMicros: bigint; summary: string }): Promise<void>;
  };
  patchDeal(jobId: string, patch: Record<string, unknown>): Promise<void>;
  emit(event: { type: string; jobId: string; actor: 'buyer' | 'seller' | 'platform'; payload: Record<string, unknown> }): void;
  now(): number;
}

export interface FundDirectSuiteInput {
  jobId: string;
  deal: {
    buyer: string;
    seller: string;
    dealAmountUsdc: string;
    createdAt: number;
    deadlineUnix?: number | null;
    tradeType?: 'service' | 'goods' | 'mixed';
    evidenceRequired?: boolean;
    paymentTerms?: DirectDeal['paymentTerms'];
    reviewWindowDays?: number;
    shipment?: DirectDeal['shipment'];
    agreementDigest: string;
    acceptedAt?: number;
    escrowDealId?: string;
    escrowTerms?: StoredAgreementTerms;
    escrowTermsHash?: string;
    fundTxHash?: string;
  };
  buyerAgent: { walletId: string; address: Hex };
  sellerAgent: { walletId: string; address: Hex };
  milestonePcts: number[];
  authorizedTotalMicros: bigint;
  operationKey: string;
}

/// The one money movement a deal's funding is recorded under, on every escrow.
export const fundingMovementKey = (jobId: string) => `escrow_funding:${jobId.toLowerCase()}`;

export interface FundDirectSuiteResult {
  status: 200 | 409 | 502;
  body: Record<string, unknown>;
}

/// The kind of deal a direct deal is, from what it records (view 26).
export function dealKindForSuite(deal: { tradeType?: 'service' | 'goods' | 'mixed' }, milestonePcts: number[]): DealKind {
  if (deal.tradeType === 'goods' || deal.tradeType === 'mixed') return 'goods';
  return milestonePcts.filter((p) => p > 0).length > 1 ? 'milestones' : 'one_time';
}

const usdc = (micros: bigint) => formatUnits(micros, USDC_DECIMALS);

const identityRefusal = (err: IdentityNeeded): FundDirectSuiteResult => ({ status: 409, body: { error: err.code, code: err.code } });

export async function fundDirectDealSuite(deps: FundDirectSuiteDeps, input: FundDirectSuiteInput): Promise<FundDirectSuiteResult> {
  const ctx: { reference?: string } = {};
  try {
    return await steps(deps, input, ctx);
  } catch (err) {
    if (err instanceof IdentityNeeded) return identityRefusal(err);
    if (ctx.reference && err && typeof err === 'object') Object.assign(err, { movementReference: ctx.reference });
    throw err;
  }
}

async function steps(deps: FundDirectSuiteDeps, input: FundDirectSuiteInput, ctx: { reference?: string }): Promise<FundDirectSuiteResult> {
  const { jobId, deal, buyerAgent, sellerAgent } = input;
  const escrowAddress = deps.escrow.address;
  const limits = await deps.readLimits();
  let terms: AgreementTerms;
  let escrowDealId: Hex;
  let reference: string;
  let funded: bigint;

  if (deal.escrowDealId && deal.escrowTerms) {
    // ---------------------------------------------------------------- resume
    escrowDealId = deal.escrowDealId as Hex;
    terms = reviveAgreementTerms(deal.escrowTerms);
    const onChain = await deps.readView(escrowDealId);
    const total = buyerPaysMicros(terms.amount, limits.feeBps);
    const movement = await deps.movements.ensure({ operationKey: input.operationKey, amountMicros: total, buyer: deal.buyer, seller: deal.seller, jobId });
    reference = movement.reference;
    ctx.reference = reference;
    funded = BigInt(movement.amountMicros) > 0n ? BigInt(movement.amountMicros) : total;
    if (onChain.state === DEAL_STATE.Accepted) return finalize(deps, input, { reference, funded, escrowDealId, fundTxHash: deal.fundTxHash, recovered: true });
    if (onChain.state === DEAL_STATE.Funded) {
      if (onChain.termsHash.toLowerCase() !== (deal.escrowTermsHash ?? '').toLowerCase()) {
        await deps.movements.needsAttention(reference, 'ESCROW_MISMATCH', 'karwan');
        return { status: 409, body: { error: 'the protected funds do not match this deal', code: 'ESCROW_MISMATCH' } };
      }
      return activate(deps, input, { reference, funded, escrowDealId, terms, fundTxHash: deal.fundTxHash });
    }
    if (onChain.state !== DEAL_STATE.None) return { status: 409, body: { error: 'this escrow deal is already closed', code: 'ESCROW_CLOSED', escrowDealId } };
    await deps.requireIdentity(deal.buyer, 'buyer');
    funded = total;
    if (input.authorizedTotalMicros !== funded) {
      return { status: 409, body: { error: 'the funding total changed before confirmation', code: 'QUOTE_CHANGED', expectedTotalUsdc: usdc(funded) } };
    }
  } else {
    // ----------------------------------------------------------------- fresh
    const nowSecs = Math.floor(deps.now() / 1000);
    const amount = parseUnits(deal.dealAmountUsdc, USDC_DECIMALS);
    if (buyerPaysMicros(amount, limits.feeBps) > limits.perDealCapMicros) {
      return { status: 409, body: { error: BETA_CAP_COPY, code: 'OVER_BETA_CAP' } };
    }
    await deps.requireIdentity(deal.buyer, 'buyer');

    // The delivery window starts when the money is protected.
    const acceptBy = BigInt(nowSecs + ACCEPT_WINDOW_SECS);
    let deliveryDeadline = acceptBy + BigInt(DEFAULT_DELIVERY_SECS);
    if (deal.deadlineUnix != null) {
      const window = deal.deadlineUnix - Math.floor(deal.createdAt / 1000);
      const target = BigInt(window > 0 ? nowSecs + window : deal.deadlineUnix);
      deliveryDeadline = target > acceptBy ? target : acceptBy + BigInt(DAY);
    }
    const review = Math.min(limits.maxReview, Math.max(limits.minReview, deps.settings.baseReviewSecs, Math.floor(termsFloorMs(deal) / 1000)));
    const kind = dealKindForSuite(deal, input.milestonePcts);
    try {
      terms = buildAgreementTerms(
        {
          kind,
          asset: deps.asset,
          seller: sellerAgent.address,
          amountMicros: amount,
          ...(kind === 'milestones' ? { milestonePcts: input.milestonePcts.filter((p) => p > 0) } : {}),
          acceptBy,
          deliveryDeadline,
          reviewWindowSecs: review,
          reclaimGraceSecs: Math.min(deps.settings.reclaimGraceSecs, limits.maxReview),
          ...(deal.evidenceRequired ? { checked: { verifier: deps.verifier, checkPolicy: CHECK_POLICY_V1 } } : {}),
          agreementHash: `0x${deal.agreementDigest.replace(/^0x/, '')}` as Hex,
          nowSecs,
        },
        limits,
      );
    } catch (err) {
      if (err instanceof AgreementTermsError) {
        return { status: 409, body: { error: err.code === 'over_cap' ? BETA_CAP_COPY : err.message, code: err.code === 'over_cap' ? 'OVER_BETA_CAP' : 'TERMS_NOT_SUPPORTED' } };
      }
      throw err;
    }

    funded = buyerPaysMicros(terms.amount, limits.feeBps);
    if (input.authorizedTotalMicros !== funded) {
      return { status: 409, body: { error: 'the funding total changed before confirmation', code: 'QUOTE_CHANGED', expectedTotalUsdc: usdc(funded) } };
    }
    const balance = await deps.readUsdcBalance(buyerAgent.address);
    if (balance < funded) {
      return {
        status: 409,
        body: { error: `buyer agent is short on USDC: has ${usdc(balance)}, needs ${usdc(funded)} (deal + fee). Top up the agent and retry.`, code: 'INSUFFICIENT_AGENT_BALANCE' },
      };
    }

    escrowDealId = deps.escrow.dealIdFor(buyerAgent.address, fundingSaltV3(jobId));
    await deps.patchDeal(jobId, {
      escrowVersion: 'suite',
      escrowAddress,
      escrowDealId,
      escrowSalt: fundingSaltV3(jobId),
      escrowTerms: storeAgreementTerms(terms),
      escrowTermsHash: agreementTermsHash(terms),
      deadlineUnix: Number(deliveryDeadline),
    });
    const movement = await deps.movements.ensure({ operationKey: input.operationKey, amountMicros: funded, buyer: deal.buyer, seller: deal.seller, jobId });
    reference = movement.reference;
    ctx.reference = reference;
    if (BigInt(movement.amountMicros) !== funded) {
      await deps.movements.needsAttention(reference, 'FUNDING_TERMS_CHANGED', 'buyer');
      return { status: 409, body: { error: 'the funding terms changed before submission', code: 'QUOTE_CHANGED' } };
    }
  }

  return fundAndActivate(deps, input, { reference, funded, escrowDealId, terms });
}

async function fundAndActivate(
  deps: FundDirectSuiteDeps,
  input: FundDirectSuiteInput,
  s: { reference: string; funded: bigint; escrowDealId: Hex; terms: AgreementTerms },
): Promise<FundDirectSuiteResult> {
  const { jobId, buyerAgent } = input;
  const escrowAddress = deps.escrow.address;
  const approval = await deps.movements.prepareLeg(s.reference, {
    key: 'approve',
    label: 'Authorize the exact escrow total',
    rail: 'circle_wallets',
    walletId: buyerAgent.walletId,
    signerAddress: buyerAgent.address,
    sourceAddress: buyerAgent.address,
    destinationAddress: escrowAddress,
    amountMicros: s.funded,
  });
  await deps.approveUsdc({ walletId: buyerAgent.walletId, spender: escrowAddress, amount: s.funded, idempotencyKey: approval.idempotencyKey, lifecycle: approval.lifecycle });
  if ((await deps.readUsdcAllowance(buyerAgent.address, escrowAddress)) < s.funded) {
    await deps.movements.needsAttention(s.reference, 'APPROVAL_NOT_CONFIRMED', 'karwan');
    return { status: 409, body: { error: 'the escrow authorization did not confirm. Retry is safe.', code: 'APPROVAL_NOT_CONFIRMED', reference: s.reference } };
  }
  await deps.movements.verifyLeg(s.reference, approval.legId);

  const funding = await deps.movements.prepareLeg(s.reference, {
    key: 'fund',
    label: 'Protect funds in escrow',
    rail: 'circle_wallets',
    walletId: buyerAgent.walletId,
    signerAddress: buyerAgent.address,
    sourceAddress: buyerAgent.address,
    destinationAddress: escrowAddress,
    contractAddress: escrowAddress,
    amountMicros: s.funded,
  });
  let fundTxHash: string;
  try {
    fundTxHash = (
      await deps.escrow.fund({
        walletId: buyerAgent.walletId,
        buyer: buyerAgent.address,
        salt: fundingSaltV3(jobId),
        terms: s.terms,
        idempotencyKey: funding.idempotencyKey,
        lifecycle: funding.lifecycle,
        dealKey: jobId,
      })
    ).txHash;
  } catch (err) {
    if (err instanceof EscrowProofError && typeof err.details.actualJobId === 'string') {
      await deps.patchDeal(jobId, { escrowFundedUnderId: err.details.actualJobId });
      await deps.movements.needsAttention(s.reference, 'FUND_ID_MISMATCH', 'karwan');
      return {
        status: 409,
        body: { error: 'the escrow was funded under a different id than expected. Karwan is reconciling it; no second payment will be taken.', code: 'FUND_ID_MISMATCH', reference: s.reference },
      };
    }
    if (err instanceof EscrowProofError) {
      await deps.movements.needsAttention(s.reference, 'FUND_NOT_CONFIRMED', 'karwan');
      return {
        status: 409,
        body: { error: 'escrow funding did not confirm on chain. Retry is safe: Karwan checks the escrow before any new transfer.', code: 'FUND_NOT_CONFIRMED', reference: s.reference },
      };
    }
    throw err;
  }
  await deps.movements.verifyLeg(s.reference, funding.legId);
  await deps.patchDeal(jobId, { fundTxHash });
  return activate(deps, input, { ...s, fundTxHash });
}

/// The selling agent accepts the exact terms. A seller with no record yet is
/// asked to set it up first; the deal stays funded and the buyer protected.
async function activate(
  deps: FundDirectSuiteDeps,
  input: FundDirectSuiteInput,
  s: { reference: string; funded: bigint; escrowDealId: Hex; terms: AgreementTerms; fundTxHash?: string },
): Promise<FundDirectSuiteResult> {
  const { jobId, deal, sellerAgent } = input;
  try {
    await deps.requireIdentity(deal.seller, 'seller');
  } catch (err) {
    if (!(err instanceof IdentityNeeded)) throw err;
    deps.emit({ type: 'record.setup_needed', jobId, actor: 'platform', payload: { sellerUser: deal.seller.toLowerCase(), reason: 'deal', jobId, escrowDealId: s.escrowDealId } });
    return {
      status: 200,
      body: { accepted: false, jobId, status: 'funded', escrowDealId: s.escrowDealId, reference: s.reference, sellerRecordNeeded: true, ...(s.fundTxHash ? { txHash: s.fundTxHash } : {}) },
    };
  }
  const activation = await deps.movements.prepareLeg(s.reference, {
    key: 'activate',
    label: 'Activate escrow protection',
    rail: 'circle_wallets',
    walletId: sellerAgent.walletId,
    signerAddress: sellerAgent.address,
    contractAddress: deps.escrow.address,
  });
  try {
    await deps.escrow.accept({
      walletId: sellerAgent.walletId,
      jobId: s.escrowDealId,
      termsHash: agreementTermsHash(s.terms),
      idempotencyKey: activation.idempotencyKey,
      lifecycle: activation.lifecycle,
      dealKey: jobId,
    });
  } catch (err) {
    const code = err instanceof EscrowProofError ? 'ACCEPT_NOT_CONFIRMED' : 'ACCEPT_ESCROW_FAILED';
    const error = 'Escrow activation did not complete. Retry is safe because Karwan checks the existing escrow before another transfer.';
    await deps.movements.needsAttention(s.reference, code, 'karwan');
    deps.emit({ type: 'agent.error', jobId, actor: 'seller', payload: { scope: 'accept.suite', message: error, code } });
    return { status: 502, body: { error, code, reference: s.reference } };
  }
  await deps.movements.verifyLeg(s.reference, activation.legId);
  return finalize(deps, input, { ...s, recovered: false });
}

async function finalize(
  deps: FundDirectSuiteDeps,
  input: FundDirectSuiteInput,
  s: { reference: string; funded: bigint; escrowDealId: Hex; fundTxHash?: string; recovered: boolean },
): Promise<FundDirectSuiteResult> {
  const { jobId, deal, sellerAgent } = input;
  await deps.patchDeal(jobId, {
    acceptedAt: deal.acceptedAt ?? deps.now(),
    sellerAgentWalletId: sellerAgent.walletId,
    sellerAgentAddress: sellerAgent.address,
    ...(s.fundTxHash ? { fundTxHash: s.fundTxHash } : {}),
  });
  let receiptPending = false;
  try {
    await deps.movements.complete(s.reference, { amountMicros: s.funded, summary: 'Escrow funded and protection activated' });
  } catch {
    receiptPending = true;
    await deps.movements.needsAttention(s.reference, 'RECEIPT_RECONCILIATION_REQUIRED', 'karwan').catch(() => undefined);
  }
  deps.emit({ type: 'deal.accepted', jobId, actor: 'buyer', payload: { seller: deal.seller, buyer: deal.buyer, tradeType: deal.tradeType, escrowDealId: s.escrowDealId } });
  return {
    status: 200,
    body: {
      accepted: true,
      jobId,
      status: 'funded',
      escrowDealId: s.escrowDealId,
      reference: s.reference,
      ...(s.fundTxHash ? { txHash: s.fundTxHash } : {}),
      ...(s.recovered ? { recovered: true } : {}),
      ...(receiptPending ? { receiptPending } : {}),
    },
  };
}
