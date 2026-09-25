import { DEAL_STATE, EscrowProofError, type DealEscrowV3, type DealV3View } from '../chain/dealEscrowV3.js';
import { buildDealTerms, DealTermsError, dealTermsHash, type DealTermsLimits } from '../chain/dealTermsV3.js';
import type { ContractCallLifecycle } from '../chain/txs.js';
import { dealShapeV3, fundingSaltV3, storeTerms, type StoredTermsV3 } from '../deals/fundDirectV3.js';

/// Funding an agent-matched deal on KarwanDealEscrow (v3), after the human
/// approved the match. The buyer agent approves and funds with the full terms;
/// the seller agent then accepts the same hash (the seller approved the match,
/// so the consent already exists). If that accept does not land, the deal is
/// still funded and the delivery route accepts it first, as it does on v2.
///
/// The salt is fixed per job, so a retry after a crash finds the funded deal on
/// the chain instead of paying again.

type Hex = `0x${string}`;

const BPS = 10_000n;
const AGENT_FLOW_TRUSTED_STAKE_PCT = 50;

export interface FundAgentMatchV3Deps {
  escrow: DealEscrowV3;
  readDeal(jobId: Hex): Promise<DealV3View>;
  readLimits(nowSecs: number): Promise<DealTermsLimits>;
  readFeeBps(): Promise<number>;
  readUsdcAllowance(owner: Hex, spender: Hex): Promise<bigint>;
  approveUsdc(input: {
    walletId: string;
    spender: Hex;
    amount: bigint;
    idempotencyKey?: string;
    lifecycle?: ContractCallLifecycle;
  }): Promise<void>;
  now(): number;
}

export interface FundAgentMatchV3Input {
  jobId: Hex;
  buyerAgent: { walletId: string; address: Hex };
  sellerAgent: { walletId: string; address: Hex };
  priceUnits: bigint;
  milestonePcts: number[];
  trustedMatch: boolean;
  /// Already re-anchored to acceptance time.
  deadlineUnix: number | null;
  tradeType?: 'service' | 'goods' | 'mixed' | null;
  /// The request's on-chain terms hash from the JobBoard.
  agreementHash: Hex;
}

/// What the deal row records so every later step uses the same escrow deal.
export interface V3DealRecord {
  escrowVersion: 'v3';
  escrowAddress: string;
  escrowDealId: Hex;
  escrowSalt: Hex;
  escrowTerms: StoredTermsV3;
  escrowTermsHash: Hex;
}

export type FundAgentMatchV3Result =
  | { ok: true; record: V3DealRecord; accepted: boolean; fundTxHash?: string }
  | { ok: false; reason: 'TERMS_NOT_SUPPORTED' | 'APPROVAL_NOT_CONFIRMED' | 'FUND_NOT_CONFIRMED' | 'FUND_ID_MISMATCH' | 'ESCROW_CLOSED'; message?: string };

export async function fundAgentMatchV3(
  deps: FundAgentMatchV3Deps,
  input: FundAgentMatchV3Input,
): Promise<FundAgentMatchV3Result> {
  const escrowAddress = deps.escrow.address as Hex;
  const salt = fundingSaltV3(input.jobId);
  const escrowDealId = deps.escrow.dealIdFor(input.buyerAgent.address, salt);
  const nowSecs = Math.floor(deps.now() / 1000);

  let terms;
  try {
    const shape = dealShapeV3({ tradeType: input.tradeType ?? undefined });
    terms = buildDealTerms(
      {
        seller: input.sellerAgent.address,
        amountUnits: input.priceUnits,
        milestonePcts: input.milestonePcts,
        stakePct: input.trustedMatch ? AGENT_FLOW_TRUSTED_STAKE_PCT : null,
        deadlineUnix: input.deadlineUnix,
        reviewFloorSecs: 0,
        shape: shape.shape,
        checkPolicy: shape.checkPolicy,
        agreementHash: input.agreementHash,
      },
      await deps.readLimits(nowSecs),
    );
  } catch (err) {
    if (err instanceof DealTermsError) return { ok: false, reason: 'TERMS_NOT_SUPPORTED', message: err.message };
    throw err;
  }
  const termsHash = dealTermsHash(terms);
  const record: V3DealRecord = {
    escrowVersion: 'v3',
    escrowAddress,
    escrowDealId,
    escrowSalt: salt,
    escrowTerms: storeTerms(terms),
    escrowTermsHash: termsHash,
  };

  let fundTxHash: string | undefined;
  const existing = await deps.readDeal(escrowDealId);
  if (existing.state === DEAL_STATE.None) {
    const fee = (terms.amount * BigInt(await deps.readFeeBps())) / BPS;
    const funded = terms.amount + fee / 2n;
    await deps.approveUsdc({ walletId: input.buyerAgent.walletId, spender: escrowAddress, amount: funded });
    if ((await deps.readUsdcAllowance(input.buyerAgent.address, escrowAddress)) < funded) {
      return { ok: false, reason: 'APPROVAL_NOT_CONFIRMED' };
    }
    try {
      const r = await deps.escrow.fund({
        walletId: input.buyerAgent.walletId,
        buyer: input.buyerAgent.address,
        salt,
        terms,
        dealKey: input.jobId,
      });
      fundTxHash = r.txHash;
    } catch (err) {
      if (err instanceof EscrowProofError) {
        return typeof err.details.actualJobId === 'string'
          ? { ok: false, reason: 'FUND_ID_MISMATCH', message: String(err.details.actualJobId) }
          : { ok: false, reason: 'FUND_NOT_CONFIRMED' };
      }
      throw err;
    }
  } else if (existing.state === DEAL_STATE.Accepted) {
    return { ok: true, record, accepted: true };
  } else if (existing.state !== DEAL_STATE.Funded) {
    return { ok: false, reason: 'ESCROW_CLOSED' };
  } else if (existing.termsHash.toLowerCase() !== termsHash.toLowerCase()) {
    // Funded earlier with other terms (the price moved between attempts): the
    // record must describe what the chain holds, never what we would build now.
    return { ok: false, reason: 'FUND_ID_MISMATCH', message: 'funded with different terms' };
  }

  let accepted = false;
  try {
    await deps.escrow.accept({
      walletId: input.sellerAgent.walletId,
      jobId: escrowDealId,
      termsHash,
      dealKey: input.jobId,
    });
    accepted = true;
  } catch {
    // Funded and safe: the buyer can cancel an unaccepted deal, and the
    // delivery route accepts before the seller marks delivery.
  }
  return { ok: true, record, accepted, ...(fundTxHash ? { fundTxHash } : {}) };
}
