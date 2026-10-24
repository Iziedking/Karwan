import { ESCROW_STATE, type EscrowAccount } from '../chain/contracts.js';
import type { AgreementEscrow } from '../chain/agreementEscrow.js';
import { agreementTermsHash, reviveAgreementTerms, type StoredAgreementTerms } from '../chain/agreementTerms.js';
import { DEAL_STATE, type DealEscrowV3, type DealStateV3, type DealV3View } from '../chain/dealEscrowV3.js';
import { keccak256, toBytes } from 'viem';
import type { MutualCancelCallOptions, SettlementCallOptions } from '../chain/settlement.js';
import { reviveTerms, type StoredTermsV3 } from './fundDirectV3.js';

/// One set of escrow operations for a deal, whichever escrow holds its money.
/// A deal row records its escrow (escrowVersion); routes and watchers call
/// these instead of the v2 wrappers directly, so each deal finishes on the
/// escrow it started on: v2, the v3 escrow, or the escrow family's Agreement
/// escrow ('suite', view 27).
///
/// Reads come back in the v2 EscrowAccount shape the rest of the backend
/// already understands, with the precise view attached for callers that need
/// it (a Reclaimed or Split deal maps to Refunded or Settled).

type Hex = `0x${string}`;

export interface DealEscrowRef {
  jobId: string;
  escrowVersion?: 'v2' | 'v3' | 'suite';
  escrowDealId?: string;
  escrowTerms?: StoredTermsV3 | StoredAgreementTerms;
  escrowTermsHash?: string;
  /// The seller's account address; a suite accept checks their record first.
  seller?: string;
}

export type DealEscrowAccount = EscrowAccount & {
  version: 'v2' | 'v3' | 'suite';
  /// v3 and suite: the escrow's own view of the deal.
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

/// A suite deal read in the same shape. Tranches are kept in basis points on
/// chain; the routes count milestones in whole percents.
export function accountFromSuite(view: DealV3View, stored: StoredAgreementTerms, reviewEnd: bigint): DealEscrowAccount {
  const terms = reviveAgreementTerms(stored);
  return {
    version: 'suite',
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
    milestonePcts: terms.trancheBps.filter((b) => b > 0).map((b) => b / 100),
    milestonesReleased: view.paid,
    state: V3_TO_V2_STATE[view.state],
    reservationBps: 0,
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
  /// The escrow family's Agreement escrow, or null where it is not set up.
  suite?: {
    escrow: AgreementEscrow;
    readView(dealId: Hex): Promise<DealV3View>;
    readReviewEnd(dealId: Hex): Promise<bigint>;
    /// Throws IdentityNeeded when the person has no record yet (Task 7).
    requireIdentity?: (userAddress: string, role: 'buyer' | 'seller') => Promise<void>;
    /// Reports a delivery check signed by two of Karwan's three checkers (Task 9).
    submitCheck?: (dealId: Hex, revision: number, pass: boolean, evidenceHash: Hex) => Promise<string | null>;
  } | null;
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

/// On the v3 escrow or the escrow family, rather than the v2 escrow the older
/// financing contracts point at.
export function onOwnIdEscrow(deal: { escrowVersion?: string }): boolean {
  return deal.escrowVersion === 'v3' || deal.escrowVersion === 'suite';
}

type Family =
  | { kind: 'v3'; escrow: DealEscrowV3; id: Hex; dealKey: string }
  | { kind: 'suite'; escrow: AgreementEscrow; id: Hex; dealKey: string };

export class NothingDelivered extends Error {
  constructor() {
    super('Nothing has been delivered yet, so there is nothing to dispute. If the deadline passes without a delivery, the buyer can take the money back.');
  }
}

export function createDealEscrowOps(deps: DealEscrowOpsDeps) {
  /// On an escrow with its own deal id and on-chain rules: the v3 escrow or the
  /// escrow family. Every caller that branches away from the v2 flows asks this.
  function isV3(deal: DealEscrowRef): boolean {
    return deal.escrowVersion === 'v3' || deal.escrowVersion === 'suite';
  }

  function isSuite(deal: DealEscrowRef): boolean {
    return deal.escrowVersion === 'suite';
  }

  function familyOf(deal: DealEscrowRef): Family {
    const name = isSuite(deal) ? 'escrow family' : 'v3 escrow';
    if (!deal.escrowDealId || !deal.escrowTerms) {
      throw new Error(`deal ${deal.jobId} is on the ${name} but has no escrow deal id on record`);
    }
    const id = deal.escrowDealId as Hex;
    if (isSuite(deal)) {
      if (!deps.suite) throw new Error(`deal ${deal.jobId} is on the ${name}, which is not configured here`);
      return { kind: 'suite', escrow: deps.suite.escrow, id, dealKey: deal.jobId };
    }
    if (!deps.v3) throw new Error(`deal ${deal.jobId} is on the ${name}, which is not configured here`);
    return { kind: 'v3', escrow: deps.v3, id, dealKey: deal.jobId };
  }

  function v3Escrow(deal: DealEscrowRef): { escrow: DealEscrowV3; id: Hex; dealKey: string } {
    const f = familyOf(deal);
    if (f.kind !== 'v3') throw new Error(`deal ${deal.jobId} is not on the v3 escrow`);
    return f;
  }

  function readView(f: Family): Promise<DealV3View> {
    return f.kind === 'suite' ? deps.suite!.readView(f.id) : deps.readV3(f.id);
  }

  async function read(deal: DealEscrowRef): Promise<DealEscrowAccount> {
    if (!isV3(deal)) {
      deps.v2.invalidate(deal.jobId);
      return { ...(await deps.v2.readEscrow(deal.jobId)), version: 'v2' };
    }
    const f = familyOf(deal);
    if (f.kind === 'suite') {
      const [view, reviewEnd] = await Promise.all([deps.suite!.readView(f.id), deps.suite!.readReviewEnd(f.id)]);
      return accountFromSuite(view, deal.escrowTerms as StoredAgreementTerms, reviewEnd);
    }
    const [view, reviewEnd] = await Promise.all([deps.readV3(f.id), deps.readV3ReviewEnd(f.id)]);
    return accountFromV3(view, deal.escrowTerms as StoredTermsV3, reviewEnd);
  }

  async function nextMilestone(deal: DealEscrowRef, index: number): Promise<void> {
    const view = await readView(familyOf(deal));
    if (view.paid !== index) {
      throw new Error(`milestone ${index} is not next on deal ${deal.jobId}: ${view.paid} already paid`);
    }
  }

  return {
    isV3,
    isSuite,
    read,

    /// Whether the chain runs this deal's delivery and review clocks: always on
    /// v3, and on v2 only with the v2b escrow.
    usesOnChainClock(deal: DealEscrowRef): boolean {
      return isV3(deal) || deps.v2OnChainClock;
    },

    async accept(deal: DealEscrowRef, sellerWalletId: string, op?: SettlementCallOptions): Promise<string> {
      if (!isV3(deal)) return deps.v2.accept(deal.jobId, sellerWalletId, op);
      const f = familyOf(deal);
      const { escrow, id, dealKey } = f;
      if (f.kind === 'suite' && deal.seller) await deps.suite!.requireIdentity?.(deal.seller, 'seller');
      // On the escrow family the seller accepts the terms the escrow holds, read back here.
      const termsHash = f.kind === 'suite' ? agreementTermsHash(await f.escrow.readTerms(id)) : (deal.escrowTermsHash as Hex);
      const r = await escrow.accept({
        walletId: sellerWalletId,
        jobId: id,
        termsHash,
        dealKey,
        idempotencyKey: op?.idempotencyKey,
        lifecycle: op?.lifecycle,
      });
      return r.txHash;
    },

    async markDelivered(deal: DealEscrowRef, proofHash: string, sellerWalletId: string): Promise<string> {
      if (!isV3(deal)) return deps.v2.markDelivered(deal.jobId, proofHash, sellerWalletId);
      const { escrow, id, dealKey } = familyOf(deal);
      return (await escrow.markDelivered({ walletId: sellerWalletId, jobId: id, proofHash: proofHash as Hex, dealKey })).txHash;
    },

    /// Best-effort, like the v2 guardian calls: a guardian action never blocks
    /// delivery or settlement. A v3 attestation names the delivery revision it
    /// checked, read from the chain here.
    async attestDelivery(deal: DealEscrowRef, milestoneIndex: number, pass: boolean, evidenceHash: string) {
      if (!isV3(deal)) return deps.v2.attest(deal.jobId, milestoneIndex, pass, evidenceHash);
      if (isSuite(deal)) {
        try {
          const f = familyOf(deal);
          if (!deps.suite?.submitCheck) return null;
          const view = await readView(f);
          return await deps.suite.submitCheck(f.id, view.revision, pass, evidenceHash as Hex);
        } catch (err) {
          deps.warn({ jobId: deal.jobId, err: (err as Error).message }, 'suite check report failed (non-blocking)');
          return null;
        }
      }
      if (!deps.guardianWalletId) return null;
      try {
        const { escrow, id, dealKey } = v3Escrow(deal);
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
      if (isSuite(deal)) {
        // On the family only the guardian Safe holds a deal; the backend never does.
        deps.warn({ jobId: deal.jobId }, 'suite hold skipped: only the guardian Safe holds a family deal');
        return null;
      }
      if (!deps.guardianWalletId) return null;
      try {
        const { escrow, id, dealKey } = v3Escrow(deal);
        return (await escrow.hold({ walletId: deps.guardianWalletId, jobId: id, reasonHash: reasonHash as Hex, dealKey })).txHash;
      } catch (err) {
        deps.warn({ jobId: deal.jobId, err: (err as Error).message }, 'v3 hold failed (non-blocking)');
        return null;
      }
    },

    async releaseHold(deal: DealEscrowRef) {
      if (!isV3(deal)) return deps.v2.releaseHold(deal.jobId);
      if (isSuite(deal)) {
        deps.warn({ jobId: deal.jobId }, 'suite releaseHold skipped: only the guardian Safe holds a family deal');
        return null;
      }
      if (!deps.guardianWalletId) return null;
      try {
        const { escrow, id, dealKey } = v3Escrow(deal);
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
      const f = familyOf(deal);
      const { escrow, id, dealKey } = f;
      const view = await readView(f);
      if (view.reviewStartAt !== 0n || view.deliveredAt === 0n) return null;
      return (await escrow.startReview({ walletId: buyerWalletId, jobId: id, dealKey })).txHash;
    },

    async requestMoreTime(deal: DealEscrowRef, buyerWalletId: string): Promise<string | null> {
      if (!isV3(deal)) return null;
      const { escrow, id, dealKey } = familyOf(deal);
      return (await escrow.requestMoreTime({ walletId: buyerWalletId, jobId: id, dealKey })).txHash;
    },

    async release(deal: DealEscrowRef, index: number, buyerWalletId: string, op?: SettlementCallOptions): Promise<string> {
      if (!isV3(deal)) return deps.v2.release(deal.jobId, index, buyerWalletId, op);
      await nextMilestone(deal, index);
      const { escrow, id, dealKey } = familyOf(deal);
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
      const { escrow, id, dealKey } = familyOf(deal);
      return (await escrow.claim({ walletId: sellerWalletId, jobId: id, dealKey })).txHash;
    },

    async extendDeadline(deal: DealEscrowRef, buyerWalletId: string, deadlineUnix: number): Promise<string> {
      if (!isV3(deal)) return deps.v2.extendDeadline(deal.jobId, buyerWalletId, deadlineUnix);
      const { escrow, id, dealKey } = familyOf(deal);
      return (await escrow.extendDeadline({ walletId: buyerWalletId, jobId: id, newDeadline: deadlineUnix, dealKey })).txHash;
    },

    async reclaim(deal: DealEscrowRef, buyerWalletId: string, op?: SettlementCallOptions): Promise<string> {
      if (!isV3(deal)) return deps.v2.reclaim(deal.jobId, buyerWalletId, op);
      const { escrow, id, dealKey } = familyOf(deal);
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
      const f = familyOf(deal);
      const hash = keccak256(toBytes(reason));
      if (f.kind === 'suite') {
        // The escrow family disputes a delivery; with nothing delivered the buyer takes the money back after the deadline.
        if ((await readView(f)).deliveredAt === 0n) throw new NothingDelivered();
        return (await f.escrow.dispute({ walletId, jobId: f.id, clauseHash: hash, dealKey: f.dealKey })).txHash;
      }
      return (await f.escrow.dispute({ walletId, jobId: f.id, reasonHash: hash, dealKey: f.dealKey })).txHash;
    },

    /// A party sends an open dispute to people: on the escrow family, the buyer's
    /// answer to a proposal inside its 72 hours.
    async escalate(deal: DealEscrowRef, walletId: string): Promise<string> {
      if (!isV3(deal)) throw new Error(`deal ${deal.jobId} is not on an escrow with escalation`);
      const f = familyOf(deal);
      return (await f.escrow.escalate({ walletId, jobId: f.id, dealKey: f.dealKey })).txHash;
    },

    async lapseDispute(deal: DealEscrowRef, walletId: string): Promise<string> {
      if (!isV3(deal)) return deps.v2.lapseDispute(deal.jobId, walletId);
      if (isSuite(deal)) throw new Error(`deal ${deal.jobId} is on the escrow family, where a dispute ends by a ruling, not by lapsing`);
      const { escrow, id, dealKey } = v3Escrow(deal);
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
      const f = familyOf(deal);
      if (f.kind === 'suite') {
        const { txHash: proposeTxHash } = await f.escrow.proposeSplit({
          walletId: proposerWalletId, jobId: f.id, sellerBps, dealKey: f.dealKey, idempotencyKey: op?.propose?.idempotencyKey,
        });
        const { txHash: acceptTxHash } = await f.escrow.acceptSplit({
          walletId: acceptorWalletId, jobId: f.id, sellerBps, dealKey: f.dealKey, idempotencyKey: op?.accept?.idempotencyKey,
        });
        return { proposeTxHash, acceptTxHash };
      }
      const { escrow, id, dealKey } = f;
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
      const { escrow, id, dealKey } = familyOf(deal);
      return (
        await escrow.proposeSplit({ walletId, jobId: id, sellerBps, dealKey, idempotencyKey: op?.idempotencyKey, lifecycle: op?.lifecycle })
      ).txHash;
    },

    async acceptSplit(deal: DealEscrowRef, walletId: string, sellerBps: number, op?: SettlementCallOptions): Promise<string> {
      const { escrow, id, dealKey } = familyOf(deal);
      return (
        await escrow.acceptSplit({ walletId, jobId: id, sellerBps, dealKey, idempotencyKey: op?.idempotencyKey, lifecycle: op?.lifecycle })
      ).txHash;
    },

    /// The buyer takes back a v3 deal the seller never accepted.
    async cancelUnaccepted(deal: DealEscrowRef, buyerWalletId: string, op?: SettlementCallOptions): Promise<string> {
      const { escrow, id, dealKey } = familyOf(deal);
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
      if (account.version === 'v2') return null;
      return account.sellerNet - account.released + (account.feeTotal - account.feeReleased);
    },

    /// True once the last milestone is paid. The v3 wrappers already emit
    /// escrow.settled when they settle, so this only reports.
    async finalizeIfSettled(deal: DealEscrowRef): Promise<boolean> {
      if (!isV3(deal)) return deps.v2.finalizeIfSettled(deal.jobId);
      return (await readView(familyOf(deal))).state === DEAL_STATE.Settled;
    },
  };
}

export type DealEscrowOps = ReturnType<typeof createDealEscrowOps>;
