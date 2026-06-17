import { Hono } from 'hono';
import { z } from 'zod';
import { readSession } from '../auth/session.js';
import { getProfile, upsertProfile } from '../db/profiles.js';
import { listDealsForAddress } from '../db/deals.js';
import { logger } from '../logger.js';

/// SME profile routes. Public passport read (no auth) + authenticated
/// upsert. taxId never round-trips, the profile route stores an
/// encrypted blob set by a separate admin path (post-SME); the public
/// passport route never returns it.

const addrSchema = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/, 'expected 0x-prefixed 20-byte hex address');

const sectorSchema = z.enum([
  'agriculture',
  'textiles',
  'electronics',
  'logistics',
  'manufacturing',
  'services',
  'other',
]);
const employeeBandSchema = z.enum(['micro', 'small', 'medium']);

const smeProfileBodySchema = z.object({
  address: addrSchema,
  smeProfile: z.object({
    companyName: z.string().min(1).max(120).optional(),
    sector: sectorSchema.optional(),
    region: z.string().min(2).max(80).optional(),
    yearFounded: z.number().int().min(1800).max(2100).optional(),
    employeeBand: employeeBandSchema.optional(),
    // Accept a bare domain ("fze.org/uae") by normalising to https:// before
    // validating, so the whole trade card doesn't fail "invalid body" just
    // because the user left the scheme off the website.
    websiteUrl: z
      .preprocess((v) => {
        if (typeof v !== 'string') return v;
        const t = v.trim();
        if (!t) return undefined;
        return /^https?:\/\//i.test(t) ? t : `https://${t}`;
      }, z.string().url().max(200))
      .optional(),
    // Public company registration / trade-license number (not the sensitive
    // tax id, which stays in the encrypted path). Financier-facing.
    registrationId: z.string().max(60).optional(),
    // Markets the business actually trades into, free text (e.g. "MEASA, EU").
    primaryMarkets: z.string().max(200).optional(),
    // Annual trade-volume band — what financiers size exposure against.
    annualVolumeBand: z
      .enum(['under_100k', '100k_1m', '1m_10m', 'over_10m'])
      .optional(),
  }),
});

export const smeRoutes = new Hono();

/// GET /api/sme/profile/:address: public SME panel for the credit
/// passport. Strips taxIdEncrypted; computes repaymentBehavior live so
/// the rendered view is always current.
smeRoutes.get('/profile/:address', async (c) => {
  const parsed = addrSchema.safeParse(c.req.param('address'));
  if (!parsed.success) return c.json({ error: 'invalid address' }, 400);
  const profile = await getProfile(parsed.data);
  if (!profile?.smeProfile) return c.json({ smeProfile: null, repaymentBehavior: null });

  const { taxIdEncrypted: _ignore, ...publicProfile } = profile.smeProfile;
  const repaymentBehavior = await computeRepaymentBehavior(parsed.data);
  return c.json({ smeProfile: publicProfile, repaymentBehavior });
});

/// POST /api/sme/profile: authenticated user updates their own SME
/// profile. Caller must match the address in the body.
smeRoutes.post('/profile', async (c) => {
  const session = readSession(c);
  if (!session) return c.json({ error: 'not authenticated' }, 401);

  let body;
  try {
    body = smeProfileBodySchema.parse(await c.req.json());
  } catch (e) {
    return c.json({ error: 'invalid body', detail: (e as Error).message }, 400);
  }

  if (session.address.toLowerCase() !== body.address.toLowerCase()) {
    return c.json({ error: 'cannot edit another address profile' }, 403);
  }

  const existing = await getProfile(body.address);
  if (!existing) return c.json({ error: 'profile not found' }, 404);

  const merged = {
    ...existing,
    smeProfile: { ...(existing.smeProfile ?? {}), ...body.smeProfile },
  };
  const saved = await upsertProfile(merged);

  logger.info({ address: body.address }, 'sme: profile updated');
  return c.json({ smeProfile: saved.smeProfile });
});

/// Compute the rolling-window repayment behaviour for an address. Used
/// by the public passport route, the financier dashboards and the paid
/// x402 endpoint. Reads settled deals where the address is the seller
/// or financier.
export async function computeRepaymentBehavior(address: string): Promise<{
  windowDealCount: number;
  onTimeRate: number;
  averageDaysToSettle: number;
  defaultCount: number;
  lastSettledAt: number;
  computedAt: number;
}> {
  const deals = await listDealsForAddress(address);
  const settled = deals
    .filter((d) => d.settledAt && d.acceptedAt)
    .sort((a, b) => (b.settledAt ?? 0) - (a.settledAt ?? 0))
    .slice(0, 10);
  if (settled.length === 0) {
    return {
      windowDealCount: 0,
      onTimeRate: 0,
      averageDaysToSettle: 0,
      defaultCount: 0,
      lastSettledAt: 0,
      computedAt: Date.now(),
    };
  }
  const onTime = settled.filter(
    (d) => !d.deadlineUnix || (d.settledAt ?? 0) / 1000 <= d.deadlineUnix,
  ).length;
  const defaults = deals.filter(
    (d) => d.cancelKind === 'unilateral' || d.cancelKind === 'refund-from-dispute',
  ).length;
  const totalDaysToSettle = settled.reduce(
    (sum, d) => sum + ((d.settledAt ?? 0) - (d.acceptedAt ?? 0)) / 86_400_000,
    0,
  );
  return {
    windowDealCount: settled.length,
    onTimeRate: onTime / settled.length,
    averageDaysToSettle: totalDaysToSettle / settled.length,
    defaultCount: defaults,
    lastSettledAt: settled[0]?.settledAt ?? 0,
    computedAt: Date.now(),
  };
}
