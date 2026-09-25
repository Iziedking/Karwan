import { formatUnits, keccak256, parseUnits, toBytes } from 'viem';
import { DEAL_STATE, EscrowProofError, type DealEscrowV3, type DealV3View } from '../chain/dealEscrowV3.js';
import {
  buildDealTerms,
  DealTermsError,
  dealTermsHash,
  type DealShape,
  type DealTermsLimits,
  type DealTermsV3,
} from '../chain/dealTermsV3.js';
import type { ContractCallLifecycle } from '../chain/txs.js';
import type { PlanMovementLegInput } from '../money/model.js';

/// Funding a direct deal on KarwanDealEscrow (v3): the buyer agent approves and
/// funds with the full terms, then the seller agent accepts the same terms hash.
///
/// Same guarantees as the v2 route, kept in one testable place:
/// - intent (escrow version, deal id, salt, terms) is saved before any
///   transaction, and the salt is fixed per deal, so a retry after a crash
///   targets the same escrow deal and can never fund twice;
/// - every refusal the chain would make (terms, quote, stake, balance) happens
///   before money moves;
/// - a Circle COMPLETE is never taken as success: the wrappers prove each step
///   on-chain, and a failure leaves the money movement flagged for reconciling;
/// - a resumed attempt reads the chain first and only does what is missing.

type Hex = `0x${string}`;

const USDC_DECIMALS = 6;
const BPS = 10_000n;

/// Delivery-check policy the guardian attests under (GitHub and document checks,
/// version 1). A new check pipeline gets a new id; deals keep the one they funded with.
export const CHECK_POLICY_V1: Hex = keccak256(toBytes('karwan-delivery-check:v1'));

export type EscrowVersion = 'v2' | 'v3';

/// Which escrow a deal funds on. A deal never changes escrow once anything
/// happened on one: a stamped version wins, and an unstamped deal with a v2
/// escrow or an earlier attempt stays on v2 (v3 always stamps before it acts).
export function chooseFundingEscrow(
  deal: { escrowVersion?: EscrowVersion },
  ctx: { v3Enabled: boolean; v2EscrowExists: boolean; priorAttempt: boolean },
): EscrowVersion {
  if (deal.escrowVersion) return deal.escrowVersion;
  if (ctx.v2EscrowExists || ctx.priorAttempt) return 'v2';
  return ctx.v3Enabled ? 'v3' : 'v2';
}

export function dealShapeV3(deal: {
  tradeType?: 'service' | 'goods' | 'mixed';
  evidenceRequired?: boolean;
}): { shape: DealShape; checkPolicy?: Hex } {
  if (deal.tradeType === 'goods' || deal.tradeType === 'mixed') return { shape: 'goods' };
  if (deal.evidenceRequired) return { shape: 'checked', checkPolicy: CHECK_POLICY_V1 };
  return { shape: 'service' };
}

export function fundingSaltV3(jobId: string): Hex {
  return keccak256(toBytes(`karwan-deal-v3:${jobId}`));
}

export type StoredTermsV3 = Omit<DealTermsV3, 'amount' | 'deliveryDeadline'> & {
  amount: string;
  deliveryDeadline: string;
};

export function storeTerms(t: DealTermsV3): StoredTermsV3 {
  return { ...t, amount: t.amount.toString(), deliveryDeadline: t.deliveryDeadline.toString() };
}

export function reviveTerms(t: StoredTermsV3): DealTermsV3 {
  return { ...t, amount: BigInt(t.amount), deliveryDeadline: BigInt(t.deliveryDeadline) };
}

export interface FundDirectV3Deps {
  escrow: DealEscrowV3;
  readDeal(jobId: Hex): Promise<DealV3View>;
  readLimits(nowSecs: number): Promise<DealTermsLimits>;
  readFeeBps(): Promise<number>;
  readFreeStake(owner: Hex): Promise<bigint>;
  readUsdcBalance(owner: Hex): Promise<bigint>;
  readUsdcAllowance(owner: Hex, spender: Hex): Promise<bigint>;
  approveUsdc(input: {
    walletId: string;
    spender: Hex;
    amount: bigint;
    idempotencyKey: string;
    lifecycle?: ContractCallLifecycle;
  }): Promise<void>;
  movements: {
    ensure(input: {
      operationKey: string;
      amountMicros: bigint;
      buyer: string;
      seller: string;
      jobId: string;
    }): Promise<{ reference: string; amountMicros: string }>;
    prepareLeg(
      reference: string,
      leg: PlanMovementLegInput,
    ): Promise<{ legId: string; idempotencyKey: string; lifecycle?: ContractCallLifecycle }>;
    verifyLeg(reference: string, legId: string): Promise<void>;
    needsAttention(reference: string, code: string, nextActor: 'buyer' | 'seller' | 'karwan'): Promise<void>;
    complete(reference: string, patch: { amountMicros: bigint; summary: string }): Promise<void>;
  };
  patchDeal(jobId: string, patch: Record<string, unknown>): Promise<void>;
  emit(event: { type: string; jobId: string; actor: 'buyer' | 'seller' | 'platform'; payload: Record<string, unknown> }): void;
  now(): number;
}

export interface FundDirectV3Input {
  jobId: string;
  deal: {
    buyer: string;
    seller: string;
    dealAmountUsdc: string;
    createdAt: number;
    deadlineUnix?: number | null;
    requireStake?: boolean;
    requireStakePct?: number;
    tradeType?: 'service' | 'goods' | 'mixed';
    evidenceRequired?: boolean;
    /// agreementDigest(deal): the sha256 hex both parties consented to.
    agreementDigest: string;
    acceptedAt?: number;
    escrowDealId?: string;
    escrowTerms?: StoredTermsV3;
    escrowTermsHash?: string;
    fundTxHash?: string;
  };
  buyerAgent: { walletId: string; address: Hex };
  sellerAgent: { walletId: string; address: Hex };
  milestonePcts: number[];
  /// The total the buyer confirmed on the funding quote, in USDC micros.
  authorizedTotalMicros: bigint;
  operationKey: string;
}

export interface FundDirectV3Result {
  status: 200 | 409 | 502;
  body: Record<string, unknown>;
}

function fundedTotal(amount: bigint, feeBps: number): bigint {
  const fee = (amount * BigInt(feeBps)) / BPS;
  return amount + fee / 2n;
}

function usdc(micros: bigint): string {
  return formatUnits(micros, USDC_DECIMALS);
}

export async function fundDirectDealV3(deps: FundDirectV3Deps, input: FundDirectV3Input): Promise<FundDirectV3Result> {
  const ctx: { reference?: string } = {};
  try {
    return await fundDirectDealV3Steps(deps, input, ctx);
  } catch (err) {
    // Unexpected failures (Circle unreachable, a revert with a reason) reach
    // the route's handler, which flags the movement: it needs the reference.
    if (ctx.reference && err && typeof err === 'object') Object.assign(err, { movementReference: ctx.reference });
    throw err;
  }
}

async function fundDirectDealV3Steps(
  deps: FundDirectV3Deps,
  input: FundDirectV3Input,
  ctx: { reference?: string },
): Promise<FundDirectV3Result> {
  const { jobId, deal, buyerAgent, sellerAgent } = input;
  const escrowAddress = deps.escrow.address as Hex;

  // ------------------------------------------------------------------ resume
  let terms: DealTermsV3;
  let escrowDealId: Hex;
  let reference: string;
  let funded: bigint;
  let fundTxHash = deal.fundTxHash;

  if (deal.escrowDealId && deal.escrowTerms) {
    escrowDealId = deal.escrowDealId as Hex;
    terms = reviveTerms(deal.escrowTerms);
    const onChain = await deps.readDeal(escrowDealId);
    // The contract charges the fee in force when the deal is funded, so a
    // total is recomputed from the stored terms and the current fee.
    const total = fundedTotal(terms.amount, await deps.readFeeBps());
    const movement = await deps.movements.ensure({
      operationKey: input.operationKey,
      amountMicros: total,
      buyer: deal.buyer,
      seller: deal.seller,
      jobId,
    });
    reference = movement.reference;
    ctx.reference = reference;
    funded = BigInt(movement.amountMicros) > 0n ? BigInt(movement.amountMicros) : total;
    if (onChain.state === DEAL_STATE.Accepted) {
      return finalize(deps, input, { reference, funded, escrowDealId, fundTxHash, recovered: true });
    }
    if (onChain.state === DEAL_STATE.Funded) {
      if (onChain.termsHash.toLowerCase() !== (deal.escrowTermsHash ?? '').toLowerCase()) {
        await deps.movements.needsAttention(reference, 'ESCROW_MISMATCH', 'karwan');
        return { status: 409, body: { error: 'the protected funds do not match this deal', code: 'ESCROW_MISMATCH' } };
      }
      return activate(deps, input, { reference, funded, escrowDealId, terms, fundTxHash });
    }
    if (onChain.state !== DEAL_STATE.None) {
      return {
        status: 409,
        body: { error: 'this escrow deal is already closed', code: 'ESCROW_CLOSED', escrowDealId },
      };
    }
    // Nothing on-chain yet: the earlier attempt never landed. Fund with the
    // stored terms, so the id and hash stay the ones already on record.
    funded = total;
    if (input.authorizedTotalMicros !== funded) {
      return {
        status: 409,
        body: { error: 'the funding total changed before confirmation', code: 'QUOTE_CHANGED', expectedTotalUsdc: usdc(funded) },
      };
    }
  } else {
    // ---------------------------------------------------------------- fresh
    const nowSecs = Math.floor(deps.now() / 1000);
    const [limits, feeBps] = await Promise.all([deps.readLimits(nowSecs), deps.readFeeBps()]);

    // The delivery window starts when the money is protected, not when the
    // deal was first opened. On v3 the deadline is part of the signed terms,
    // so it is fixed here, before funding.
    let deadlineUnix: number | null = null;
    if (deal.deadlineUnix != null) {
      const window = deal.deadlineUnix - Math.floor(deal.createdAt / 1000);
      deadlineUnix = window > 0 ? nowSecs + window : deal.deadlineUnix;
    }

    const amount = parseUnits(deal.dealAmountUsdc, USDC_DECIMALS);
    const shape = dealShapeV3(deal);
    try {
      terms = buildDealTerms(
        {
          seller: sellerAgent.address,
          amountUnits: amount,
          milestonePcts: input.milestonePcts,
          stakePct: deal.requireStake ? (deal.requireStakePct ?? 50) : null,
          deadlineUnix,
          reviewFloorSecs: 0,
          shape: shape.shape,
          checkPolicy: shape.checkPolicy,
          agreementHash: `0x${deal.agreementDigest.replace(/^0x/, '')}` as Hex,
        },
        limits,
      );
    } catch (err) {
      if (err instanceof DealTermsError) {
        return { status: 409, body: { error: err.message, code: 'TERMS_NOT_SUPPORTED' } };
      }
      throw err;
    }

    funded = fundedTotal(terms.amount, feeBps);
    if (input.authorizedTotalMicros !== funded) {
      return {
        status: 409,
        body: {
          error: 'the funding total changed before confirmation',
          code: 'QUOTE_CHANGED',
          expectedTotalUsdc: usdc(funded),
        },
      };
    }

    if (terms.reservationBps > 0) {
      const reservation = (terms.amount * BigInt(terms.reservationBps)) / BPS;
      const free = await deps.readFreeStake(sellerAgent.address);
      if (free < reservation) {
        return {
          status: 409,
          body: {
            error: `Seller needs ${usdc(reservation)} USDC available in stake for this deal and currently has ${usdc(free)} USDC. No buyer funds moved.`,
            code: 'INSUFFICIENT_STAKE',
          },
        };
      }
    }

    const balance = await deps.readUsdcBalance(buyerAgent.address);
    if (balance < funded) {
      return {
        status: 409,
        body: {
          error: `buyer agent is short on USDC: has ${usdc(balance)}, needs ${usdc(funded)} (deal + fee). Top up the agent and retry.`,
          code: 'INSUFFICIENT_AGENT_BALANCE',
        },
      };
    }

    escrowDealId = deps.escrow.dealIdFor(buyerAgent.address, fundingSaltV3(jobId));
    await deps.patchDeal(jobId, {
      escrowVersion: 'v3',
      escrowAddress,
      escrowDealId,
      escrowSalt: fundingSaltV3(jobId),
      escrowTerms: storeTerms(terms),
      escrowTermsHash: dealTermsHash(terms),
      ...(deadlineUnix != null ? { deadlineUnix } : {}),
    });

    const movement = await deps.movements.ensure({
      operationKey: input.operationKey,
      amountMicros: funded,
      buyer: deal.buyer,
      seller: deal.seller,
      jobId,
    });
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
  deps: FundDirectV3Deps,
  input: FundDirectV3Input,
  s: { reference: string; funded: bigint; escrowDealId: Hex; terms: DealTermsV3 },
): Promise<FundDirectV3Result> {
  const { jobId, buyerAgent } = input;
  const { reference, funded, escrowDealId, terms } = s;
  const escrowAddress = deps.escrow.address as Hex;
  let fundTxHash: string | undefined;

  // ------------------------------------------------------------ approve + fund
  const approval = await deps.movements.prepareLeg(reference, {
    key: 'approve',
    label: 'Authorize the exact escrow total',
    rail: 'circle_wallets',
    walletId: buyerAgent.walletId,
    signerAddress: buyerAgent.address,
    sourceAddress: buyerAgent.address,
    destinationAddress: escrowAddress,
    amountMicros: funded,
  });
  await deps.approveUsdc({
    walletId: buyerAgent.walletId,
    spender: escrowAddress,
    amount: funded,
    idempotencyKey: approval.idempotencyKey,
    lifecycle: approval.lifecycle,
  });
  if ((await deps.readUsdcAllowance(buyerAgent.address, escrowAddress)) < funded) {
    await deps.movements.needsAttention(reference, 'APPROVAL_NOT_CONFIRMED', 'karwan');
    return {
      status: 409,
      body: { error: 'the escrow authorization did not confirm. Retry is safe.', code: 'APPROVAL_NOT_CONFIRMED', reference },
    };
  }
  await deps.movements.verifyLeg(reference, approval.legId);

  const funding = await deps.movements.prepareLeg(reference, {
    key: 'fund',
    label: 'Protect funds in escrow',
    rail: 'circle_wallets',
    walletId: buyerAgent.walletId,
    signerAddress: buyerAgent.address,
    sourceAddress: buyerAgent.address,
    destinationAddress: escrowAddress,
    contractAddress: escrowAddress,
    amountMicros: funded,
  });
  try {
    const result = await deps.escrow.fund({
      walletId: buyerAgent.walletId,
      buyer: buyerAgent.address,
      salt: fundingSaltV3(jobId),
      terms,
      idempotencyKey: funding.idempotencyKey,
      lifecycle: funding.lifecycle,
      dealKey: jobId,
    });
    fundTxHash = result.txHash;
  } catch (err) {
    if (err instanceof EscrowProofError && typeof err.details.actualJobId === 'string') {
      await deps.patchDeal(jobId, { escrowFundedUnderId: err.details.actualJobId });
      await deps.movements.needsAttention(reference, 'FUND_ID_MISMATCH', 'karwan');
      return {
        status: 409,
        body: {
          error: 'the escrow was funded under a different id than expected. Karwan is reconciling it; no second payment will be taken.',
          code: 'FUND_ID_MISMATCH',
          reference,
        },
      };
    }
    if (err instanceof EscrowProofError) {
      await deps.movements.needsAttention(reference, 'FUND_NOT_CONFIRMED', 'karwan');
      return {
        status: 409,
        body: {
          error: 'escrow funding did not confirm on chain. Retry is safe: Karwan checks the escrow before any new transfer.',
          code: 'FUND_NOT_CONFIRMED',
          reference,
        },
      };
    }
    throw err;
  }
  await deps.movements.verifyLeg(reference, funding.legId);
  await deps.patchDeal(jobId, { fundTxHash });

  return activate(deps, input, { reference, funded, escrowDealId, terms, fundTxHash });
}

async function activate(
  deps: FundDirectV3Deps,
  input: FundDirectV3Input,
  s: { reference: string; funded: bigint; escrowDealId: Hex; terms: DealTermsV3; fundTxHash?: string },
): Promise<FundDirectV3Result> {
  const { jobId, sellerAgent } = input;
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
      termsHash: dealTermsHash(s.terms),
      idempotencyKey: activation.idempotencyKey,
      lifecycle: activation.lifecycle,
      dealKey: jobId,
    });
  } catch (err) {
    const proof = err instanceof EscrowProofError;
    const code = proof ? 'ACCEPT_NOT_CONFIRMED' : 'ACCEPT_ESCROW_FAILED';
    const reservation = (s.terms.amount * BigInt(s.terms.reservationBps)) / BPS;
    const error =
      s.terms.reservationBps > 0
        ? `Escrow activation did not complete. The most common cause is stake: the seller needs ${usdc(reservation)} USDC free in /stake to backstop this deal. Retry is safe because Karwan checks the existing escrow before another transfer.`
        : 'Escrow activation did not complete. Retry is safe because Karwan checks the existing escrow before another transfer.';
    await deps.movements.needsAttention(s.reference, code, s.terms.reservationBps > 0 ? 'seller' : 'karwan');
    deps.emit({ type: 'agent.error', jobId, actor: 'seller', payload: { scope: 'accept.v3', message: error, code } });
    return { status: 502, body: { error, code, reference: s.reference } };
  }
  await deps.movements.verifyLeg(s.reference, activation.legId);
  return finalize(deps, input, { ...s, recovered: false });
}

async function finalize(
  deps: FundDirectV3Deps,
  input: FundDirectV3Input,
  s: { reference: string; funded: bigint; escrowDealId: Hex; fundTxHash?: string; recovered: boolean },
): Promise<FundDirectV3Result> {
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
  deps.emit({
    type: 'deal.accepted',
    jobId,
    actor: 'buyer',
    payload: { seller: deal.seller, buyer: deal.buyer, tradeType: deal.tradeType, escrowDealId: s.escrowDealId },
  });
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
