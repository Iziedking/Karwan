import { createHash } from 'node:crypto';
import { parseUsdcMicro } from '../matching/money.js';
import type { FinancialCommandShadowTaskData } from './financialCommandShadow.js';

const addressPattern = /^0x[0-9a-f]{40}$/i;

export interface LegacyEscrowFundingProjectionInput {
  dealRoomId: string;
  buyerAgentAddress: string;
  escrowAddress: string;
  fundedAmountUsdc: string;
  observedAtUnix: number;
  dealRoomVersion?: number;
  offerVersion?: number;
  mandateVersion?: number;
  preFundingObservation?: LegacyPreFundingObservation;
}

export interface LegacyX402FundingProjectionInput {
  dealRoomId: string;
  payerAgentAddress: string;
  gatewayWalletAddress: string;
  beneficiaryAddress: string;
  amountUsdc: string;
  availableBeforeUsdc: string;
  requiredUsdc: string;
  observedAtUnix: number;
  phase: 'intent' | 'submitted';
  depositTxHash?: string;
  dealRoomVersion?: number;
  mandateVersion?: number;
}

/**
 * The legacy buyer performs this balance/fee check before calling acceptBid.
 * Keep its result as an immutable observation so a future reviewed cutover can
 * prove what was checked without treating the legacy read as a V2 approval.
 */
export interface LegacyPreFundingObservation {
  balanceUsdc: string;
  requiredUsdc: string;
  outcome: 'sufficient' | 'insufficient';
  observedAtUnix: number;
}

export interface LegacyContractAcceptanceProjectionInput {
  dealRoomId: string;
  buyerAgentAddress: string;
  jobBoardAddress: string;
  agreedPriceUsdc: string;
  observedAtUnix: number;
  dealRoomVersion?: number;
  offerVersion?: number;
  mandateVersion?: number;
  providerId?: string;
  txHash?: string;
}

export interface LegacySettlementProjectionInput {
  dealRoomId: string;
  escrowAddress: string;
  destinationAddress: string;
  amountUsdc: string;
  operation: 'MILESTONE_PAYOUT' | 'REFUND';
  observedAtUnix: number;
  movementReference: string;
  expectedDealRoomVersion?: number;
  offerVersion?: number;
  mandateVersion?: number;
}

/**
 * Projects the legacy on-chain acceptBid step into the financial command
 * boundary. The amount is the agreed exposure, not a transfer amount; the
 * command remains approval-required because the legacy human approval is not
 * a durable V2 approval claim. This is observation only and never executes a
 * contract call.
 */
export function buildLegacyContractAcceptanceObservation(
  input: LegacyContractAcceptanceProjectionInput,
): FinancialCommandShadowTaskData {
  if (!input.dealRoomId.trim()) throw new Error('contract acceptance projection requires a deal room id');
  if (!addressPattern.test(input.buyerAgentAddress) || !addressPattern.test(input.jobBoardAddress)) {
    throw new Error('contract acceptance projection requires valid addresses');
  }
  const amountMicros = parseUsdcMicro(input.agreedPriceUsdc);
  if (amountMicros <= 0n) throw new Error('contract acceptance projection requires a positive amount');
  if (!Number.isSafeInteger(input.observedAtUnix) || input.observedAtUnix < 0) {
    throw new Error('contract acceptance projection requires a valid observation time');
  }
  if (input.providerId !== undefined && !input.providerId.trim()) {
    throw new Error('contract acceptance provider id must not be blank');
  }
  if (input.txHash !== undefined && !input.txHash.trim()) {
    throw new Error('contract acceptance transaction hash must not be blank');
  }

  const dealRoomVersion = input.dealRoomVersion ?? 1;
  const mandateVersion = input.mandateVersion ?? 1;
  const key = createHash('sha256')
    .update([
      input.dealRoomId,
      input.buyerAgentAddress.toLowerCase(),
      input.jobBoardAddress.toLowerCase(),
      amountMicros.toString(),
      dealRoomVersion,
      input.offerVersion ?? '',
      mandateVersion,
      input.providerId ?? '',
      input.txHash ?? '',
    ].join('|'))
    .digest('hex');

  return {
    dealRoomId: input.dealRoomId,
    source: 'legacy-accept',
    command: {
      commandId: `legacy-contract-acceptance-command:${key}`,
      idempotencyKey: `legacy-contract-acceptance:${key}`,
      operation: 'CONTRACT_ACCEPTANCE',
      amountUsdc: input.agreedPriceUsdc,
      sourceAddress: input.buyerAgentAddress,
      destinationAddress: input.jobBoardAddress,
      expectedDealRoomVersion: dealRoomVersion,
      ...(input.offerVersion === undefined ? {} : { expectedOfferVersion: input.offerVersion }),
      mandateVersion,
      nowUnix: input.observedAtUnix,
    },
    policy: {
      autonomousMaxUsdc: '0',
      allowedDestinations: [input.jobBoardAddress],
      requireApprovalFor: ['CONTRACT_ACCEPTANCE'],
    },
    current: {
      dealRoomVersion,
      ...(input.offerVersion === undefined ? {} : { offerVersion: input.offerVersion }),
      mandateVersion,
    },
    ...(input.providerId || input.txHash
      ? {
          providerObservation: {
            lifecycle: 'SETTLED' as const,
            ...(input.providerId ? { providerId: input.providerId } : {}),
            ...(input.txHash ? { txHash: input.txHash } : {}),
          },
        }
      : {}),
  };
}

/**
 * Projects the existing human-approved escrow path into the financial shadow
 * boundary. It records the exact command and deliberately leaves the current
 * v2 approval absent: the legacy approval is not a durable v2 approval record.
 * Therefore the shadow decision may be APPROVAL_REQUIRED, which is useful
 * evidence for a later reviewed cutover and never grants execution authority.
 */
export function buildLegacyEscrowFundingObservation(
  input: LegacyEscrowFundingProjectionInput,
): FinancialCommandShadowTaskData {
  if (!input.dealRoomId.trim()) throw new Error('escrow projection requires a deal room id');
  if (!addressPattern.test(input.buyerAgentAddress) || !addressPattern.test(input.escrowAddress)) {
    throw new Error('escrow projection requires valid addresses');
  }
  const amountMicros = parseUsdcMicro(input.fundedAmountUsdc);
  if (amountMicros <= 0n) throw new Error('escrow projection requires a positive amount');
  if (!Number.isSafeInteger(input.observedAtUnix) || input.observedAtUnix < 0) {
    throw new Error('escrow projection requires a valid observation time');
  }
  const preFundingObservation = input.preFundingObservation
    ? validatePreFundingObservation(input.preFundingObservation)
    : undefined;

  const key = createHash('sha256')
    .update([
      input.dealRoomId,
      input.buyerAgentAddress.toLowerCase(),
      input.escrowAddress.toLowerCase(),
      amountMicros.toString(),
      input.dealRoomVersion ?? 1,
      input.offerVersion ?? '',
      input.mandateVersion ?? 1,
      preFundingObservation?.balanceUsdc ?? '',
      preFundingObservation?.requiredUsdc ?? '',
      preFundingObservation?.outcome ?? '',
    ].join('|'))
    .digest('hex');
  const idempotencyKey = `legacy-escrow:${key}`;

  return {
    dealRoomId: input.dealRoomId,
    source: 'legacy-accept',
    command: {
      commandId: `legacy-escrow-command:${key}`,
      idempotencyKey,
      operation: 'ESCROW_FUNDING',
      amountUsdc: input.fundedAmountUsdc,
      sourceAddress: input.buyerAgentAddress,
      destinationAddress: input.escrowAddress,
      expectedDealRoomVersion: input.dealRoomVersion ?? 1,
      ...(input.offerVersion === undefined ? {} : { expectedOfferVersion: input.offerVersion }),
      mandateVersion: input.mandateVersion ?? 1,
      nowUnix: input.observedAtUnix,
    },
    policy: {
      autonomousMaxUsdc: '0',
      allowedDestinations: [input.escrowAddress],
      requireApprovalFor: ['ESCROW_FUNDING'],
    },
    current: {
      dealRoomVersion: input.dealRoomVersion ?? 1,
      ...(input.offerVersion === undefined ? {} : { offerVersion: input.offerVersion }),
      mandateVersion: input.mandateVersion ?? 1,
    },
    ...(preFundingObservation ? { preFundingObservation } : {}),
  };
}

/**
 * Projects the legacy x402 Gateway top-up into the financial shadow boundary.
 * The Gateway EOA is only the paid-rail beneficiary; the payer remains the
 * agent SCA that signs the approve/depositFor calls. This is observation-only
 * and deliberately approval-required, so it cannot submit or repeat funding.
 */
export function buildLegacyX402FundingObservation(
  input: LegacyX402FundingProjectionInput,
): FinancialCommandShadowTaskData {
  if (!input.dealRoomId.trim()) throw new Error('x402 funding projection requires a deal room id');
  if (
    !addressPattern.test(input.payerAgentAddress) ||
    !addressPattern.test(input.gatewayWalletAddress) ||
    !addressPattern.test(input.beneficiaryAddress)
  ) {
    throw new Error('x402 funding projection requires valid addresses');
  }
  const amountMicros = parseUsdcMicro(input.amountUsdc);
  const availableMicros = parseUsdcMicro(input.availableBeforeUsdc);
  const requiredMicros = parseUsdcMicro(input.requiredUsdc);
  if (amountMicros <= 0n) throw new Error('x402 funding projection requires a positive amount');
  if (availableMicros < 0n) throw new Error('x402 funding available balance cannot be negative');
  if (requiredMicros <= 0n) throw new Error('x402 funding requirement must be positive');
  if (availableMicros >= requiredMicros) {
    throw new Error('x402 funding projection requires an insufficient pre-funding balance');
  }
  if (!Number.isSafeInteger(input.observedAtUnix) || input.observedAtUnix < 0) {
    throw new Error('x402 funding projection requires a valid observation time');
  }
  if (input.phase === 'submitted' && !input.depositTxHash?.trim()) {
    throw new Error('submitted x402 funding projection requires a deposit transaction hash');
  }
  if (input.phase === 'intent' && input.depositTxHash !== undefined) {
    throw new Error('intent x402 funding projection must not include a deposit transaction hash');
  }
  if (input.depositTxHash !== undefined && !input.depositTxHash.trim()) {
    throw new Error('x402 funding transaction hash must not be blank');
  }

  const dealRoomVersion = input.dealRoomVersion ?? 1;
  const mandateVersion = input.mandateVersion ?? 1;
  const key = createHash('sha256')
    .update([
      input.dealRoomId,
      input.payerAgentAddress.toLowerCase(),
      input.gatewayWalletAddress.toLowerCase(),
      input.beneficiaryAddress.toLowerCase(),
      amountMicros.toString(),
      availableMicros.toString(),
      requiredMicros.toString(),
      input.phase,
      input.depositTxHash ?? '',
      dealRoomVersion,
      mandateVersion,
    ].join('|'))
    .digest('hex');

  const x402FundingObservation = {
    payerAgentAddress: input.payerAgentAddress,
    gatewayWalletAddress: input.gatewayWalletAddress,
    beneficiaryAddress: input.beneficiaryAddress,
    availableBeforeUsdc: input.availableBeforeUsdc,
    requiredUsdc: input.requiredUsdc,
    phase: input.phase,
    ...(input.depositTxHash ? { depositTxHash: input.depositTxHash } : {}),
  } as const;

  return {
    dealRoomId: input.dealRoomId,
    source: 'legacy-x402-funding',
    command: {
      commandId: `legacy-x402-funding-command:${key}`,
      idempotencyKey: `legacy-x402-funding:${key}`,
      operation: 'X402_FUNDING',
      amountUsdc: input.amountUsdc,
      sourceAddress: input.payerAgentAddress,
      destinationAddress: input.gatewayWalletAddress,
      expectedDealRoomVersion: dealRoomVersion,
      mandateVersion,
      nowUnix: input.observedAtUnix,
    },
    policy: {
      autonomousMaxUsdc: '0',
      allowedDestinations: [input.gatewayWalletAddress],
      requireApprovalFor: ['X402_FUNDING'],
    },
    current: { dealRoomVersion, mandateVersion },
    x402FundingObservation,
    ...(input.phase === 'submitted'
      ? { providerObservation: { lifecycle: 'SUBMITTED' as const, txHash: input.depositTxHash! } }
      : {}),
  };
}

function validatePreFundingObservation(
  input: LegacyPreFundingObservation,
): LegacyPreFundingObservation {
  const balanceMicros = parseUsdcMicro(input.balanceUsdc);
  const requiredMicros = parseUsdcMicro(input.requiredUsdc);
  if (balanceMicros < 0n) throw new Error('pre-funding balance cannot be negative');
  if (requiredMicros <= 0n) throw new Error('pre-funding requirement must be positive');
  if (!Number.isSafeInteger(input.observedAtUnix) || input.observedAtUnix < 0) {
    throw new Error('pre-funding observation requires a valid observation time');
  }
  if (input.outcome === 'sufficient' && balanceMicros < requiredMicros) {
    throw new Error('sufficient pre-funding observation has insufficient balance');
  }
  if (input.outcome === 'insufficient' && balanceMicros >= requiredMicros) {
    throw new Error('insufficient pre-funding observation has sufficient balance');
  }
  return {
    balanceUsdc: input.balanceUsdc,
    requiredUsdc: input.requiredUsdc,
    outcome: input.outcome,
    observedAtUnix: input.observedAtUnix,
  };
}

/**
 * Projects a confirmed or imminent escrow settlement leg into the financial
 * shadow boundary. The projection is intentionally approval-required and has
 * no provider lifecycle, so it cannot authorize or repeat the existing
 * settlement call. Movement references make repeated watcher ticks idempotent.
 */
export function buildLegacySettlementObservation(
  input: LegacySettlementProjectionInput,
): FinancialCommandShadowTaskData {
  if (!input.dealRoomId.trim()) throw new Error('settlement projection requires a deal room id');
  if (!input.movementReference.trim()) throw new Error('settlement projection requires a movement reference');
  if (!addressPattern.test(input.escrowAddress) || !addressPattern.test(input.destinationAddress)) {
    throw new Error('settlement projection requires valid addresses');
  }
  const amountMicros = parseUsdcMicro(input.amountUsdc);
  if (amountMicros <= 0n) throw new Error('settlement projection requires a positive amount');
  if (!Number.isSafeInteger(input.observedAtUnix) || input.observedAtUnix < 0) {
    throw new Error('settlement projection requires a valid observation time');
  }

  const roomVersion = input.expectedDealRoomVersion ?? 1;
  const mandateVersion = input.mandateVersion ?? 1;
  const key = createHash('sha256')
    .update([
      input.dealRoomId,
      input.operation,
      input.movementReference,
      input.escrowAddress.toLowerCase(),
      input.destinationAddress.toLowerCase(),
      amountMicros.toString(),
      roomVersion,
      input.offerVersion ?? '',
      mandateVersion,
    ].join('|'))
    .digest('hex');

  return {
    dealRoomId: input.dealRoomId,
    source: 'legacy-settlement',
    command: {
      commandId: `legacy-settlement-command:${key}`,
      idempotencyKey: `legacy-settlement:${key}`,
      operation: input.operation,
      amountUsdc: input.amountUsdc,
      sourceAddress: input.escrowAddress,
      destinationAddress: input.destinationAddress,
      expectedDealRoomVersion: roomVersion,
      ...(input.offerVersion === undefined ? {} : { expectedOfferVersion: input.offerVersion }),
      mandateVersion,
      nowUnix: input.observedAtUnix,
    },
    policy: {
      autonomousMaxUsdc: '0',
      allowedDestinations: [input.destinationAddress],
      requireApprovalFor: [input.operation],
    },
    current: {
      dealRoomVersion: roomVersion,
      ...(input.offerVersion === undefined ? {} : { offerVersion: input.offerVersion }),
      mandateVersion,
    },
  };
}
