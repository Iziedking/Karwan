import { parseEventLogs, type Log, type PublicClient } from 'viem';
import { agreementEscrowAbi } from './abis/agreementEscrow.js';
import { toDealView, type AgreementEscrowPorts } from './agreementEscrow.js';
import type { AgreementLimits, AgreementTerms } from './agreementTerms.js';
import type { DealV3View, ReceiptEvent } from './dealEscrowV3.js';

/// The Agreement escrow's reads over any client: the app's, or a fork's in the
/// end-to-end run, so both read the chain the same way.

type Hex = `0x${string}`;
type Client = Pick<PublicClient, 'readContract' | 'getTransactionReceipt'>;

interface Reads {
  deal: {
    state: number; count: number; paid: number; extUsed: number; extRequests: number; checkPassed: boolean; checkFailed: boolean;
    lateMark: boolean; partsPaid: number; revision: number; fundedAt: bigint; deadline: bigint; deliveredAt: bigint;
    reviewStartAt: bigint; reviewEnd: bigint; requestedDeadline: bigint; holdBase: bigint; sellerNet: bigint; feeTotal: bigint;
    released: bigint; feeReleased: bigint; termsHash: Hex;
  };
  account: { payer: Hex; payerId: bigint; seniorSafe: Hex };
  dispute: { opener: Hex; openedAt: bigint; proposed: boolean; escalated: boolean; proposedBps: number; proposedAt: bigint; escalatedAt: bigint };
  panel: { arbiter: Hex; reviewer: Hex };
  terms: { seller: Hex; sellerStake: bigint };
}

/// The four reads of one deal, as the deal routes see it. A ruling panel names
/// the senior Safe for a high-value deal; that is what `senior` reports.
export function viewFromReads(r: Reads): DealV3View {
  return toDealView({
    deal: r.deal,
    account: { payer: r.account.payer, payerId: r.account.payerId },
    dispute: r.dispute,
    panel: { reviewer: r.panel.reviewer },
    terms: r.terms,
    seniorSafe: r.account.seniorSafe,
  });
}

function toTerms(t: Record<string, unknown>): AgreementTerms {
  return {
    asset: t.asset as Hex,
    seller: t.seller as Hex,
    amount: BigInt(t.amount as bigint),
    trancheBps: (t.trancheBps as readonly number[]).map(Number),
    acceptBy: BigInt(t.acceptBy as bigint),
    deliveryDeadline: BigInt(t.deliveryDeadline as bigint),
    reclaimGrace: Number(t.reclaimGrace),
    reviewWindow: Number(t.reviewWindow),
    startLongstop: Number(t.startLongstop),
    extensionSecs: Number(t.extensionSecs),
    silentLongstop: Number(t.silentLongstop),
    reviewStarts: Number(t.reviewStarts),
    maxExtensions: Number(t.maxExtensions),
    finalRelease: Number(t.finalRelease),
    silenceOutcome: Number(t.silenceOutcome),
    partialBps: Number(t.partialBps),
    fallbackBps: Number(t.fallbackBps),
    parts: Number(t.parts),
    partEvery: Number(t.partEvery),
    cancelFeeBps: Number(t.cancelFeeBps),
    sellerStake: BigInt(t.sellerStake as bigint),
    verifier: t.verifier as Hex,
    checkPolicy: t.checkPolicy as Hex,
    agreementHash: t.agreementHash as Hex,
  };
}

/// The escrow's events in a receipt, keyed by deal id. Library events carry the
/// escrow's address, so a log from any other contract is dropped.
export function decodeAgreementLogs(address: Hex, logs: Log[]): ReceiptEvent[] {
  return parseEventLogs({ abi: agreementEscrowAbi, logs })
    .filter((log) => log.address.toLowerCase() === address.toLowerCase())
    .map((log) => {
      const args = (log.args ?? {}) as Record<string, unknown>;
      return { name: log.eventName, jobId: (args.dealId ?? '0x') as Hex, args };
    });
}

export function createAgreementReads(client: Client) {
  const read = <T>(address: Hex, functionName: string, args: unknown[]) =>
    client.readContract({ address, abi: agreementEscrowAbi, functionName: functionName as never, args: args as never }) as Promise<T>;

  async function terms(address: Hex, dealId: Hex): Promise<AgreementTerms> {
    return toTerms(await read<Record<string, unknown>>(address, 'getTerms', [dealId]));
  }

  return {
    read,
    terms,
    async view(address: Hex, dealId: Hex): Promise<DealV3View> {
      const [deal, account, dispute, panel, t] = await Promise.all([
        read<Reads['deal']>(address, 'getDeal', [dealId]),
        read<Reads['account']>(address, 'accountOf', [dealId]),
        read<Reads['dispute']>(address, 'disputeOf', [dealId]),
        read<Reads['panel']>(address, 'panelOf', [dealId]),
        terms(address, dealId),
      ]);
      return viewFromReads({ deal, account, dispute, panel, terms: t });
    },
    /// When an open dispute went to the review Safe, 0 if it has not.
    async escalatedAt(address: Hex, dealId: Hex): Promise<bigint> {
      return BigInt((await read<Reads['dispute']>(address, 'disputeOf', [dealId])).escalatedAt);
    },
    /// The panel fixed at funding: the arbiter key and the review Safe.
    panel: (address: Hex, dealId: Hex) => read<Reads['panel']>(address, 'panelOf', [dealId]),
    /// When the seller may claim the current tranche on the review clock. 0 = not delivered.
    reviewEnd: (address: Hex, dealId: Hex) => read<bigint>(address, 'reviewEndOf', [dealId]),
    /// The escrow's own hash of a set of terms, for parity with agreementTermsHash.
    termsHashOf: (address: Hex, t: AgreementTerms) => read<Hex>(address, 'termsHashOf', [t]),
    async receiptEvents(address: Hex, txHash: string): Promise<ReceiptEvent[]> {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          const receipt = await client.getTransactionReceipt({ hash: txHash as Hex });
          return decodeAgreementLogs(address, receipt.logs);
        } catch {
          await new Promise((r) => setTimeout(r, 500));
        }
      }
      return [];
    },
  };
}

export type AgreementReads = ReturnType<typeof createAgreementReads>;

/// The escrow adapter's ports over these reads; the caller brings how a call is
/// sent and where its events go.
export function agreementEscrowPorts(
  reads: AgreementReads,
  address: Hex,
  chainId: number,
  send: Pick<AgreementEscrowPorts, 'execute' | 'emit'>,
): AgreementEscrowPorts {
  return {
    address,
    chainId,
    execute: send.execute,
    emit: send.emit,
    readView: (dealId) => reads.view(address, dealId),
    readTerms: (dealId) => reads.terms(address, dealId),
    readOwed: (asset, who) => reads.read<bigint>(address, 'owed', [asset, who]),
    readSplit: async (dealId) => {
      const s = await reads.read<{ active: boolean; sellerBps: number }>(address, 'splitOf', [dealId]);
      return { active: s.active, sellerBps: Number(s.sellerBps) };
    },
    receiptEvents: (txHash) => reads.receiptEvents(address, txHash),
  };
}

export const hubOpeningAbi = [
  {
    type: 'function',
    name: 'openingConfig',
    stateMutability: 'view',
    inputs: [{ name: 'family', type: 'address' }, { name: 'asset', type: 'address' }],
    outputs: [{
      name: 'c',
      type: 'tuple',
      components: [
        { name: 'open', type: 'bool' }, { name: 'feeBps', type: 'uint16' }, { name: 'feeRecipient', type: 'address' },
        { name: 'perDealCap', type: 'uint128' }, { name: 'highValue', type: 'uint128' }, { name: 'reviewSafe', type: 'address' },
        { name: 'seniorSafe', type: 'address' }, { name: 'autoArbiter', type: 'address' }, { name: 'yieldBps', type: 'uint16' },
      ],
    }],
  },
] as const;

/// What the hub and the escrow allow a new deal: review bounds, the horizon,
/// the per-deal cap and the fee, for one asset.
export async function readAgreementLimits(client: Pick<PublicClient, 'readContract'>, hub: Hex, agreement: Hex, asset: Hex): Promise<AgreementLimits> {
  const read = (functionName: 'minReview' | 'maxReview' | 'maxHorizon') =>
    client.readContract({ address: agreement, abi: agreementEscrowAbi, functionName }) as Promise<bigint>;
  const [minReview, maxReview, maxHorizon, opening] = await Promise.all([
    read('minReview'),
    read('maxReview'),
    read('maxHorizon'),
    client.readContract({ address: hub, abi: hubOpeningAbi, functionName: 'openingConfig', args: [agreement, asset] }),
  ]);
  return {
    minReview: Number(minReview),
    maxReview: Number(maxReview),
    maxHorizon: Number(maxHorizon),
    perDealCapMicros: BigInt(opening.perDealCap),
    feeBps: Number(opening.feeBps),
  };
}
