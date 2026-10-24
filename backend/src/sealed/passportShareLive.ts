import type { Context } from 'hono';
import { config } from '../config.js';
import { sessionAddress } from '../auth/session.js';
import { findProfileByHandle } from '../db/profiles.js';
import { insertShare, liveSharesOf, noteShareView, shareByTokenHash, type PassportShare } from '../db/passportShares.js';
import { hashShareToken, shareOpens, type ShareDeps } from './passportShares.js';

export const liveShareDeps: ShareDeps = {
  now: () => Date.now(),
  live: liveSharesOf,
  insert: insertShare,
  findByTag: async (tag) => {
    const p = await findProfileByHandle(tag);
    return p ? { address: p.address, handle: p.handle } : null;
  },
  frontendBase: config.FRONTEND_BASE_URL ?? 'https://karwan.site',
};

/// The live share a read carries in `?share=`, when it opens this passport for
/// the caller. The passport read counts as one view on the share the owner sees;
/// the reads that fill in the same page do not.
export async function shareGrant(c: Context, subject: string, opts: { countView?: boolean } = {}): Promise<PassportShare | null> {
  const token = c.req.query('share');
  if (!token || token.length > 100) return null;
  const share = await shareByTokenHash(hashShareToken(token)).catch(() => null);
  const now = Date.now();
  if (!shareOpens(share, subject, sessionAddress(c), now)) return null;
  if (opts.countView) await noteShareView(share.id, now).catch(() => {});
  return share;
}
