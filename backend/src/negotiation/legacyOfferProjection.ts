import { z } from 'zod';
import { parseUsdcMicro } from '../matching/money.js';
import { formatUsdcMicro } from './structuredOffer.js';
import type { NegotiationShadowTaskData } from '../agents/negotiationTaskShadow.js';

const addressSchema = z.string().regex(/^0x[0-9a-f]{40}$/i);
const decimalUsdcSchema = z.string().regex(/^\d+(?:\.\d{1,6})?$/);

const sourceSchema = z.object({
  dealRoomId: z.string().trim().min(1),
  buyerAgent: addressSchema,
  sellerAgent: addressSchema,
  buyerMaxPriceUsdc: decimalUsdcSchema,
  sellerMinPriceUsdc: decimalUsdcSchema,
  raisedPriceUsdc: decimalUsdcSchema,
  deadlineUnix: z.number().int().positive(),
  buyerMandateVersion: z.number().int().positive(),
  sellerMandateVersion: z.number().int().positive(),
  offerVersion: z.number().int().positive(),
  previousOfferVersion: z.number().int().positive().optional(),
  termsScope: z.string().trim().min(1).max(2_000),
  observedAtUnix: z.number().int().nonnegative(),
}).strict();

export type LegacyRaisedOfferProjectionSource = z.infer<typeof sourceSchema>;

/**
 * Projects a seller's legacy approval-gate raise into the structured
 * negotiation shadow task. The legacy proposal remains authoritative; this
 * only gives the v2 offer runtime a durable, versioned observation to audit.
 */
export function buildLegacyRaisedOfferShadowInput(
  source: LegacyRaisedOfferProjectionSource,
): NegotiationShadowTaskData | null {
  const parsed = sourceSchema.safeParse(source);
  if (!parsed.success) return null;
  const input = parsed.data;
  let buyerCap: bigint;
  let sellerFloor: bigint;
  let raisedPrice: bigint;
  try {
    buyerCap = parseUsdcMicro(input.buyerMaxPriceUsdc);
    sellerFloor = parseUsdcMicro(input.sellerMinPriceUsdc);
    raisedPrice = parseUsdcMicro(input.raisedPriceUsdc);
  } catch {
    return null;
  }
  if (buyerCap <= 0n || sellerFloor <= 0n || raisedPrice <= 0n || sellerFloor > buyerCap) return null;

  const previousOfferVersion = input.previousOfferVersion ?? (input.offerVersion > 1 ? input.offerVersion - 1 : undefined);
  const offerId = `legacy-offer:${input.dealRoomId}:${input.sellerAgent.toLowerCase()}:${input.offerVersion}`;
  const commandId = `legacy-negotiation:raise:${input.dealRoomId}:${input.offerVersion}`;
  const previous = previousOfferVersion === undefined
    ? {}
    : {
        previousOfferId: `legacy-offer:${input.dealRoomId}:${input.sellerAgent.toLowerCase()}:${previousOfferVersion}`,
        previousOfferVersion,
      };

  return {
    dealRoomId: input.dealRoomId,
    commandId,
    idempotencyKey: commandId,
    expectedDealRoomVersion: input.offerVersion,
    rawOffer: {
      dealRoomId: input.dealRoomId,
      offerId,
      offerVersion: input.offerVersion,
      senderRole: 'seller',
      recipientRole: 'buyer',
      kind: 'COUNTER',
      action: 'REVISE_PRICE',
      priceUsdc: formatUsdcMicro(raisedPrice),
      deadlineUnix: input.deadlineUnix,
      buyerMandateVersion: input.buyerMandateVersion,
      sellerMandateVersion: input.sellerMandateVersion,
      ...previous,
      terms: {
        scope: input.termsScope,
        delivery: `by ${input.deadlineUnix}`,
        paymentTerms: 'after acceptance',
      },
    },
    mandates: {
      buyerMaxPriceUsdc: formatUsdcMicro(buyerCap),
      sellerMinPriceUsdc: formatUsdcMicro(sellerFloor),
      buyerMandateVersion: input.buyerMandateVersion,
      sellerMandateVersion: input.sellerMandateVersion,
    },
    observedAtUnix: input.observedAtUnix,
    source: 'legacy-proposal',
  };
}
