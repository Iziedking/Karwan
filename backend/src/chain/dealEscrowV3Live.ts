import { parseEventLogs, type Address } from 'viem';
import { config } from '../config.js';
import { bus } from '../events.js';
import { dealEscrowV3Abi } from './abis/dealEscrowV3.js';
import { ARC, publicClient } from './client.js';
import {
  createDealEscrowV3,
  type DealEscrowV3,
  type DealStateV3,
  type DealV3View,
  type ReceiptEvent,
} from './dealEscrowV3.js';
import type { DealTermsLimits } from './dealTermsV3.js';
import { executeContractCall } from './txs.js';

type Hex = `0x${string}`;

/// The KarwanDealEscrow (v3) address on this network, or null when the suite
/// is not deployed here. Deals already on v3 need it to finish, so it is read
/// independently of DEAL_ESCROW_V3_ENABLED, which only gates new funding.
export const dealEscrowV3Address: Address | null = (config.KARWAN_DEAL_ESCROW_ADDR as Address | undefined) ?? null;

/// New deals may be funded on v3 only with the flag on and the address set.
export function v3FundingEnabled(): boolean {
  return config.DEAL_ESCROW_V3_ENABLED && dealEscrowV3Address !== null;
}

export async function readDealV3(address: Address, jobId: Hex): Promise<DealV3View> {
  const d = (await publicClient.readContract({
    address,
    abi: dealEscrowV3Abi,
    functionName: 'getDeal',
    args: [jobId],
  })) as Record<string, unknown>;
  return {
    state: Number(d.state) as DealStateV3,
    buyer: d.buyer as Hex,
    seller: d.seller as Hex,
    buyerId: d.buyerId as Hex,
    sellerId: d.sellerId as Hex,
    count: Number(d.count),
    paid: Number(d.paid),
    extUsed: Number(d.extUsed),
    revision: Number(d.revision),
    checkPassed: Boolean(d.checkPassed),
    lateMark: Boolean(d.lateMark),
    escalated: Boolean(d.escalated),
    proposal: Boolean(d.proposal),
    senior: Boolean(d.senior),
    deliveredAt: BigInt(d.deliveredAt as bigint),
    reviewStartAt: BigInt(d.reviewStartAt as bigint),
    reviewEnd: BigInt(d.reviewEnd as bigint),
    deadline: BigInt(d.deadline as bigint),
    disputedAt: BigInt(d.disputedAt as bigint),
    proposedAt: BigInt(d.proposedAt as bigint),
    proposedBps: Number(d.proposedBps),
    sellerNet: BigInt(d.sellerNet as bigint),
    feeTotal: BigInt(d.feeTotal as bigint),
    released: BigInt(d.released as bigint),
    feeReleased: BigInt(d.feeReleased as bigint),
    reserved: BigInt(d.reserved as bigint),
    termsHash: d.termsHash as Hex,
  };
}

/// When the seller may claim the current milestone on the review clock
/// (ignoring check and final-release rules). 0 = not delivered.
export async function readReviewEndV3(address: Address, jobId: Hex): Promise<bigint> {
  return (await publicClient.readContract({
    address,
    abi: dealEscrowV3Abi,
    functionName: 'reviewEndOf',
    args: [jobId],
  })) as bigint;
}

/// The deployed escrow's immutable bounds and caps, for buildDealTerms. The
/// platform settings (base review, reclaim grace) come from config.
export async function readDealTermsLimits(address: Address, nowSecs: number): Promise<DealTermsLimits> {
  const read = (functionName: string) =>
    publicClient.readContract({ address, abi: dealEscrowV3Abi, functionName: functionName as never }) as Promise<
      bigint | number
    >;
  const [minReview, maxReview, maxHorizon, maxReservationBps, highValue] = await Promise.all([
    read('minReview'),
    read('maxReview'),
    read('maxHorizon'),
    read('maxReservationBps'),
    read('highValue'),
  ]);
  return {
    nowSecs,
    minReviewSecs: Number(minReview),
    maxReviewSecs: Number(maxReview),
    maxHorizonSecs: Number(maxHorizon),
    maxReservationBps: Number(maxReservationBps),
    highValueUnits: BigInt(highValue),
    baseReviewSecs: Math.floor(config.DEAL_REVIEW_WINDOW_MS / 1000),
    reclaimGraceSecs: Math.floor(config.DEAL_DEADLINE_RECLAIM_GRACE_MS / 1000),
  };
}

async function receiptEvents(txHash: string): Promise<ReceiptEvent[]> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const receipt = await publicClient.getTransactionReceipt({ hash: txHash as Hex });
      return parseEventLogs({ abi: dealEscrowV3Abi, logs: receipt.logs })
        .filter((log) => dealEscrowV3Address && log.address.toLowerCase() === dealEscrowV3Address.toLowerCase())
        .map((log) => {
          const args = (log.args ?? {}) as Record<string, unknown>;
          return { name: log.eventName, jobId: (args.jobId ?? '0x') as Hex, args };
        });
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  return [];
}

function bind(address: Address): DealEscrowV3 {
  return createDealEscrowV3({
    address: address as Hex,
    chainId: ARC.chainId,
    execute: (input, label) => executeContractCall(input, label),
    readDeal: (jobId) => readDealV3(address, jobId),
    readOwed: async (owner) =>
      (await publicClient.readContract({
        address,
        abi: dealEscrowV3Abi,
        functionName: 'owed',
        args: [owner],
      })) as bigint,
    readSplit: async (jobId) => {
      const s = (await publicClient.readContract({
        address,
        abi: dealEscrowV3Abi,
        functionName: 'splitOf',
        args: [jobId],
      })) as readonly [Address, number, boolean, boolean];
      return { active: s[3], sellerBps: Number(s[1]) };
    },
    receiptEvents,
    emit: (e) =>
      bus.emitEvent({
        type: e.type as Parameters<typeof bus.emitEvent>[0]['type'],
        jobId: e.jobId,
        actor: e.actor ?? 'platform',
        payload: e.payload ?? {},
      }),
  });
}

/// The live v3 escrow, or null when it is not deployed on this network.
export const dealEscrowV3: DealEscrowV3 | null = dealEscrowV3Address ? bind(dealEscrowV3Address) : null;

export function requireDealEscrowV3(): DealEscrowV3 {
  if (!dealEscrowV3) throw new Error(`KarwanDealEscrow is not deployed on Arc ${ARC.name}`);
  return dealEscrowV3;
}
