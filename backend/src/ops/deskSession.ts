import { createHmac, timingSafeEqual } from 'node:crypto';

/// A desk session (view 64): signed, 12 hours, and stamped with the member's two
/// epochs. A password change bumps one, a revoke or a page taken away bumps the
/// other, and either ends every session minted before it.

export const DESK_SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const PREFIX = 'desk';

export interface DeskSessionClaims {
  id: string;
  exp: number;
  se: number;
  de: number;
}

function sign(payload: string, secret: string): string {
  return createHmac('sha256', `desk-session:${secret}`).update(payload).digest('base64url');
}

export function mintDeskSession(
  member: { id: string; sessionEpoch?: number; deskEpoch?: number },
  secret: string,
  now: number,
): { token: string; expiresAt: number } {
  const claims: DeskSessionClaims = { id: member.id, exp: now + DESK_SESSION_TTL_MS, se: member.sessionEpoch ?? 0, de: member.deskEpoch ?? 0 };
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  return { token: `${PREFIX}.${payload}.${sign(payload, secret)}`, expiresAt: claims.exp };
}

export function isDeskSession(raw: string): boolean {
  return raw.startsWith(`${PREFIX}.`);
}

export function readDeskSession(raw: string, secret: string, now: number): DeskSessionClaims | null {
  const parts = raw.split('.');
  if (parts.length !== 3 || parts[0] !== PREFIX || !parts[1] || !parts[2]) return null;
  const want = Buffer.from(sign(parts[1], secret));
  const got = Buffer.from(parts[2]);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  try {
    const c = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as DeskSessionClaims;
    if (typeof c.id !== 'string' || typeof c.exp !== 'number' || c.exp <= now) return null;
    return { id: c.id, exp: c.exp, se: Number(c.se) || 0, de: Number(c.de) || 0 };
  } catch {
    return null;
  }
}

/// Whether the account still stands behind a session or key: active, the same
/// epochs, the owner or someone with at least one ticked page, and, when
/// Cloudflare named a person, that same person.
export function memberStillAllowed(
  member: { email: string; disabledAt?: number; sessionEpoch?: number; deskEpoch?: number; deskOwner?: boolean; deskPages?: string[] },
  stamp: { se?: number; de: number },
  accessEmail: string | null,
): boolean {
  if (member.disabledAt) return false;
  if (stamp.se !== undefined && stamp.se !== (member.sessionEpoch ?? 0)) return false;
  if (stamp.de !== (member.deskEpoch ?? 0)) return false;
  if (!member.deskOwner && !(member.deskPages ?? []).length) return false;
  if (accessEmail && accessEmail !== member.email.toLowerCase()) return false;
  return true;
}
