import { Hono, type Context } from 'hono';
import type { IssuedAttestation } from '../db/attestations.js';
import { carryProfile, type UserProfile, type UserSettings } from '../db/profiles.js';

export interface MeAttestationDeps {
  session: (c: Context) => string | null;
  list: (subject: string) => Promise<IssuedAttestation[]>;
  revoke: (id: string, reason: string) => Promise<IssuedAttestation | null>;
  saveSettings: (address: string, patch: Partial<UserSettings>) => Promise<void>;
}

/// A person removes every published statement about their own deals. Removal
/// revokes them (revocations are public, so apps that checked them see it) and
/// turns publishing off so the sweep issues no new ones. The address is always
/// the session's, never one passed in.
export function createMeAttestationRoutes(deps: MeAttestationDeps): Hono {
  const app = new Hono();
  app.post('/revoke', async (c) => {
    const address = deps.session(c)?.toLowerCase();
    if (!address) return c.json({ error: 'Sign in to remove your published deals.' }, 401);
    // Off first, so a sweep tick running now cannot add a statement after the
    // list below is read.
    await deps.saveSettings(address, { publishDeals: false });
    let revoked = 0;
    for (const row of await deps.list(address)) {
      if (row.revokedAt) continue;
      if (await deps.revoke(row.id, 'subject request')) revoked += 1;
    }
    return c.json({ revoked });
  });
  return app;
}

type ProfileWrite = Omit<UserProfile, 'createdAt' | 'updatedAt'>;

/// Merges settings into a person's profile, creating a minimal one when they
/// have none (as /api/settings does), so an opt-out is never silently dropped.
export function profileSettingsSaver(
  get: (address: string) => Promise<UserProfile | null>,
  upsert: (input: ProfileWrite) => Promise<UserProfile>,
) {
  return async (address: string, patch: Partial<UserSettings>): Promise<void> => {
    const existing = await get(address);
    if (!existing) {
      await upsert({ address, role: 'buyer', displayName: '', settings: patch } as ProfileWrite);
      return;
    }
    await upsert({ ...carryProfile(existing, ['settings']), settings: { ...(existing.settings ?? {}), ...patch } } as ProfileWrite);
  };
}
