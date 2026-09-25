import { encodeAbiParameters, keccak256 } from 'viem';

/// Builds the terms a deal is funded with on KarwanDealEscrow (v3), hashes them
/// exactly as the contract does, and derives the deal id the contract will give
/// the deal. The seller accepts by this hash, so what the app shows, what the
/// buyer funds and what the contract enforces are the same bytes.
///
/// Validation mirrors DealTermsLib.validate (contracts/src/KarwanDealTypes.sol):
/// terms that would revert on-chain are refused here, before any money moves.
/// Parity with the contract is pinned by contracts/test/DealTermsParity.t.sol.

type Hex = `0x${string}`;

const DAY = 86_400;
const LONGSTOP_SECS = 7 * DAY;
const MIN_TRUSTED_BPS = 5_000;
const MAX_UINT128 = (1n << 128n) - 1n;
const ZERO_ADDRESS = `0x${'00'.repeat(20)}`;
const ZERO_BYTES32 = `0x${'00'.repeat(32)}`;

export const REVIEW_STARTS = { onDelivery: 0, onArrival: 1, onCheck: 2 } as const;
export const FINAL_RELEASE = { onTimer: 0, byBuyer: 1 } as const;
export const SILENCE_OUTCOME = { paysSeller: 0, refundsBuyer: 1 } as const;

export type DealShape = 'service' | 'goods' | 'checked';

export interface DealTermsV3 {
  seller: Hex;
  amount: bigint;
  pcts: [number, number, number, number, number];
  reservationBps: number;
  deliveryDeadline: bigint;
  reclaimGrace: number;
  reviewWindow: number;
  reviewStarts: number;
  startLongstop: number;
  maxExtensions: number;
  extensionSecs: number;
  finalRelease: number;
  silenceOutcome: number;
  silentLongstop: number;
  checkPolicy: Hex;
  agreementHash: Hex;
}

export interface DealTermsInput {
  seller: Hex;
  /// Deal price in 6-decimal USDC units, before fees.
  amountUnits: bigint;
  milestonePcts: number[];
  /// Seller stake as a percent of the price (50 to 100), or null for none.
  stakePct: number | null;
  deadlineUnix: number | null;
  /// Longer review the deal's terms require (Net 30, goods in transit).
  reviewFloorSecs: number;
  shape: DealShape;
  checkPolicy?: Hex;
  refundableDeposit?: boolean;
  /// Digest of the agreement both parties signed off-chain.
  agreementHash: Hex;
}

export interface DealTermsLimits {
  nowSecs: number;
  /// Immutable bounds of the deployed escrow.
  minReviewSecs: number;
  maxReviewSecs: number;
  maxHorizonSecs: number;
  maxReservationBps?: number;
  /// The escrow's high-value line; 0 = none.
  highValueUnits: bigint;
  /// Platform settings.
  baseReviewSecs: number;
  reclaimGraceSecs: number;
}

export class DealTermsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DealTermsError';
  }
}

function fail(message: string): never {
  throw new DealTermsError(message);
}

function milestones(pcts: number[]): [number, number, number, number, number] {
  if (pcts.length < 1 || pcts.length > 5) fail('A deal has 1 to 5 milestones.');
  let sum = 0;
  for (const p of pcts) {
    if (!Number.isInteger(p) || p < 1 || p > 100) fail('Each milestone is a whole percent from 1 to 100.');
    sum += p;
  }
  if (sum !== 100) fail('Milestones must add up to 100 percent.');
  const padded = [...pcts, 0, 0, 0, 0].slice(0, 5);
  return padded as [number, number, number, number, number];
}

export function buildDealTerms(input: DealTermsInput, limits: DealTermsLimits): DealTermsV3 {
  if (input.seller.toLowerCase() === ZERO_ADDRESS) fail('The deal has no seller.');
  if (input.amountUnits <= 0n || input.amountUnits > MAX_UINT128) fail('The deal amount is out of range.');
  if (input.agreementHash.toLowerCase() === ZERO_BYTES32) fail('The deal has no signed agreement.');

  const pcts = milestones(input.milestonePcts);

  const maxReservationBps = limits.maxReservationBps ?? 10_000;
  const reservationBps = input.stakePct == null ? 0 : Math.round(input.stakePct * 100);
  if (reservationBps !== 0 && (reservationBps < MIN_TRUSTED_BPS || reservationBps > maxReservationBps)) {
    fail('Seller stake must be at least half of the price.');
  }

  const reviewWindow = Math.min(
    limits.maxReviewSecs,
    Math.max(limits.minReviewSecs, limits.baseReviewSecs, Math.floor(input.reviewFloorSecs)),
  );

  const reviewStarts =
    input.shape === 'goods'
      ? REVIEW_STARTS.onArrival
      : input.shape === 'checked'
        ? REVIEW_STARTS.onCheck
        : REVIEW_STARTS.onDelivery;
  const startLongstop = reviewStarts === REVIEW_STARTS.onDelivery ? 0 : LONGSTOP_SECS;
  if (startLongstop > limits.maxHorizonSecs) fail('The review longstop is beyond the escrow horizon.');
  const checkPolicy = input.checkPolicy ?? (ZERO_BYTES32 as Hex);
  if (reviewStarts === REVIEW_STARTS.onCheck && checkPolicy.toLowerCase() === ZERO_BYTES32) {
    fail('A checked delivery needs a check policy.');
  }

  const maxExtensions = 1;
  const extensionSecs = reviewWindow;
  const silentLongstop = reviewWindow + maxExtensions * extensionSecs + LONGSTOP_SECS;
  if (silentLongstop > limits.maxHorizonSecs) fail('The review time is beyond the escrow horizon.');

  if (limits.reclaimGraceSecs > limits.maxReviewSecs) fail('The reclaim grace is beyond the escrow limit.');

  let deliveryDeadline = 0n;
  if (input.deadlineUnix != null && input.deadlineUnix > 0) {
    const deadline = Math.floor(input.deadlineUnix);
    if (deadline <= limits.nowSecs || deadline > limits.nowSecs + limits.maxHorizonSecs) {
      fail('The delivery deadline must be in the future and within the escrow horizon.');
    }
    deliveryDeadline = BigInt(deadline);
  }

  const highValue = limits.highValueUnits !== 0n && input.amountUnits >= limits.highValueUnits;
  if (highValue && (reviewStarts !== REVIEW_STARTS.onCheck || deliveryDeadline === 0n)) {
    fail('A high-value deal needs a delivery check and a deadline.');
  }

  const silenceOutcome = input.refundableDeposit ? SILENCE_OUTCOME.refundsBuyer : SILENCE_OUTCOME.paysSeller;
  if (silenceOutcome === SILENCE_OUTCOME.refundsBuyer && deliveryDeadline === 0n) {
    fail('A refundable deposit needs a deadline.');
  }

  return {
    seller: input.seller,
    amount: input.amountUnits,
    pcts,
    reservationBps,
    deliveryDeadline,
    reclaimGrace: limits.reclaimGraceSecs,
    reviewWindow,
    reviewStarts,
    startLongstop,
    maxExtensions,
    extensionSecs,
    finalRelease: highValue ? FINAL_RELEASE.byBuyer : FINAL_RELEASE.onTimer,
    silenceOutcome,
    silentLongstop,
    checkPolicy,
    agreementHash: input.agreementHash,
  };
}

const DEAL_TERMS_TUPLE = {
  type: 'tuple',
  components: [
    { name: 'seller', type: 'address' },
    { name: 'amount', type: 'uint128' },
    { name: 'pcts', type: 'uint8[5]' },
    { name: 'reservationBps', type: 'uint16' },
    { name: 'deliveryDeadline', type: 'uint64' },
    { name: 'reclaimGrace', type: 'uint32' },
    { name: 'reviewWindow', type: 'uint32' },
    { name: 'reviewStarts', type: 'uint8' },
    { name: 'startLongstop', type: 'uint32' },
    { name: 'maxExtensions', type: 'uint8' },
    { name: 'extensionSecs', type: 'uint32' },
    { name: 'finalRelease', type: 'uint8' },
    { name: 'silenceOutcome', type: 'uint8' },
    { name: 'silentLongstop', type: 'uint32' },
    { name: 'checkPolicy', type: 'bytes32' },
    { name: 'agreementHash', type: 'bytes32' },
  ],
} as const;

/// keccak256(abi.encode(terms)), the value the seller passes to accept().
export function dealTermsHash(t: DealTermsV3): Hex {
  return keccak256(encodeAbiParameters([DEAL_TERMS_TUPLE], [t]));
}

/// The id the escrow gives a deal: keccak256(abi.encode(chainid, escrow, buyer, salt)).
export function dealIdV3(args: { chainId: number; escrow: Hex; buyer: Hex; salt: Hex }): Hex {
  return keccak256(
    encodeAbiParameters(
      [{ type: 'uint256' }, { type: 'address' }, { type: 'address' }, { type: 'bytes32' }],
      [BigInt(args.chainId), args.escrow, args.buyer, args.salt],
    ),
  );
}
