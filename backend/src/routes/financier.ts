import { Hono } from 'hono';
import { z } from 'zod';
import { readSession } from '../auth/session.js';
import { requireAdmin } from '../middleware/adminAuth.js';
import { getProfile, upsertProfile, type UserProfile } from '../db/profiles.js';
import { financierEligibility } from '../profile/financier.js';
import { listOffersByFinancier } from '../db/factoring.js';
import { listLinesByFinancier } from '../db/poFinancing.js';
import { config } from '../config.js';
import { logger } from '../logger.js';

/// Financier capability. Anyone can apply (from the SME rail) to fund factoring
/// and PO-financing lines, but must clear an eligibility bar: minimum account
/// tenure on Karwan, a non-zero stake, and reputation at least COLD. On an
/// eligible apply the desk is granted immediately (FINANCIER_AUTO_APPROVE); the
/// admin review route is the hook for tightening this later. Replaces the old
/// implicit model where any account that posted an offer was a financier.

export const financierRoutes = new Hono();

/// Existing financiers (who funded under the old implicit model) must not be
/// locked out by the new gate. If an address already holds any factoring offer
/// or PO line, it is grandfathered to approved.
async function hasPriorFinancing(address: string): Promise<boolean> {
  const [offers, lines] = await Promise.all([
    listOffersByFinancier(address).catch(() => []),
    listLinesByFinancier(address).catch(() => []),
  ]);
  return offers.length > 0 || lines.length > 0;
}

function grant(profile: UserProfile, status: 'approved' | 'applied', snapshot?: UserProfile['financier']) {
  const now = Date.now();
  const updated: UserProfile = {
    ...profile,
    financier: {
      status,
      appliedAt: profile.financier?.appliedAt ?? now,
      ...(status === 'approved' ? { approvedAt: now } : {}),
      ...(snapshot?.eligibilitySnapshot ? { eligibilitySnapshot: snapshot.eligibilitySnapshot } : {}),
    },
  };
  return updated;
}

/// GET /api/financier/eligibility: the signed-in user's live eligibility
/// breakdown + current financier status, so the apply UI can show progress.
financierRoutes.get('/eligibility', async (c) => {
  const session = readSession(c);
  if (!session) return c.json({ error: 'not authenticated' }, 401);
  const [eligibility, profile] = await Promise.all([
    financierEligibility(session.address),
    getProfile(session.address),
  ]);
  return c.json({ ...eligibility, status: profile?.financier?.status ?? 'none' });
});

/// POST /api/financier/apply: self-serve application. Re-checks eligibility
/// server-side (never trusts the client). On success grants the desk
/// immediately when FINANCIER_AUTO_APPROVE, else records 'applied' for review.
financierRoutes.post('/apply', async (c) => {
  const session = readSession(c);
  if (!session) return c.json({ error: 'not authenticated' }, 401);
  const profile = await getProfile(session.address);
  if (!profile) return c.json({ error: 'profile not found' }, 404);
  if (profile.financier?.status === 'approved') {
    return c.json({ ok: true, status: 'approved' });
  }

  // Grandfather an existing financier regardless of the new bar.
  if (await hasPriorFinancing(session.address)) {
    await upsertProfile(grant(profile, 'approved'));
    logger.info({ address: session.address.toLowerCase() }, 'financier grandfathered (prior financing)');
    return c.json({ ok: true, status: 'approved', grandfathered: true });
  }

  const eligibility = await financierEligibility(session.address);
  if (!eligibility.eligible) {
    return c.json({ error: 'not yet eligible', reasons: eligibility.reasons, eligibility }, 409);
  }

  const status = config.FINANCIER_AUTO_APPROVE ? 'approved' : 'applied';
  const snapshot: UserProfile['financier'] = {
    status,
    eligibilitySnapshot: {
      tenureDays: eligibility.tenureDays,
      stakeUsdc: eligibility.stakeUsdc,
      repScore: eligibility.repScore,
      repTier: eligibility.repTier,
      at: Date.now(),
    },
  };
  await upsertProfile(grant(profile, status, snapshot));
  logger.info({ address: session.address.toLowerCase(), status }, 'financier application recorded');
  return c.json({ ok: true, status });
});

/// POST /api/financier/admin/review: admin grants or rejects an application.
/// The hook for when FINANCIER_AUTO_APPROVE is turned off.
const reviewSchema = z.object({
  address: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  decision: z.enum(['approve', 'reject']),
  reason: z.string().max(280).optional(),
});
financierRoutes.post('/admin/review', requireAdmin, async (c) => {
  let body;
  try {
    body = reviewSchema.parse(await c.req.json());
  } catch (e) {
    return c.json({ error: 'invalid body', detail: (e as Error).message }, 400);
  }
  const profile = await getProfile(body.address);
  if (!profile) return c.json({ error: 'profile not found' }, 404);
  const now = Date.now();
  const approved = body.decision === 'approve';
  const updated: UserProfile = {
    ...profile,
    financier: {
      ...(profile.financier ?? { status: 'none' }),
      status: approved ? 'approved' : 'rejected',
      ...(approved ? { approvedAt: now } : { rejectedAt: now, rejectReason: body.reason }),
      reviewer: 'admin',
    },
  };
  await upsertProfile(updated);
  return c.json({ ok: true, status: approved ? 'approved' : 'rejected' });
});
