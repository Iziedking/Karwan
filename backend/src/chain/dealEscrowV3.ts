import { dealIdV3, dealTermsHash, type DealTermsV3 } from './dealTermsV3.js';
import type { ContractCallLifecycle } from './txs.js';

/// KarwanDealEscrow (v3) writes and reads, behind one seam.
///
/// Every write goes through a Circle SCA wallet, which reports COMPLETE when the
/// outer ERC-4337 handleOps lands even if the inner call reverted
/// (karwan_erc4337_innerrevert.md). So each write is followed by a read that
/// proves the state change it was meant to make. Only then is an event emitted.
/// A missing proof throws EscrowProofError and emits nothing.
///
/// The ports make the chain, Circle and the event bus replaceable, so the proof
/// rules are tested without a network (dealEscrowV3.test.ts). The live binding
/// is in dealEscrowV3Live.ts.

type Hex = `0x${string}`;

const ZERO_ADDRESS = `0x${'00'.repeat(20)}` as Hex;

/// KarwanDealTypes.sol DealState, in declaration order.
export const DEAL_STATE = {
  None: 0,
  Funded: 1,
  Accepted: 2,
  Disputed: 3,
  Settled: 4,
  Refunded: 5,
  Reclaimed: 6,
  Split: 7,
} as const;
export type DealStateV3 = (typeof DEAL_STATE)[keyof typeof DEAL_STATE];

export interface DealV3View {
  state: DealStateV3;
  buyer: Hex;
  seller: Hex;
  buyerId: Hex;
  sellerId: Hex;
  count: number;
  paid: number;
  extUsed: number;
  revision: number;
  checkPassed: boolean;
  lateMark: boolean;
  escalated: boolean;
  proposal: boolean;
  senior: boolean;
  deliveredAt: bigint;
  reviewStartAt: bigint;
  reviewEnd: bigint;
  deadline: bigint;
  disputedAt: bigint;
  proposedAt: bigint;
  proposedBps: number;
  sellerNet: bigint;
  feeTotal: bigint;
  released: bigint;
  feeReleased: bigint;
  reserved: bigint;
  termsHash: Hex;
}

export interface ReceiptEvent {
  name: string;
  jobId: Hex;
  args: Record<string, unknown>;
}

export interface EscrowCallInput {
  walletId: string;
  contractAddress: string;
  abiFunctionSignature: string;
  abiParameters: unknown[];
  idempotencyKey?: string;
  lifecycle?: ContractCallLifecycle;
}

export interface EscrowBusEvent {
  type: string;
  jobId?: string;
  actor?: 'buyer' | 'seller' | 'platform';
  payload?: Record<string, unknown>;
}

export interface DealEscrowV3Ports {
  address: Hex;
  chainId: number;
  execute(input: EscrowCallInput, label: string): Promise<{ txHash: string }>;
  readDeal(jobId: Hex): Promise<DealV3View>;
  readOwed(owner: Hex): Promise<bigint>;
  readSplit(jobId: Hex): Promise<{ active: boolean; sellerBps: number }>;
  /// Decoded escrow events from a transaction receipt.
  receiptEvents(txHash: string): Promise<ReceiptEvent[]>;
  emit(event: EscrowBusEvent): void;
}

export class EscrowProofError extends Error {
  constructor(
    message: string,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'EscrowProofError';
  }
}

export const FUND_SIGNATURE =
  'fund(bytes32,(address,uint128,uint8[5],uint16,uint64,uint32,uint32,uint8,uint32,uint8,uint32,uint8,uint8,uint32,bytes32,bytes32))';

/// Circle takes tuple arguments as nested arrays of strings.
export function termsAsCircleTuple(t: DealTermsV3): unknown[] {
  return [
    t.seller,
    t.amount.toString(),
    t.pcts.map(String),
    String(t.reservationBps),
    t.deliveryDeadline.toString(),
    String(t.reclaimGrace),
    String(t.reviewWindow),
    String(t.reviewStarts),
    String(t.startLongstop),
    String(t.maxExtensions),
    String(t.extensionSecs),
    String(t.finalRelease),
    String(t.silenceOutcome),
    String(t.silentLongstop),
    t.checkPolicy,
    t.agreementHash,
  ];
}

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

interface Op {
  walletId: string;
  idempotencyKey?: string;
  /// MoneyMovement sink for the Circle transaction id and verified hash.
  lifecycle?: ContractCallLifecycle;
  /// The deal's own id in Karwan (share links, timelines). Events are keyed to
  /// it. Defaults to the escrow deal id.
  dealKey?: string;
}

export function createDealEscrowV3(ports: DealEscrowV3Ports) {
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
    throw new EscrowProofError(
      `${label}: Circle reported COMPLETE for ${txHash} but the escrow did not change as expected.`,
      { txHash, ...details },
    );
  }

  /// Send, then require `proof(after, before)` to hold.
  async function write(
    op: Op,
    jobId: Hex,
    signature: string,
    params: unknown[],
    label: string,
    proof: (after: DealV3View, before: DealV3View) => boolean,
  ) {
    const before = await ports.readDeal(jobId);
    const txHash = await send(op, signature, params, label);
    const after = await ports.readDeal(jobId);
    if (!proof(after, before)) unproven(label, txHash, { jobId, state: after.state });
    return { txHash, before, after };
  }

  function emitPaid(jobId: string, txHash: string, after: DealV3View, before: DealV3View, byClaim: boolean) {
    ports.emit({
      type: 'escrow.milestone.released',
      jobId,
      actor: byClaim ? 'seller' : 'buyer',
      payload: { milestoneIndex: before.paid, txHash, byClaim },
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

  /// The id the escrow will give this buyer's deal for `salt`.
  function dealIdFor(buyer: Hex, salt: Hex): Hex {
    return dealIdV3({ chainId: ports.chainId, escrow: ports.address, buyer, salt });
  }

  return {
    address: ports.address,
    dealIdFor,

    /// The buyer funds the deal with its full terms. The id is read from the
    /// DealFunded event in the receipt, never assumed: if the signing wallet is
    /// not the buyer address we have on file, the money sits under another id,
    /// and that id is reported so it can be reconciled.
    async fund(args: Op & { buyer: Hex; salt: Hex; terms: DealTermsV3 }) {
      const expected = dealIdFor(args.buyer, args.salt);
      const termsHash = dealTermsHash(args.terms);
      const txHash = await send(
        args,
        FUND_SIGNATURE,
        [args.salt, termsAsCircleTuple(args.terms)],
        `fund(${expected})`,
      );
      const event = (await ports.receiptEvents(txHash)).find((e) => e.name === 'DealFunded');
      if (!event) unproven('fund', txHash, { expectedJobId: expected });
      if (!same(event.jobId, expected)) {
        throw new EscrowProofError(
          `fund: deal ${event.jobId} was funded instead of ${expected}; the signing wallet is not the buyer on file.`,
          { txHash, expectedJobId: expected, actualJobId: event.jobId, signer: event.args.buyer },
        );
      }
      const after = await ports.readDeal(expected);
      if (after.state !== DEAL_STATE.Funded || !same(after.termsHash, termsHash)) {
        unproven('fund', txHash, { jobId: expected, state: after.state, termsHash: after.termsHash });
      }
      ports.emit({
        type: 'escrow.funded',
        jobId: args.dealKey ?? expected,
        actor: 'buyer',
        payload: { txHash, termsHash, escrowDealId: expected },
      });
      return { txHash, jobId: expected, termsHash };
    },

    async accept(args: Op & { jobId: Hex; termsHash: Hex }) {
      const { txHash } = await write(
        args, args.jobId, 'accept(bytes32,bytes32)', [args.jobId, args.termsHash], `accept(${args.jobId})`,
        (d) => d.state === DEAL_STATE.Accepted,
      );
      ports.emit({ type: 'escrow.accepted', jobId: args.dealKey ?? args.jobId, actor: 'seller', payload: { txHash } });
      return { txHash };
    },

    async cancelUnaccepted(args: Op & { jobId: Hex }) {
      const { txHash } = await write(
        args, args.jobId, 'cancelUnaccepted(bytes32)', [args.jobId], `cancelUnaccepted(${args.jobId})`,
        (d) => d.state === DEAL_STATE.Refunded,
      );
      ports.emit({ type: 'escrow.refunded', jobId: args.dealKey ?? args.jobId, actor: 'buyer', payload: { txHash } });
      return { txHash };
    },

    async markDelivered(args: Op & { jobId: Hex; proofHash: Hex }) {
      const { txHash, after } = await write(
        args, args.jobId, 'markDelivered(bytes32,bytes32)', [args.jobId, args.proofHash],
        `markDelivered(${args.jobId})`,
        (d, b) => d.revision > b.revision && d.deliveredAt !== 0n,
      );
      return { txHash, revision: after.revision };
    },

    async startReview(args: Op & { jobId: Hex }) {
      return write(
        args, args.jobId, 'startReview(bytes32)', [args.jobId], `startReview(${args.jobId})`,
        (d) => d.reviewStartAt !== 0n,
      ).then(({ txHash }) => ({ txHash }));
    },

    /// A pass is visible in state. A fail changes no state by design, so it is
    /// proven by its CheckAttested event for this revision.
    async attestCheck(args: Op & { jobId: Hex; revision: number; pass: boolean; evidenceHash: Hex }) {
      const label = `attestCheck(${args.jobId}, ${args.pass})`;
      const txHash = await send(
        args, 'attestCheck(bytes32,uint32,bool,bytes32)',
        [args.jobId, String(args.revision), args.pass, args.evidenceHash], label,
      );
      if (args.pass) {
        const d = await ports.readDeal(args.jobId);
        if (!d.checkPassed || d.revision !== args.revision) unproven(label, txHash, { jobId: args.jobId });
      } else {
        const ev = (await ports.receiptEvents(txHash)).find(
          (e) => e.name === 'CheckAttested' && same(e.jobId, args.jobId) && Number(e.args.revision) === args.revision,
        );
        if (!ev) unproven(label, txHash, { jobId: args.jobId });
      }
      ports.emit({
        type: 'security.attested',
        jobId: args.dealKey ?? args.jobId,
        actor: 'platform',
        payload: { pass: args.pass, revision: args.revision, evidenceHash: args.evidenceHash, txHash },
      });
      return { txHash };
    },

    async requestMoreTime(args: Op & { jobId: Hex }) {
      const { txHash } = await write(
        args, args.jobId, 'requestMoreTime(bytes32)', [args.jobId], `requestMoreTime(${args.jobId})`,
        (d, b) => d.extUsed > b.extUsed,
      );
      return { txHash };
    },

    async release(args: Op & { jobId: Hex }) {
      const { txHash, after, before } = await write(
        args, args.jobId, 'release(bytes32)', [args.jobId], `release(${args.jobId})`,
        (d, b) => d.paid > b.paid,
      );
      emitPaid(args.dealKey ?? args.jobId, txHash, after, before, false);
      return { txHash, settled: after.state === DEAL_STATE.Settled };
    },

    async claim(args: Op & { jobId: Hex }) {
      const { txHash, after, before } = await write(
        args, args.jobId, 'claim(bytes32,address)', [args.jobId, ZERO_ADDRESS], `claim(${args.jobId})`,
        (d, b) => d.paid > b.paid,
      );
      emitPaid(args.dealKey ?? args.jobId, txHash, after, before, true);
      return { txHash, settled: after.state === DEAL_STATE.Settled };
    },

    async reclaim(args: Op & { jobId: Hex }) {
      const { txHash } = await write(
        args, args.jobId, 'reclaim(bytes32,address)', [args.jobId, ZERO_ADDRESS], `reclaim(${args.jobId})`,
        (d) => d.state === DEAL_STATE.Reclaimed,
      );
      ports.emit({ type: 'escrow.reclaimed', jobId: args.dealKey ?? args.jobId, actor: 'buyer', payload: { txHash } });
      return { txHash };
    },

    async extendDeadline(args: Op & { jobId: Hex; newDeadline: number }) {
      const target = BigInt(Math.floor(args.newDeadline));
      const { txHash } = await write(
        args, args.jobId, 'extendDeadline(bytes32,uint64)', [args.jobId, target.toString()],
        `extendDeadline(${args.jobId})`,
        (d) => d.deadline === target,
      );
      return { txHash };
    },

    async dispute(args: Op & { jobId: Hex; reasonHash: Hex }) {
      const { txHash } = await write(
        args, args.jobId, 'dispute(bytes32,bytes32)', [args.jobId, args.reasonHash], `dispute(${args.jobId})`,
        (d) => d.state === DEAL_STATE.Disputed,
      );
      return { txHash };
    },

    async lapseDispute(args: Op & { jobId: Hex }) {
      const { txHash } = await write(
        args, args.jobId, 'lapseDispute(bytes32)', [args.jobId], `lapseDispute(${args.jobId})`,
        (d) => d.state === DEAL_STATE.Accepted,
      );
      return { txHash };
    },

    async escalate(args: Op & { jobId: Hex }) {
      const { txHash } = await write(
        args, args.jobId, 'escalate(bytes32)', [args.jobId], `escalate(${args.jobId})`,
        (d) => d.escalated,
      );
      return { txHash };
    },

    async proposeRuling(args: Op & { jobId: Hex; sellerBps: number; rulingHash: Hex }) {
      const { txHash } = await write(
        args, args.jobId, 'proposeRuling(bytes32,uint16,bytes32)',
        [args.jobId, String(args.sellerBps), args.rulingHash], `proposeRuling(${args.jobId})`,
        (d) => d.proposal && d.proposedBps === args.sellerBps && !d.escalated,
      );
      ports.emit({
        type: 'escrow.ruling.proposed',
        jobId: args.dealKey ?? args.jobId,
        actor: 'platform',
        payload: { sellerBps: args.sellerBps, rulingHash: args.rulingHash, txHash },
      });
      return { txHash };
    },

    async executeRuling(args: Op & { jobId: Hex }) {
      const { txHash } = await write(
        args, args.jobId, 'executeRuling(bytes32)', [args.jobId], `executeRuling(${args.jobId})`,
        (d) => d.state === DEAL_STATE.Split,
      );
      ports.emit({ type: 'escrow.resolved', jobId: args.dealKey ?? args.jobId, actor: 'platform', payload: { txHash } });
      return { txHash };
    },

    /// Settle by consent: one side proposes a split of the unpaid amount, the
    /// other accepts the same number. 0 bps is a full refund to the buyer.
    async settleBySplit(args: {
      dealKey?: string;
      proposerWalletId: string;
      acceptorWalletId: string;
      jobId: Hex;
      sellerBps: number;
      idempotencyKeys?: { propose?: string; accept?: string };
    }) {
      const bps = String(Math.round(args.sellerBps));
      const proposeTx = await send(
        { walletId: args.proposerWalletId, idempotencyKey: args.idempotencyKeys?.propose },
        'proposeSplit(bytes32,uint16)', [args.jobId, bps], `proposeSplit(${args.jobId})`,
      );
      const split = await ports.readSplit(args.jobId);
      if (!split.active || split.sellerBps !== Number(bps)) {
        unproven('proposeSplit', proposeTx, { jobId: args.jobId });
      }
      const { txHash: acceptTx } = await write(
        { walletId: args.acceptorWalletId, idempotencyKey: args.idempotencyKeys?.accept },
        args.jobId, 'acceptSplit(bytes32,uint16)', [args.jobId, bps], `acceptSplit(${args.jobId})`,
        (d) => d.state === DEAL_STATE.Split,
      );
      ports.emit({
        type: 'escrow.split',
        jobId: args.dealKey ?? args.jobId,
        actor: 'platform',
        payload: { sellerBps: Number(bps), proposeTxHash: proposeTx, acceptTxHash: acceptTx },
      });
      return { proposeTxHash: proposeTx, acceptTxHash: acceptTx };
    },

    /// Collect a payout the escrow could not deliver earlier.
    async withdrawOwed(args: Op & { owner: Hex }) {
      const amount = await ports.readOwed(args.owner);
      const txHash = await send(args, 'withdrawOwed()', [], `withdrawOwed(${args.owner})`);
      if ((await ports.readOwed(args.owner)) !== 0n) unproven('withdrawOwed', txHash, { owner: args.owner });
      ports.emit({ type: 'escrow.owed.withdrawn', payload: { owner: args.owner, amount: amount.toString(), txHash } });
      return { txHash, amount };
    },
  };
}

export type DealEscrowV3 = ReturnType<typeof createDealEscrowV3>;
