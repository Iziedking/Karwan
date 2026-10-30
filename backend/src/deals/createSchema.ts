import { z } from 'zod';
import { MAX_REVIEW_DAYS } from './reviewClock.js';

/// What a direct deal is made of, in one place: POST /api/deals/direct
/// validates with it, and so does the assistant before it shows a deal card
/// (view 24), so the assistant can never build a deal the route would refuse.

export const addrSchema = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/, 'expected 0x-prefixed 20-byte hex address');

export const milestonePctsSchema = z
  .array(z.number().int().min(1).max(100))
  .min(1)
  .max(5)
  .refine((pcts) => pcts.reduce((sum, pct) => sum + pct, 0) === 100, { message: 'the parts must add up to 100' });

export const createSchema = z
  .object({
    buyerAddress: addrSchema,
    /// Either a wallet address (existing flow) OR an email (new share-link
    /// flow). Exactly one. Email mode creates a pending invite and returns a
    /// shareable URL; no escrow funding happens before the recipient claims.
    sellerAddress: addrSchema.optional(),
    sellerEmail: z.string().email().toLowerCase().optional(),
    /// Paytag handle (P2P only). Resolved to an address here, at creation, and
    /// that address is what the deal settles against forever. Handles are
    /// transferable ERC-721s, so a lazily-resolved handle would let the
    /// counterparty redirect the money mid-deal.
    sellerPaytag: z
      .string()
      .trim()
      .regex(/^@?[a-zA-Z0-9_-]{1,32}$/, 'expected a paytag handle like @sarah')
      .optional(),
    dealAmountUsdc: z.number().positive(),
    // Optional delivery deadline. When omitted (or both fields = 0) the deal
    // is open-ended, the seller has no time pressure and the buyer can't
    // unilateral-cancel for late delivery. When set, total must land between
    // 1 hour and 180 days.
    deadlineDays: z.number().int().min(0).max(180).optional().default(0),
    deadlineHours: z.number().int().min(0).max(23).optional().default(0),
    // Acceptance window in hours. Quarter-hour values exist for short testnet
    // demonstrations; ordinary defaults and production-facing presets remain
    // measured in hours or days.
    acceptanceWindowHours: z.number().min(0.25).max(720).multipleOf(0.25).optional().default(24),
    // Room for the structured agreement: items, conditions, proof and parts.
    terms: z.string().min(1).max(4000),
    /// Days the buyer has to check each delivery. Lengthens the escrow's
    /// release window to match what the terms say; unset keeps the default.
    reviewWindowDays: z.number().int().min(1).max(MAX_REVIEW_DAYS).optional(),
    firstReleasePct: z.number().int().min(1).max(100),
    /// Every part of the payment when there are more than two. Must start with
    /// firstReleasePct and add up to 100.
    milestonePcts: milestonePctsSchema.optional(),
    /// Trusted-match flag. When true, this deal is high-trust: the seller
    /// must hold enough free stake to cover the per-deal reservation, which
    /// gets slashed if they lose a dispute. When false, the deal is casual
    /// On v2.E+ escrows pass reservationBps=0 to fundEscrow, the vault is
    /// never touched, and the seller can accept without any stake.
    requireStake: z.boolean().optional().default(false),
    /// Stake percentage chosen by the buyer when requireStake is true. The
    /// frontend slider runs 50..100 in 5% steps. Coerced to a multiple of 5,
    /// floored at 50, capped at 100. Ignored when requireStake is false.
    requireStakePct: z
      .number()
      .int()
      .min(50)
      .max(100)
      .optional()
      .default(50)
      .refine((v) => v % 5 === 0, { message: 'requireStakePct must be a multiple of 5' }),
    /// SME trade-finance fields (Phase 2 Track 2). All optional; service-flow
    /// direct deals continue to post without them.
    tradeType: z.enum(['service', 'goods', 'mixed']).optional(),
    /// Goods only: shipped with tracking at delivery, or handed over in person (view 32).
    goodsWay: z.enum(['shipped', 'in_person']).optional(),
    incoterms: z.enum(['EXW', 'FCA', 'FOB', 'CIF', 'DAP', 'DDP']).optional(),
    paymentTerms: z.enum(['immediate', 'net30', 'net60', 'net90']).optional(),
    counterpartyCompany: z
      .object({
        name: z.string().max(120).optional(),
        sector: z.string().max(40).optional(),
        region: z.string().max(80).optional(),
      })
      .optional(),
    documentRefs: z
      .array(
        z.object({
          hash: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
          kind: z.enum(['invoice', 'po', 'bol', 'coo', 'pod', 'other']),
          label: z.string().max(120).optional(),
        }),
      )
      .max(20)
      .optional(),
    sourceContext: z
      .object({
        channel: z.enum(['karwan', 'email', 'tiktok', 'instagram', 'facebook', 'x', 'linkedin', 'other']),
        reference: z.string().trim().max(400).optional(),
        label: z.string().trim().max(120).optional(),
      })
      .optional(),
    /// Explicit opt-in for the confidential delivery-evidence lane. Legacy
    /// deals remain optional until their agreement records this requirement.
    evidenceRequired: z.boolean().optional().default(false),
    /// Optional World ID gate for sensitive deals. This is a counterparty
    /// policy, not a payment authorization.
    verificationPolicy: z.enum(['standard', 'high_signal']).optional().default('standard'),
    verificationSubject: z.enum(['buyer', 'seller', 'both']).optional().default('seller'),
  })
  .refine(
    (b) =>
      // Either both zero (open-ended) or at least 1 hour total.
      (b.deadlineDays === 0 && (b.deadlineHours ?? 0) === 0) ||
      b.deadlineDays * 24 + (b.deadlineHours ?? 0) >= 1,
    { message: 'when set, deadline must be at least 1 hour', path: ['deadlineHours'] },
  )
  .refine(
    (b) => [b.sellerAddress, b.sellerEmail, b.sellerPaytag].filter(Boolean).length === 1,
    {
      message: 'provide exactly one of sellerAddress, sellerEmail or sellerPaytag',
      path: ['sellerAddress'],
    },
  );

export type CreateDirectDealBody = z.infer<typeof createSchema>;
