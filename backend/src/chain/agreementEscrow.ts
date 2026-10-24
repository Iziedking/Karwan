import {
  AGREEMENT_FUND_SIGNATURE,
  agreementDealId,
  agreementTermsHash,
  agreementTermsTuple,
  type AgreementTerms,
} from './agreementTerms.js';
import {
  DEAL_STATE,
  EscrowProofError,
  type DealStateV3,
  type DealV3View,
  type EscrowBusEvent,
  type EscrowCallInput,
  type ReceiptEvent,
} from './dealEscrowV3.js';
import type { ContractCallLifecycle } from './txs.js';

/// KarwanAgreementEscrow writes and reads (view 27), behind the same seam as
/// the v3 escrow. Each step is sent from a Circle agent wallet, which reports
/// COMPLETE even when the inner call reverted, so every write is followed by a
/// read that proves the change it was meant to make before any event is
/// emitted. The live binding is in agreementEscrowLive.ts.

type Hex = `0x${string}`;

/// AgreementTypes.sol AgreementState, in declaration order.
export const AGREEMENT_STATE = {
  None: 0,
  Funded: 1,
  Accepted: 2,
  Disputed: 3,
  Settled: 4,
  Refunded: 5,
  Reclaimed: 6,
  Split: 7,
  Ruled: 8,
  Longstopped: 9,
} as const;

export interface AgreementEscrowPorts {
  address: Hex;
  chainId: number;
  execute(input: EscrowCallInput, label: string): Promise<{ txHash: string }>;
  readView(dealId: Hex): Promise<DealV3View>;
  readTerms(dealId: Hex): Promise<AgreementTerms>;
  readOwed(asset: Hex, who: Hex): Promise<bigint>;
  readSplit(dealId: Hex): Promise<{ active: boolean; sellerBps: number }>;
  receiptEvents(txHash: string): Promise<ReceiptEvent[]>;
  emit(event: EscrowBusEvent): void;
}

export interface AgreementRaw {
  deal: {
    state: number; count: number; paid: number; extUsed: number; checkPassed: boolean; lateMark: boolean; revision: number;
    deadline: bigint; deliveredAt: bigint; reviewStartAt: bigint; reviewEnd: bigint;
    sellerNet: bigint; feeTotal: bigint; released: bigint; feeReleased: bigint; termsHash: Hex;
  };
  account: { payer: Hex; payerId: bigint };
  dispute: { openedAt: bigint; proposed: boolean; escalated: boolean; proposedBps: number; proposedAt: bigint };
  panel: { reviewer: Hex };
  terms: { seller: Hex; sellerStake: bigint };
  seniorSafe: Hex;
}

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const ZERO_ADDRESS = `0x${'00'.repeat(20)}` as Hex;

/// The Agreement escrow read as the view the deal routes already understand.
/// A ruled or longstopped deal ended by division, so it reads as Split.
export function toDealView(raw: AgreementRaw): DealV3View {
  const s = raw.deal.state;
  const state = (s === AGREEMENT_STATE.Ruled || s === AGREEMENT_STATE.Longstopped ? DEAL_STATE.Split : s) as DealStateV3;
  return {
    state,
    buyer: raw.account.payer,
    seller: raw.terms.seller,
    buyerId: `0x${raw.account.payerId.toString(16).padStart(40, '0')}` as Hex,
    sellerId: ZERO_ADDRESS,
    count: raw.deal.count,
    paid: raw.deal.paid,
    extUsed: raw.deal.extUsed,
    revision: raw.deal.revision,
    checkPassed: raw.deal.checkPassed,
    lateMark: raw.deal.lateMark,
    escalated: raw.dispute.escalated,
    proposal: raw.dispute.proposed,
    senior: raw.seniorSafe !== ZERO_ADDRESS && same(raw.panel.reviewer, raw.seniorSafe),
    deliveredAt: raw.deal.deliveredAt,
    reviewStartAt: raw.deal.reviewStartAt,
    reviewEnd: raw.deal.reviewEnd,
    deadline: raw.deal.deadline,
    disputedAt: raw.dispute.openedAt,
    proposedAt: raw.dispute.proposedAt,
    proposedBps: raw.dispute.proposedBps,
    sellerNet: raw.deal.sellerNet,
    feeTotal: raw.deal.feeTotal,
    released: raw.deal.released,
    feeReleased: raw.deal.feeReleased,
    reserved: raw.terms.sellerStake,
    termsHash: raw.deal.termsHash,
  };
}

interface Op {
  walletId: string;
  idempotencyKey?: string;
  lifecycle?: ContractCallLifecycle;
  /// The deal's own id in Karwan; events are keyed to it. Defaults to the escrow id.
  dealKey?: string;
}

/// What a ruling or split in one receipt sent the seller of `dealId`.
export function sellerShareMicros(events: ReceiptEvent[], dealId: Hex): bigint {
  return events
    .filter((e) => (e.name === 'TrancheRuled' || e.name === 'SplitSettled') && e.jobId.toLowerCase() === dealId.toLowerCase())
    .reduce((sum, e) => sum + BigInt(String(e.args.toSeller ?? 0)), 0n);
}

export function createAgreementEscrow(ports: AgreementEscrowPorts) {
  async function send(op: Op, signature: string, params: unknown[], label: string) {
    const { txHash } = await ports.execute(
      {
        walletId: op.walletId,
        contractAddress: ports.address,
        abiFunctionSignature: signature,
        abiParameters: params,
        ...(op.idempotencyKey ? { idempotencyKey: op.idempotencyKey } : {}),
        ...(op.lifecycle ? { lifecycle: op.lifecycle } : {}),
      },
      label,
    );
    return txHash;
  }

  function unproven(label: string, txHash: string, details: Record<string, unknown>): never {
    throw new EscrowProofError(`${label}: Circle reported COMPLETE for ${txHash} but the escrow did not change as expected.`, { txHash, ...details });
  }

  async function write(op: Op, jobId: Hex, signature: string, params: unknown[], label: string, proof: (after: DealV3View, before: DealV3View) => boolean) {
    const before = await ports.readView(jobId);
    const txHash = await send(op, signature, params, label);
    const after = await ports.readView(jobId);
    if (!proof(after, before)) unproven(label, txHash, { jobId, state: after.state });
    return { txHash, before, after };
  }

  function emitPaid(jobId: string, txHash: string, after: DealV3View, before: DealV3View, byClaim: boolean) {
    // What this payout sent the seller, read off the escrow's running total.
    ports.emit({
      type: 'escrow.milestone.released',
      jobId,
      actor: byClaim ? 'seller' : 'buyer',
      payload: { milestoneIndex: before.paid, txHash, byClaim, sellerMicros: (after.released - before.released).toString() },
    });
    if (after.state === DEAL_STATE.Settled) {
      ports.emit({
        type: 'escrow.settled',
        jobId,
        actor: byClaim ? 'seller' : 'buyer',
        payload: { sellerTotalWei: after.released.toString(), feeTotalWei: after.feeReleased.toString() },
      });
    }
  }

  const dealIdFor = (buyer: Hex, salt: Hex): Hex => agreementDealId({ chainId: ports.chainId, escrow: ports.address, buyer, salt });

  async function proposeSplit(args: Op & { jobId: Hex; sellerBps: number }) {
    const bps = String(Math.round(args.sellerBps));
    const txHash = await send(args, 'proposeSplit(bytes32,uint16)', [args.jobId, bps], `proposeSplit(${args.jobId})`);
    const split = await ports.readSplit(args.jobId);
    if (!split.active || split.sellerBps !== Number(bps)) unproven('proposeSplit', txHash, { jobId: args.jobId });
    return { txHash };
  }

  /// What a ruling or a split sent the seller, from the escrow's own events in
  /// the receipt (the running total jumps to the whole net on a split).
  async function emitSellerShare(jobId: string, dealId: Hex, txHash: string) {
    const micros = sellerShareMicros(await ports.receiptEvents(txHash), dealId);
    if (micros > 0n) {
      ports.emit({ type: 'escrow.seller.paid', jobId, actor: 'platform', payload: { sellerMicros: micros.toString(), payoutKey: `ruling:${txHash}`, txHash } });
    }
  }

  async function acceptSplit(args: Op & { jobId: Hex; sellerBps: number }) {
    const bps = String(Math.round(args.sellerBps));
    const { txHash } = await write(args, args.jobId, 'acceptSplit(bytes32,uint16)', [args.jobId, bps], `acceptSplit(${args.jobId})`, (d) => d.state === DEAL_STATE.Split);
    ports.emit({ type: 'escrow.split', jobId: args.dealKey ?? args.jobId, actor: 'platform', payload: { sellerBps: Number(bps), txHash } });
    await emitSellerShare(args.dealKey ?? args.jobId, args.jobId, txHash);
    return { txHash };
  }

  return {
    address: ports.address,
    dealIdFor,
    proposeSplit,
    acceptSplit,
    readTerms: ports.readTerms,

    /// The buying agent funds the deal with its full terms. The id comes from
    /// the DealFunded event, never assumed, so money under another id is reported.
    async fund(args: Op & { buyer: Hex; salt: Hex; terms: AgreementTerms }) {
      const expected = dealIdFor(args.buyer, args.salt);
      const termsHash = agreementTermsHash(args.terms);
      const txHash = await send(args, AGREEMENT_FUND_SIGNATURE, [args.salt, agreementTermsTuple(args.terms)], `fund(${expected})`);
      const event = (await ports.receiptEvents(txHash)).find((e) => e.name === 'DealFunded');
      if (!event) unproven('fund', txHash, { expectedJobId: expected });
      if (!same(event.jobId, expected)) {
        throw new EscrowProofError(`fund: deal ${event.jobId} was funded instead of ${expected}; the signing wallet is not the buyer on file.`, {
          txHash, expectedJobId: expected, actualJobId: event.jobId, signer: event.args.buyer,
        });
      }
      const after = await ports.readView(expected);
      if (after.state !== DEAL_STATE.Funded || !same(after.termsHash, termsHash)) {
        unproven('fund', txHash, { jobId: expected, state: after.state, termsHash: after.termsHash });
      }
      ports.emit({ type: 'escrow.funded', jobId: args.dealKey ?? expected, actor: 'buyer', payload: { txHash, termsHash, escrowDealId: expected } });
      return { txHash, jobId: expected, termsHash };
    },

    async accept(args: Op & { jobId: Hex; termsHash: Hex }) {
      const { txHash } = await write(args, args.jobId, 'accept(bytes32,bytes32)', [args.jobId, args.termsHash], `accept(${args.jobId})`, (d) => d.state === DEAL_STATE.Accepted);
      ports.emit({ type: 'escrow.accepted', jobId: args.dealKey ?? args.jobId, actor: 'seller', payload: { txHash } });
      return { txHash };
    },

    async cancelUnaccepted(args: Op & { jobId: Hex }) {
      const { txHash } = await write(args, args.jobId, 'cancelUnaccepted(bytes32)', [args.jobId], `cancelUnaccepted(${args.jobId})`, (d) => d.state === DEAL_STATE.Refunded);
      ports.emit({ type: 'escrow.refunded', jobId: args.dealKey ?? args.jobId, actor: 'buyer', payload: { txHash } });
      return { txHash };
    },

    async markDelivered(args: Op & { jobId: Hex; proofHash: Hex }) {
      const { txHash, after } = await write(
        args, args.jobId, 'markDelivered(bytes32,bytes32)', [args.jobId, args.proofHash], `markDelivered(${args.jobId})`,
        (d, b) => d.revision > b.revision && d.deliveredAt !== 0n,
      );
      return { txHash, revision: after.revision };
    },

    async startReview(args: Op & { jobId: Hex }) {
      const { txHash } = await write(args, args.jobId, 'startReview(bytes32)', [args.jobId], `startReview(${args.jobId})`, (d) => d.reviewStartAt !== 0n);
      return { txHash };
    },

    async requestMoreTime(args: Op & { jobId: Hex }) {
      const { txHash } = await write(args, args.jobId, 'requestMoreTime(bytes32)', [args.jobId], `requestMoreTime(${args.jobId})`, (d, b) => d.extUsed > b.extUsed);
      return { txHash };
    },

    async release(args: Op & { jobId: Hex }) {
      const { txHash, after, before } = await write(args, args.jobId, 'release(bytes32)', [args.jobId], `release(${args.jobId})`, (d, b) => d.paid > b.paid);
      emitPaid(args.dealKey ?? args.jobId, txHash, after, before, false);
      return { txHash, settled: after.state === DEAL_STATE.Settled };
    },

    async claim(args: Op & { jobId: Hex }) {
      const { txHash, after, before } = await write(args, args.jobId, 'claim(bytes32)', [args.jobId], `claim(${args.jobId})`, (d, b) => d.paid > b.paid);
      emitPaid(args.dealKey ?? args.jobId, txHash, after, before, true);
      return { txHash, settled: after.state === DEAL_STATE.Settled };
    },

    async reclaim(args: Op & { jobId: Hex }) {
      const { txHash } = await write(args, args.jobId, 'reclaim(bytes32)', [args.jobId], `reclaim(${args.jobId})`, (d) => d.state === DEAL_STATE.Reclaimed);
      ports.emit({ type: 'escrow.reclaimed', jobId: args.dealKey ?? args.jobId, actor: 'buyer', payload: { txHash } });
      return { txHash };
    },

    async extendDeadline(args: Op & { jobId: Hex; newDeadline: number }) {
      const target = BigInt(Math.floor(args.newDeadline));
      const { txHash } = await write(
        args, args.jobId, 'extendDeadline(bytes32,uint64)', [args.jobId, target.toString()], `extendDeadline(${args.jobId})`,
        (d) => d.deadline === target,
      );
      return { txHash };
    },

    async dispute(args: Op & { jobId: Hex; clauseHash: Hex }) {
      const { txHash } = await write(args, args.jobId, 'dispute(bytes32,bytes32)', [args.jobId, args.clauseHash], `dispute(${args.jobId})`, (d) => d.state === DEAL_STATE.Disputed);
      return { txHash };
    },

    async escalate(args: Op & { jobId: Hex }) {
      const { txHash } = await write(args, args.jobId, 'escalate(bytes32)', [args.jobId], `escalate(${args.jobId})`, (d) => d.escalated);
      return { txHash };
    },

    async proposeRuling(args: Op & { jobId: Hex; sellerBps: number; rulingHash: Hex }) {
      const { txHash } = await write(
        args, args.jobId, 'proposeRuling(bytes32,uint16,bytes32)', [args.jobId, String(args.sellerBps), args.rulingHash], `proposeRuling(${args.jobId})`,
        (d) => d.proposal && d.proposedBps === args.sellerBps && !d.escalated,
      );
      ports.emit({ type: 'escrow.ruling.proposed', jobId: args.dealKey ?? args.jobId, actor: 'platform', payload: { sellerBps: args.sellerBps, rulingHash: args.rulingHash, txHash } });
      return { txHash };
    },

    /// A ruling on an earlier tranche pays that tranche and the deal carries on
    /// (Accepted); on the last one it ends (read as Split). Either way the dispute is closed.
    async executeRuling(args: Op & { jobId: Hex }) {
      const { txHash } = await write(args, args.jobId, 'executeRuling(bytes32)', [args.jobId], `executeRuling(${args.jobId})`, (d) => d.state !== DEAL_STATE.Disputed);
      ports.emit({ type: 'escrow.resolved', jobId: args.dealKey ?? args.jobId, actor: 'platform', payload: { txHash } });
      await emitSellerShare(args.dealKey ?? args.jobId, args.jobId, txHash);
      return { txHash };
    },

    /// Anyone applies the terms' fallback share once the reviewer misses the ruling period.
    async applyFallback(args: Op & { jobId: Hex }) {
      const { txHash } = await write(args, args.jobId, 'applyFallback(bytes32)', [args.jobId], `applyFallback(${args.jobId})`, (d) => d.state !== DEAL_STATE.Disputed);
      ports.emit({ type: 'escrow.resolved', jobId: args.dealKey ?? args.jobId, actor: 'platform', payload: { txHash, fallback: true } });
      await emitSellerShare(args.dealKey ?? args.jobId, args.jobId, txHash);
      return { txHash };
    },

    /// Collect a payout the escrow could not deliver earlier.
    async withdrawOwed(args: Op & { asset: Hex; owner: Hex }) {
      const amount = await ports.readOwed(args.asset, args.owner);
      const txHash = await send(args, 'withdrawOwed(address)', [args.asset], `withdrawOwed(${args.owner})`);
      if ((await ports.readOwed(args.asset, args.owner)) !== 0n) unproven('withdrawOwed', txHash, { owner: args.owner });
      ports.emit({ type: 'escrow.owed.withdrawn', payload: { owner: args.owner, amount: amount.toString(), txHash } });
      return { txHash, amount };
    },
  };
}

export type AgreementEscrow = ReturnType<typeof createAgreementEscrow>;
