import { encodeAbiParameters, keccak256 } from 'viem';

/// Builds the terms a deal is funded with on KarwanAgreementEscrow (view 27),
/// hashes them exactly as the contract's termsHashOf does, and derives the deal
/// id AgreementLib gives the deal. The seller accepts by this hash, so what the
/// app shows, what the buyer funds and what the escrow enforces are one value.
///
/// The checks mirror AgreementTermsLib.validate and the settlement horizon and
/// per-deal cap, so terms the escrow would refuse are refused here before any
/// money moves.

type Hex = `0x${string}`;

const DAY = 86_400;
const LONGSTOP_SECS = 7 * DAY;
const SETTLEMENT_MAX_HORIZON = 730 * DAY;
const MAX_STAGES = 5;
const BPS = 10_000;
const ZERO_ADDRESS: Hex = '0x0000000000000000000000000000000000000000';
const ZERO_BYTES32: Hex = `0x${'00'.repeat(32)}`;

/// The kinds of deal people choose (agents/ways.ts LIVE_SHAPES).
export type DealKind = 'one_time' | 'milestones' | 'goods' | 'deposit';

export interface AgreementTerms {
  asset: Hex;
  seller: Hex;
  amount: bigint;
  trancheBps: number[];
  acceptBy: bigint;
  deliveryDeadline: bigint;
  reclaimGrace: number;
  reviewWindow: number;
  startLongstop: number;
  extensionSecs: number;
  silentLongstop: number;
  reviewStarts: number;
  maxExtensions: number;
  finalRelease: number;
  silenceOutcome: number;
  partialBps: number;
  fallbackBps: number;
  parts: number;
  partEvery: number;
  cancelFeeBps: number;
  sellerStake: bigint;
  verifier: Hex;
  checkPolicy: Hex;
  agreementHash: Hex;
}

export interface AgreementTermsInput {
  kind: DealKind;
  asset: Hex;
  seller: Hex;
  amountMicros: bigint;
  /// Milestones only: 2 to 5 payments, split evenly...
  stages?: number;
  /// ...or the split the parties agreed, in whole percents adding up to 100.
  milestonePcts?: number[];
  acceptBy: bigint;
  deliveryDeadline: bigint;
  reviewWindowSecs: number;
  reclaimGraceSecs: number;
  startLongstopSecs?: number;
  partialBps?: number;
  fallbackBps?: number;
  checked?: { verifier: Hex; checkPolicy: Hex };
  agreementHash: Hex;
  nowSecs: number;
}

export interface AgreementLimits {
  minReview: number;
  maxReview: number;
  maxHorizon: number;
  perDealCapMicros: bigint;
  feeBps: number;
}

export class AgreementTermsError extends Error {
  constructor(readonly code: 'over_cap' | 'bad_review' | 'bad_horizon' | 'bad_stages' | 'bad_terms', message: string) {
    super(message);
    this.name = 'AgreementTermsError';
  }
}

/// What the buyer pays into escrow: the price and half the fee, as AgreementLib
/// computes it (the fee floored, then halved down).
export function buyerPaysMicros(amount: bigint, feeBps: number): bigint {
  const fee = (amount * BigInt(feeBps)) / BigInt(BPS);
  return amount + fee / 2n;
}

function tranches(kind: DealKind, stages: number | undefined, pcts?: number[]): number[] {
  const out = new Array<number>(12).fill(0);
  if (kind !== 'milestones') {
    out[0] = BPS;
    return out;
  }
  if (pcts) {
    const valid = pcts.length >= 2 && pcts.length <= MAX_STAGES && pcts.every((p) => Number.isInteger(p) && p >= 1) && pcts.reduce((a, b) => a + b, 0) === 100;
    if (!valid) throw new AgreementTermsError('bad_stages', 'A milestone deal has 2 to 5 payments adding up to the whole price.');
    pcts.forEach((p, i) => (out[i] = p * 100));
    return out;
  }
  if (stages === undefined || !Number.isInteger(stages) || stages < 2 || stages > MAX_STAGES) {
    throw new AgreementTermsError('bad_stages', 'A milestone deal has 2 to 5 payments.');
  }
  const each = Math.floor(BPS / stages);
  for (let i = 0; i < stages; i++) out[i] = each;
  out[stages - 1] = BPS - each * (stages - 1);
  return out;
}

export function buildAgreementTerms(input: AgreementTermsInput, limits: AgreementLimits): AgreementTerms {
  if (input.seller.toLowerCase() === ZERO_ADDRESS || input.amountMicros <= 0n) {
    throw new AgreementTermsError('bad_terms', 'The deal has no seller or no amount.');
  }
  if (input.agreementHash.toLowerCase() === ZERO_BYTES32) throw new AgreementTermsError('bad_terms', 'The deal has no signed agreement.');
  if (buyerPaysMicros(input.amountMicros, limits.feeBps) > limits.perDealCapMicros) {
    throw new AgreementTermsError('over_cap', 'Deals can be up to 1,000 USDC while Karwan is in beta.');
  }

  const trancheBps = tranches(input.kind, input.stages, input.milestonePcts);
  const reviewWindow = Math.floor(input.reviewWindowSecs);
  if (reviewWindow < limits.minReview || reviewWindow > limits.maxReview || input.reclaimGraceSecs > limits.maxReview) {
    throw new AgreementTermsError('bad_review', 'The review time is outside what the escrow allows.');
  }

  const reviewStarts = input.checked ? 2 : input.kind === 'goods' ? 1 : 0;
  const startLongstop = reviewStarts === 0 ? 0 : (input.startLongstopSecs ?? LONGSTOP_SECS);
  const maxExtensions = 1;
  const extensionSecs = reviewWindow;
  const silentLongstop = startLongstop + reviewWindow + maxExtensions * extensionSecs + LONGSTOP_SECS;
  if (startLongstop > limits.maxHorizon || silentLongstop > limits.maxHorizon) {
    throw new AgreementTermsError('bad_horizon', 'The review time is beyond the escrow horizon.');
  }

  const now = BigInt(input.nowSecs);
  const maxDate = now + BigInt(limits.maxHorizon);
  if (input.acceptBy <= now || input.acceptBy > maxDate || input.deliveryDeadline <= input.acceptBy || input.deliveryDeadline > maxDate) {
    throw new AgreementTermsError('bad_horizon', 'The dates are outside what the escrow allows.');
  }
  const horizon = input.deliveryDeadline + BigInt(input.reclaimGraceSecs + startLongstop + silentLongstop);
  if (horizon > now + BigInt(SETTLEMENT_MAX_HORIZON)) {
    throw new AgreementTermsError('bad_horizon', 'The deal would run past the escrow horizon.');
  }

  const partialBps = input.partialBps ?? 0;
  const fallbackBps = input.fallbackBps ?? 5_000;
  if (partialBps >= BPS || fallbackBps > BPS) throw new AgreementTermsError('bad_terms', 'A share is out of range.');

  return {
    asset: input.asset,
    seller: input.seller,
    amount: input.amountMicros,
    trancheBps,
    acceptBy: input.acceptBy,
    deliveryDeadline: input.deliveryDeadline,
    reclaimGrace: input.reclaimGraceSecs,
    reviewWindow,
    startLongstop,
    extensionSecs,
    silentLongstop,
    reviewStarts,
    maxExtensions,
    finalRelease: 0,
    silenceOutcome: input.kind === 'deposit' ? 1 : 0,
    partialBps,
    fallbackBps,
    parts: 0,
    partEvery: 0,
    cancelFeeBps: 0,
    sellerStake: 0n,
    verifier: input.checked?.verifier ?? ZERO_ADDRESS,
    checkPolicy: input.checked?.checkPolicy ?? ZERO_BYTES32,
    agreementHash: input.agreementHash,
  };
}

const AGREEMENT_TERMS_TUPLE = {
  type: 'tuple',
  components: [
    { name: 'asset', type: 'address' },
    { name: 'seller', type: 'address' },
    { name: 'amount', type: 'uint128' },
    { name: 'trancheBps', type: 'uint16[12]' },
    { name: 'acceptBy', type: 'uint64' },
    { name: 'deliveryDeadline', type: 'uint64' },
    { name: 'reclaimGrace', type: 'uint32' },
    { name: 'reviewWindow', type: 'uint32' },
    { name: 'startLongstop', type: 'uint32' },
    { name: 'extensionSecs', type: 'uint32' },
    { name: 'silentLongstop', type: 'uint32' },
    { name: 'reviewStarts', type: 'uint8' },
    { name: 'maxExtensions', type: 'uint8' },
    { name: 'finalRelease', type: 'uint8' },
    { name: 'silenceOutcome', type: 'uint8' },
    { name: 'partialBps', type: 'uint16' },
    { name: 'fallbackBps', type: 'uint16' },
    { name: 'parts', type: 'uint8' },
    { name: 'partEvery', type: 'uint32' },
    { name: 'cancelFeeBps', type: 'uint16' },
    { name: 'sellerStake', type: 'uint128' },
    { name: 'verifier', type: 'address' },
    { name: 'checkPolicy', type: 'bytes32' },
    { name: 'agreementHash', type: 'bytes32' },
  ],
} as const;

export const AGREEMENT_FUND_SIGNATURE =
  'fund(bytes32,(address,address,uint128,uint16[12],uint64,uint64,uint32,uint32,uint32,uint32,uint32,uint8,uint8,uint8,uint8,uint16,uint16,uint8,uint32,uint16,uint128,address,bytes32,bytes32))';

/// keccak256(abi.encode(terms)): termsHashOf, the value the seller accepts by.
export function agreementTermsHash(t: AgreementTerms): Hex {
  return keccak256(encodeAbiParameters([AGREEMENT_TERMS_TUPLE], [{ ...t, trancheBps: t.trancheBps as unknown as readonly number[] } as never]));
}

/// Circle takes tuple arguments as nested arrays of strings.
export function agreementTermsTuple(t: AgreementTerms): unknown[] {
  return [
    t.asset,
    t.seller,
    t.amount.toString(),
    t.trancheBps.map(String),
    t.acceptBy.toString(),
    t.deliveryDeadline.toString(),
    String(t.reclaimGrace),
    String(t.reviewWindow),
    String(t.startLongstop),
    String(t.extensionSecs),
    String(t.silentLongstop),
    String(t.reviewStarts),
    String(t.maxExtensions),
    String(t.finalRelease),
    String(t.silenceOutcome),
    String(t.partialBps),
    String(t.fallbackBps),
    String(t.parts),
    String(t.partEvery),
    String(t.cancelFeeBps),
    t.sellerStake.toString(),
    t.verifier,
    t.checkPolicy,
    t.agreementHash,
  ];
}

/// The id the escrow gives a deal: keccak256(abi.encode(chainid, escrow, buyer, salt)).
export function agreementDealId(args: { chainId: number; escrow: Hex; buyer: Hex; salt: Hex }): Hex {
  return keccak256(
    encodeAbiParameters(
      [{ type: 'uint256' }, { type: 'address' }, { type: 'address' }, { type: 'bytes32' }],
      [BigInt(args.chainId), args.escrow, args.buyer, args.salt],
    ),
  );
}

/// The terms as a deal row keeps them: bigints as strings.
export type StoredAgreementTerms = Omit<AgreementTerms, 'amount' | 'acceptBy' | 'deliveryDeadline' | 'sellerStake'> & {
  amount: string;
  acceptBy: string;
  deliveryDeadline: string;
  sellerStake: string;
};

export function storeAgreementTerms(t: AgreementTerms): StoredAgreementTerms {
  return {
    ...t,
    trancheBps: [...t.trancheBps],
    amount: t.amount.toString(),
    acceptBy: t.acceptBy.toString(),
    deliveryDeadline: t.deliveryDeadline.toString(),
    sellerStake: t.sellerStake.toString(),
  };
}

export function reviveAgreementTerms(t: StoredAgreementTerms): AgreementTerms {
  return {
    ...t,
    trancheBps: [...t.trancheBps],
    amount: BigInt(t.amount),
    acceptBy: BigInt(t.acceptBy),
    deliveryDeadline: BigInt(t.deliveryDeadline),
    sellerStake: BigInt(t.sellerStake),
  };
}
