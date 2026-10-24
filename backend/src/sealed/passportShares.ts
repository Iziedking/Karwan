import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { PassportShare } from '../db/passportShares.js';

/// Sharing a full passport (view 29). The passport is sealed: only its owner
/// sees the numbers. The owner can open it to one named person, signed in, or
/// to anyone holding the link, for 24 hours or 7 days, and stop it any time.

export const SHARE_HOURS = [24, 168] as const;
export type ShareHours = (typeof SHARE_HOURS)[number];
export const MAX_LIVE_SHARES = 5;

export interface ShareDeps {
  now: () => number;
  live: (subject: string, now: number) => Promise<PassportShare[]>;
  insert: (share: PassportShare) => Promise<void>;
  findByTag: (tag: string) => Promise<{ address: string; handle?: string | null } | null>;
  frontendBase: string;
}

export type ShareResult =
  | { ok: true; share: PassportShare; link: string }
  | { ok: false; error: string };

export function hashShareToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function shareLink(base: string, subject: string, token: string): string {
  return `${base.replace(/\/$/, '')}/credit-passport/${subject.toLowerCase()}?share=${token}`;
}

export async function createShare(
  subject: string,
  input: { withTag?: string | null; hours: number },
  deps: ShareDeps,
): Promise<ShareResult> {
  if (!SHARE_HOURS.includes(input.hours as ShareHours)) return { ok: false, error: 'A share lasts 24 hours or 7 days.' };
  const me = subject.toLowerCase();
  let viewer: string | null = null;
  let viewerTag: string | null = null;
  const tag = input.withTag?.trim().replace(/^@/, '');
  if (tag) {
    const person = await deps.findByTag(tag);
    if (!person) return { ok: false, error: 'No one on Karwan has that tag.' };
    if (person.address.toLowerCase() === me) return { ok: false, error: 'You already see your own full passport.' };
    viewer = person.address.toLowerCase();
    viewerTag = person.handle?.replace(/^@/, '') || tag;
  }
  const now = deps.now();
  const live = await deps.live(me, now);
  if (live.length >= MAX_LIVE_SHARES) return { ok: false, error: `You have ${MAX_LIVE_SHARES} live shares. Stop one first.` };
  const token = randomBytes(32).toString('base64url');
  const share: PassportShare = {
    id: randomUUID(),
    subject: me,
    viewer,
    viewerTag,
    tokenHash: hashShareToken(token),
    createdAt: now,
    expiresAt: now + input.hours * 3_600_000,
    stoppedAt: null,
    views: 0,
    lastViewedAt: null,
  };
  await deps.insert(share);
  return { ok: true, share, link: shareLink(deps.frontendBase, me, token) };
}

/// Whether this share opens this passport for this viewer right now. A share
/// for a named person opens only for that person, signed in; a forwarded link
/// shows the sealed passport.
export function shareOpens(share: PassportShare | null, subject: string, viewer: string | null, now: number): share is PassportShare {
  if (!share) return false;
  if (share.subject !== subject.toLowerCase()) return false;
  if (share.stoppedAt !== null || share.expiresAt <= now) return false;
  return share.viewer === null || (!!viewer && share.viewer === viewer.toLowerCase());
}

/// What the owner sees of a live share; never the token.
export function shareView(s: PassportShare) {
  return {
    id: s.id,
    with: s.viewerTag ? `@${s.viewerTag}` : null,
    until: s.expiresAt,
    views: s.views,
    createdAt: s.createdAt,
  };
}
