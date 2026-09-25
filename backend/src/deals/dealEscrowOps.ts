import { ESCROW_STATE, type EscrowAccount } from '../chain/contracts.js';
import { DEAL_STATE, type DealEscrowV3, type DealStateV3, type DealV3View } from '../chain/dealEscrowV3.js';
import { keccak256, toBytes } from 'viem';
import type { MutualCancelCallOptions, SettlementCallOptions } from '../chain/settlement.js';
import { reviveTerms, type StoredTermsV3 } from './fundDirectV3.js';

/// One set of escrow operations for a deal, whichever escrow holds its money.
/// A deal row records its escrow (escrowVersion); routes and watchers call
/// these instead of the v2 wrappers directly, so each deal finishes on the
/// escrow it started on.
///
/// Reads come back in the v2 EscrowAccount shape the rest of the backend
/// already understands, with the precise v3 view attached for callers that
/// need it (a Reclaimed or Split v3 deal maps to Refunded or Settled).

type Hex = `0x${string}`;

export interface DealEscrowRef {
  jobId: string;
  escrowVersion?: 'v2' | 'v3';
  escrowDealId?: string;
  escrowTerms?: StoredTermsV3;
  escrowTermsHash?: string;
}

export type DealEscrowAccount = EscrowAccount & {
  version: 'v2' | 'v3';
  /// v3 only.
  v3?: DealV3View;
  v3State?: DealStateV3;
};

const V3_TO_V2_STATE: Record<DealStateV3, number> = {
  [DEAL_STATE.None]: ESCROW_STATE.None,
  [DEAL_STATE.Funded]: ESCROW_STATE.Funded,
  [DEAL_STATE.Accepted]: ESCROW_STATE.Accepted,
  [DEAL_STATE.Disputed]: ESCROW_STATE.Disputed,
  [DEAL_STATE.Settled]: ESCROW_STATE.Settled,
  [DEAL_STATE.Refunded]: ESCROW_STATE.Refunded,
  [DEAL_STATE.Reclaimed]: ESCROW_STATE.Refunded,
  [DEAL_STATE.Split]: ESCROW_STATE.Settled,
};

export function accountFromV3(view: DealV3View, stored: StoredTermsV3, reviewEnd: bigint): DealEscrowAccount {
  const terms = reviveTerms(stored);
  return {
    version: 'v3',
    v3: view,
    v3State: view.state,
    buyer: view.buyer,
    seller: view.seller,
    dealAmount: terms.amount,
    sellerNet: view.sellerNet,
    feeTotal: view.feeTotal,
    released: view.released,
    feeReleased: view.feeReleased,
    reservedAmount: view.reserved,
    milestonePcts: terms.pcts.filter((p) => p > 0),
    milestonesReleased: view.paid,
    state: V3_TO_V2_STATE[view.state],
    reservationBps: terms.reservationBps,
    deliveryDeadline: view.deadline,
    reviewWindow: BigInt(terms.reviewWindow),
    reclaimGrace: BigInt(terms.reclaimGrace),
    disputedAt: view.disputedAt,
    deliveredAt: view.deliveredAt,
    claimDeadline: reviewEnd,
    wasAccepted: view.state >= DEAL_STATE.Accepted,
  };
}

export interface DealEscrowOpsDeps {
  v3: DealEscrowV3 | null;
  readV3(jobId: Hex): Promise<DealV3View>;
  readV3ReviewEnd(jobId: Hex): Promise<bigint>;
  guardianWalletId?: string;
  v2OnChainClock: boolean;
  v2: {
    readEscrow(jobId: string): Promise<EscrowAccount>;
    invalidate(jobId: string): void;
    accept(jobId: string, walletId: string, op?: SettlementCallOptions): Promise<string>;
    markDelivered(jobId: string, proofHash: string, walletId: string): Promise<string>;
    release(jobId: string, index: number, walletId: string, op?: SettlementCallOptions): Promise<string>;
    claim(jobId: string, index: number, walletId: string): Promise<string>;
    extendDeadline(jobId: string, walletId: string, deadlineUnix: number): Promise<string>;
    reclaim(jobId: string, walletId: string, op?: SettlementCallOptions): Promise<string>;
    finalizeIfSettled(jobId: string): Promise<boolean>;
    attest(jobId: string, index: number, pass: boolean, evidenceHash: string): Promise<string | null>;
    dispute(jobId: string, walletId: string, reason: string): Promise<string>;
    lapseDispute(jobId: string, walletId: string): Promise<string>;
    mutualCancel(
      jobId: string,
      proposerWalletId: string,
      acceptorWalletId: string,
      sellerBps: number,
      op?: MutualCancelCallOptions,
    ): Promise<{ proposeTxHash: string; acceptTxHash: string }>;
    hold(jobId: string, reasonHash: string): Promise<string | null>;
    releaseHold(jobId: string): Promise<string | null>;
  };
  warn(context: Record<string, unknown>, message: string): void;
}

export function createDealEscrowOps(deps: DealEscrowOpsDeps) {
  function isV3(deal: DealEscrowRef): boolean {
    return deal.escrowVersion === 'v3';
  }

  function v3Of(deal: DealEscrowRef): { escrow: DealEscrowV3; id: Hex; dealKey: string } {
    if (!deps.v3) throw new Error(`deal ${deal.jobId} is on the v3 escrow, which is not configured here`);
    if (!deal.escrowDealId || !deal.escrowTerms) {
      throw new Error(`deal ${deal.jobId} is on the v3 escrow but has no escrow deal id on record`);
    }
    return { escrow: deps.v3, id: deal.escrowDealId as Hex, dealKey: deal.jobId };
  }

  async function read(deal: DealEscrowRef): Promise<DealEscrowAccount> {
    if (!isV3(deal)) {
      deps.v2.invalidate(deal.jobId);
      return { ...(await deps.v2.readEscrow(deal.jobId)), version: 'v2' };
    }
    const { id } = v3Of(deal);
    const [view, reviewEnd] = await Promise.all([deps.readV3(id), deps.readV3ReviewEnd(id)]);
    return accountFromV3(view, deal.escrowTerms!, reviewEnd);
  }

  async function nextMilestone(deal: DealEscrowRef, index: number): Promise<void> {
    const { id } = v3Of(deal);
    const view = await deps.readV3(id);
    if (view.paid !== index) {
      throw new Error(`milestone ${index} is not next on deal ${deal.jobId}: ${view.paid} already paid`);
    }
  }

  return {
    isV3,
    read,

    /// Whether the chain runs this deal's delivery and review clocks: always on
    /// v3, and on v2 only with the v2b escrow.
    usesOnChainClock(deal: DealEscrowRef): boolean {
      return isV3(deal) || deps.v2OnChainClock;
    },

    async accept(deal: DealEscrowRef, sellerWalletId: string, op?: SettlementCallOptions): Promise<string> {
      if (!isV3(deal)) return deps.v2.accept(deal.jobId, sellerWalletId, op);
      const { escrow, id, dealKey } = v3Of(deal);
      const r = await escrow.accept({
        walletId: sellerWalletId,
        jobId: id,
        termsHash: deal.escrowTermsHash as Hex,
        dealKey,
        idempotencyKey: op?.idempotencyKey,
        lifecycle: op?.lifecycle,
      });
      return r.txHash;
    },

    async markDelivered(deal: DealEscrowRef, proofHash: string, sellerWalletId: string): Promise<string> {
      if (!isV3(deal)) return deps.v2.markDelivered(deal.jobId, proofHash, sellerWalletId);
      const { escrow, id, dealKey } = v3Of(deal);
      return (await escrow.markDelivered({ walletId: sellerWalletId, jobId: id, proofHash: proofHash as Hex, dealKey })).txHash;
    },

    /// Best-effort, like the v2 guardian calls: a guardian action never blocks
    /// delivery or settlement. A v3 attestation names the delivery revision it
    /// checked, read from the chain here.
    async attestDelivery(deal: DealEscrowRef, milestoneIndex: number, pass: boolean, evidenceHash: string) {
      if (!isV3(deal)) return deps.v2.attest(deal.jobId, milestoneIndex, pass, evidenceHash);
      if (!deps.guardianWalletId) return null;
      try {
        const { escrow, id, dealKey } = v3Of(deal);
        const view = await deps.readV3(id);
        return (
          await escrow.attestCheck({
            walletId: deps.guardianWalletId,
            jobId: id,
            revision: view.revision,
            pass,
            evidenceHash: evidenceHash as Hex,
            dealKey,
          })
        ).txHash;
      } catch (err) {
        deps.warn({ jobId: deal.jobId, err: (err as Error).message }, 'v3 attestCheck failed (non-blocking)');
        return null;
      }
    },

    async hold(deal: DealEscrowRef, reasonHash: string) {
      if (!isV3(deal)) return deps.v2.hold(deal.jobId, reasonHash);
      if (!deps.guardianWalletId) return null;
      try {
        const { escrow, id, dealKey } = v3Of(deal);
        return (await escrow.hold({ walletId: deps.guardianWalletId, jobId: id, reasonHash: reasonHash as Hex, dealKey })).txHash;
      } catch (err) {
        deps.warn({ jobId: deal.jobId, err: (err as Error).message }, 'v3 hold failed (non-blocking)');
        return null;
      }
    },

    async releaseHold(deal: DealEscrowRef) {
      if (!isV3(deal)) return deps.v2.releaseHold(deal.jobId);
      if (!deps.guardianWalletId) return null;
      try {
        const { escrow, id, dealKey } = v3Of(deal);
        return (await escrow.releaseHold({ walletId: deps.guardianWalletId, jobId: id, dealKey })).txHash;
      } catch (err) {
        deps.warn({ jobId: deal.jobId, err: (err as Error).message }, 'v3 releaseHold failed (non-blocking)');
        return null;
      }
    },

    /// The buyer confirms goods arrived (review starts on arrival). v2 has no
    /// on-chain step for this.
    async confirmArrival(deal: DealEscrowRef, buyerWalletId: string): Promise<string | null> {
      if (!isV3(deal)) return null;
      const { escrow, id, dealKey } = v3Of(deal);
      const view = await deps.readV3(id);
      if (view.reviewStartAt !== 0n || view.deliveredAt === 0n) return null;
      return (await escrow.startReview({ walletId: buyerWalletId, jobId: id, dealKey })).txHash;
    },

    async requestMoreTime(deal: DealEscrowRef, buyerWalletId: string): Promise<string | null> {
      if (!isV3(deal)) return null;
      const { escrow, id, dealKey } = v3Of(deal);
      return (await escrow.requestMoreTime({ walletId: buyerWalletId, jobId: id, dealKey })).txHash;
    },

    async release(deal: DealEscrowRef, index: number, buyerWalletId: string, op?: SettlementCallOptions): Promise<string> {
      if (!isV3(deal)) return deps.v2.release(deal.jobId, index, buyerWalletId, op);
      await nextMilestone(deal, index);
      const { escrow, id, dealKey } = v3Of(deal);
      return (
        await escrow.release({
          walletId: buyerWalletId,
          jobId: id,
          dealKey,
          idempotencyKey: op?.idempotencyKey,
          lifecycle: op?.lifecycle,
        })
      ).txHash;
    },

    async claim(deal: DealEscrowRef, index: number, sellerWalletId: string): Promise<string> {
      if (!isV3(deal)) return deps.v2.claim(deal.jobId, index, sellerWalletId);
      await nextMilestone(deal, index);
      const { escrow, id, dealKey } = v3Of(deal);
      return (await escrow.claim({ walletId: sellerWalletId, jobId: id, dealKey })).txHash;
    },

    async extendDeadline(deal: DealEscrowRef, buyerWalletId: string, deadlineUnix: number): Promise<string> {
      if (!isV3(deal)) return deps.v2.extendDeadline(deal.jobId, buyerWalletId, deadlineUnix);
      const { escrow, id, dealKey } = v3Of(deal);
      return (await escrow.extendDeadline({ walletId: buyerWalletId, jobId: id, newDeadline: deadlineUnix, dealKey })).txHash;
    },

    async reclaim(deal: DealEscrowRef, buyerWalletId: string, op?: SettlementCallOptions): Promise<string> {
      if (!isV3(deal)) return deps.v2.reclaim(deal.jobId, buyerWalletId, op);
      const { escrow, id, dealKey } = v3Of(deal);
      return (
        await escrow.reclaim({
          walletId: buyerWalletId,
          jobId: id,
          dealKey,
          idempotencyKey: op?.idempotencyKey,
          lifecycle: op?.lifecycle,
        })
      ).txHash;
    },

    /// Either side opens a dispute. On v3 the reason goes on-chain as a hash.
    async dispute(deal: DealEscrowRef, walletId: string, reason: string): Promise<string> {
      if (!isV3(deal)) return deps.v2.dispute(deal.jobId, walletId, reason);
      const { escrow, id, dealKey } = v3Of(deal);
      return (await escrow.dispute({ walletId, jobId: id, reasonHash: keccak256(toBytes(reason)), dealKey })).txHash;
    },

    async lapseDispute(deal: DealEscrowRef, walletId: string): Promise<string> {
      if (!isV3(deal)) return deps.v2.lapseDispute(deal.jobId, walletId);
      const { escrow, id, dealKey } = v3Of(deal);
      return (await escrow.lapseDispute({ walletId, jobId: id, dealKey })).txHash;
    },

    /// Settle by consent: one side proposes a split of the unpaid amount and
    /// the other accepts it. 0 bps is a full refund to the buyer.
    async settleBySplit(
      deal: DealEscrowRef,
      proposerWalletId: string,
      acceptorWalletId: string,
      sellerBps: number,
      op?: MutualCancelCallOptions,
    ): Promise<{ proposeTxHash: string; acceptTxHash: string }> {
      if (!isV3(deal)) return deps.v2.mutualCancel(deal.jobId, proposerWalletId, acceptorWalletId, sellerBps, op);
      const { escrow, id, dealKey } = v3Of(deal);
      return escrow.settleBySplit({
        dealKey,
        proposerWalletId,
        acceptorWalletId,
        jobId: id,
        sellerBps,
        idempotencyKeys: { propose: op?.propose?.idempotencyKey, accept: op?.accept?.idempotencyKey },
      });
    },

    /// v3 split, one step at a time, for callers that record each step as its
    /// own money-movement leg.
    async proposeSplit(deal: DealEscrowRef, walletId: string, sellerBps: number, op?: SettlementCallOptions): Promise<string> {
      const { escrow, id, dealKey } = v3Of(deal);
      return (
        await escrow.proposeSplit({ walletId, jobId: id, sellerBps, dealKey, idempotencyKey: op?.idempotencyKey, lifecycle: op?.lifecycle })
      ).txHash;
    },

    async acceptSplit(deal: DealEscrowRef, walletId: string, sellerBps: number, op?: SettlementCallOptions): Promise<string> {
      const { escrow, id, dealKey } = v3Of(deal);
      return (
        await escrow.acceptSplit({ walletId, jobId: id, sellerBps, dealKey, idempotencyKey: op?.idempotencyKey, lifecycle: op?.lifecycle })
      ).txHash;
    },

    /// The buyer takes back a v3 deal the seller never accepted.
    async cancelUnaccepted(deal: DealEscrowRef, buyerWalletId: string, op?: SettlementCallOptions): Promise<string> {
      const { escrow, id, dealKey } = v3Of(deal);
      return (
        await escrow.cancelUnaccepted({
          walletId: buyerWalletId,
          jobId: id,
          dealKey,
          idempotencyKey: op?.idempotencyKey,
          lifecycle: op?.lifecycle,
        })
      ).txHash;
    },

    /// What a refund returns to the buyer right now: on v3 the unpaid seller
    /// share plus the unreleased fee, the buyer's half included.
    refundableMicros(account: DealEscrowAccount): bigint | null {
      if (account.version !== 'v3') return null;
      return account.sellerNet - account.released + (account.feeTotal - account.feeReleased);
    },

    /// True once the last milestone is paid. The v3 wrappers already emit
    /// escrow.settled when they settle, so this only reports.
    async finalizeIfSettled(deal: DealEscrowRef): Promise<boolean> {
      if (!isV3(deal)) return deps.v2.finalizeIfSettled(deal.jobId);
      const { id } = v3Of(deal);
      return (await deps.readV3(id)).state === DEAL_STATE.Settled;
    },
  };
}

export type DealEscrowOps = ReturnType<typeof createDealEscrowOps>;
