import type { AgreementEscrow } from '../chain/agreementEscrow.js';
import {
  AgreementTermsError,
  agreementTermsHash,
  buildAgreementTerms,
  buyerPaysMicros,
  storeAgreementTerms,
  type AgreementLimits,
  type AgreementTerms,
  type StoredAgreementTerms,
} from '../chain/agreementTerms.js';
import { DEAL_STATE, EscrowProofError, type DealV3View } from '../chain/dealEscrowV3.js';
import type { ContractCallLifecycle } from '../chain/txs.js';
import { dealKindForSuite } from '../deals/fundDirectSuite.js';
import { fundingSaltV3 } from '../deals/fundDirectV3.js';

/// Funding an agent-matched deal on the escrow family's Agreement escrow, after
/// the human approved the match: the buying agent approves and funds, then the
/// selling agent accepts the same hash. The salt is fixed per job, so a retry
/// after a crash finds the funded deal instead of paying again, and records the
/// terms the escrow holds rather than rebuilding them.

type Hex = `0x${string}`;

const DAY = 86_400;
const ACCEPT_WINDOW_SECS = 3 * DAY;
const DEFAULT_DELIVERY_SECS = 30 * DAY;

export interface FundAgentMatchSuiteDeps {
  escrow: AgreementEscrow;
  asset: Hex;
  readView(dealId: Hex): Promise<DealV3View>;
  readLimits(): Promise<AgreementLimits>;
  settings: { baseReviewSecs: number; reclaimGraceSecs: number };
  /// Nothing waits for a record (view 27, decision 10): held wallets are set up on the spot.
  ensureRecord(userAddress: string, role: 'buyer' | 'seller'): Promise<'ready' | 'not-ready'>;
  /// A buying agent the registry would refuse steps aside, so the payment goes on.
  freeBuyingAgent(userAddress: string, amountMicros: bigint): Promise<boolean>;
  readUsdcAllowance(owner: Hex, spender: Hex): Promise<bigint>;
  approveUsdc(input: { walletId: string; spender: Hex; amount: bigint; idempotencyKey?: string; lifecycle?: ContractCallLifecycle }): Promise<void>;
  now(): number;
}

export interface FundAgentMatchSuiteInput {
  jobId: Hex;
  /// The people behind the agents, whose records the deal counts on.
  buyerUser: string;
  sellerUser: string;
  buyerAgent: { walletId: string; address: Hex };
  sellerAgent: { walletId: string; address: Hex };
  priceUnits: bigint;
  milestonePcts: number[];
  deadlineUnix: number | null;
  tradeType?: 'service' | 'goods' | 'mixed' | null;
  agreementHash: Hex;
  reviewFloorSecs?: number;
}

export interface SuiteDealRecord {
  escrowVersion: 'suite';
  escrowAddress: string;
  escrowDealId: Hex;
  escrowSalt: Hex;
  escrowTerms: StoredAgreementTerms;
  escrowTermsHash: Hex;
}

export type FundAgentMatchSuiteResult =
  | { ok: true; record: SuiteDealRecord; accepted: boolean; fundTxHash?: string }
  | {
      ok: false;
      reason: 'TERMS_NOT_SUPPORTED' | 'APPROVAL_NOT_CONFIRMED' | 'FUND_NOT_CONFIRMED' | 'FUND_ID_MISMATCH' | 'ESCROW_CLOSED';
      message?: string;
    };

export async function fundAgentMatchSuite(deps: FundAgentMatchSuiteDeps, input: FundAgentMatchSuiteInput): Promise<FundAgentMatchSuiteResult> {
  const escrowAddress = deps.escrow.address;
  const salt = fundingSaltV3(input.jobId);
  const escrowDealId = deps.escrow.dealIdFor(input.buyerAgent.address, salt);
  const recordOf = (terms: AgreementTerms): SuiteDealRecord => ({
    escrowVersion: 'suite',
    escrowAddress,
    escrowDealId,
    escrowSalt: salt,
    escrowTerms: storeAgreementTerms(terms),
    escrowTermsHash: agreementTermsHash(terms),
  });

  const existing = await deps.readView(escrowDealId);
  let terms: AgreementTerms;
  let fundTxHash: string | undefined;

  if (existing.state === DEAL_STATE.None) {
    const limits = await deps.readLimits();
    const nowSecs = Math.floor(deps.now() / 1000);
    const acceptBy = BigInt(nowSecs + ACCEPT_WINDOW_SECS);
    const target = input.deadlineUnix != null ? BigInt(Math.floor(input.deadlineUnix)) : acceptBy + BigInt(DEFAULT_DELIVERY_SECS);
    const kind = dealKindForSuite({ tradeType: input.tradeType ?? undefined }, input.milestonePcts);
    try {
      terms = buildAgreementTerms(
        {
          kind,
          asset: deps.asset,
          seller: input.sellerAgent.address,
          amountMicros: input.priceUnits,
          ...(kind === 'milestones' ? { milestonePcts: input.milestonePcts.filter((p) => p > 0) } : {}),
          acceptBy,
          deliveryDeadline: target > acceptBy ? target : acceptBy + BigInt(DAY),
          reviewWindowSecs: Math.min(limits.maxReview, Math.max(limits.minReview, deps.settings.baseReviewSecs, input.reviewFloorSecs ?? 0)),
          reclaimGraceSecs: Math.min(deps.settings.reclaimGraceSecs, limits.maxReview),
          agreementHash: input.agreementHash,
          nowSecs,
        },
        limits,
      );
    } catch (err) {
      if (err instanceof AgreementTermsError) return { ok: false, reason: 'TERMS_NOT_SUPPORTED', message: err.message };
      throw err;
    }
    const funded = buyerPaysMicros(terms.amount, limits.feeBps);
    await deps.freeBuyingAgent(input.buyerUser, funded);
    await deps.ensureRecord(input.buyerUser, 'buyer');
    await deps.approveUsdc({ walletId: input.buyerAgent.walletId, spender: escrowAddress, amount: funded });
    if ((await deps.readUsdcAllowance(input.buyerAgent.address, escrowAddress)) < funded) return { ok: false, reason: 'APPROVAL_NOT_CONFIRMED' };
    try {
      fundTxHash = (await deps.escrow.fund({ walletId: input.buyerAgent.walletId, buyer: input.buyerAgent.address, salt, terms, dealKey: input.jobId })).txHash;
    } catch (err) {
      if (err instanceof EscrowProofError) {
        return typeof err.details.actualJobId === 'string'
          ? { ok: false, reason: 'FUND_ID_MISMATCH', message: String(err.details.actualJobId) }
          : { ok: false, reason: 'FUND_NOT_CONFIRMED' };
      }
      throw err;
    }
  } else if (existing.state === DEAL_STATE.Funded || existing.state === DEAL_STATE.Accepted) {
    // A retry: the record names exactly what the escrow holds.
    terms = await deps.escrow.readTerms(escrowDealId);
    if (existing.state === DEAL_STATE.Accepted) return { ok: true, record: recordOf(terms), accepted: true };
  } else {
    return { ok: false, reason: 'ESCROW_CLOSED' };
  }

  let accepted = false;
  try {
    await deps.ensureRecord(input.sellerUser, 'seller');
    await deps.escrow.accept({ walletId: input.sellerAgent.walletId, jobId: escrowDealId, termsHash: agreementTermsHash(terms), dealKey: input.jobId });
    accepted = true;
  } catch {
    // Funded and safe: the buyer can cancel an unaccepted deal, and the watcher
    // retries the accept.
  }
  return { ok: true, record: recordOf(terms), accepted, ...(fundTxHash ? { fundTxHash } : {}) };
}
