import { Hono } from 'hono';
import { z } from 'zod';
import { getProfile } from '../db/profiles.js';
import { decideEligibility, businessVerificationState, skillVerificationState, policyFlags, verificationPolicyVersion } from '../verification/policy.js';
import type { PolicyFlags } from '../verification/types.js';

const addressSchema = z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'expected 0x-prefixed 20-byte hex address');

export type VerificationRouteDeps = {
  getProfile: typeof getProfile;
  getPolicyFlags: () => PolicyFlags;
  getPolicyVersion: () => string;
  now?: () => number;
};

export function createVerificationRoutes(deps: VerificationRouteDeps = {
  getProfile,
  getPolicyFlags: () => policyFlags,
  getPolicyVersion: () => verificationPolicyVersion,
}) {
  const routes = new Hono();
  routes.get('/eligibility/:address', async (c) => {
    const parsed = addressSchema.safeParse(c.req.param('address'));
    if (!parsed.success) return c.json({ error: 'invalid address' }, 400);
    const address = parsed.data.toLowerCase();
    const profile = await deps.getProfile(address);
    if (!profile) return c.json({ error: 'profile not found' }, 404);
    const isBusiness = profile.accountKind === 'business' || profile.accountType === 'business' || (profile.business !== undefined && profile.business.status !== 'none');
    const accountKind = isBusiness ? 'business' : 'individual';
    const verification = accountKind === 'business'
      ? businessVerificationState(profile.business, deps.now?.())
      : skillVerificationState(profile.skillVerifications, undefined, deps.now?.());
    const eligibility = decideEligibility({ accountKind, verification, flags: deps.getPolicyFlags(), policyVersion: deps.getPolicyVersion() });
    return c.json({ address, accountKind, verification, eligibility });
  });
  return routes;
}

export const verificationRoutes = createVerificationRoutes();