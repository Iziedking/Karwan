import { createHmac, timingSafeEqual } from 'node:crypto';
import { accessFor } from './adminPages.js';

/// A desk session (views 64 and 79): signed, good on one network, and stamped
/// with the member's two epochs. A password change bumps one, a revoke or a page
/// taken away bumps the other, and either ends every session minted before it.
/// It ends 30 minutes after its last use and 12 hours after it began; each use
/// renews it, so nothing is stored per session.

export const DESK_SESSION_TTL_MS = 12 * 60 * 60 * 1000;
export const DESK_IDLE_MS = 30 * 60 * 1000;

export type DeskNetwork = 'testnet' | 'mainnet';
const PREFIX = 'desk';

export interface DeskSessionClaims {
  id: string;
  net: DeskNetwork;
  /// When the session began.
  st: number;
  exp: number;
  se: number;
  de: number;
}

function sign(payload: string, secret: string): string {
  return createHmac('sha256', `desk-session:${secret}`).update(payload).digest('base64url');
}

function seal(claims: DeskSessionClaims, secret: string): { token: string; expiresAt: number } {
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  return { token: `${PREFIX}.${payload}.${sign(payload, secret)}`, expiresAt: claims.exp };
}

export function mintDeskSession(
  member: { id: string; sessionEpoch?: number; deskEpoch?: number },
  secret: string,
  now: number,
  net: DeskNetwork,
): { token: string; expiresAt: number } {
  return seal({ id: member.id, net, st: now, exp: now + DESK_IDLE_MS, se: member.sessionEpoch ?? 0, de: member.deskEpoch ?? 0 }, secret);
}

/// The claims after one more use at `now`: the end moves to 30 minutes from
/// now, never past 12 hours from the start. Null once the session has ended.
export function nextDeskClaims(claims: DeskSessionClaims, now: number): DeskSessionClaims | null {
  if (claims.exp <= now) return null;
  const exp = Math.min(claims.st + DESK_SESSION_TTL_MS, now + DESK_IDLE_MS);
  return exp > now ? { ...claims, exp } : null;
}

export function renewDeskSession(claims: DeskSessionClaims, secret: string, now: number): { token: string; expiresAt: number } | null {
  const next = nextDeskClaims(claims, now);
  return next ? seal(next, secret) : null;
}

export function isDeskSession(raw: string): boolean {
  return raw.startsWith(`${PREFIX}.`);
}

export function readDeskSession(raw: string, secret: string, now: number, net: DeskNetwork): DeskSessionClaims | null {
  const parts = raw.split('.');
  if (parts.length !== 3 || parts[0] !== PREFIX || !parts[1] || !parts[2]) return null;
  const want = Buffer.from(sign(parts[1], secret));
  const got = Buffer.from(parts[2]);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  try {
    const c = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as Partial<DeskSessionClaims>;
    if (typeof c.id !== 'string' || typeof c.exp !== 'number' || c.exp <= now) return null;
    // A session minted before view 79 has no network and no start: signed out.
    if (c.net !== net || typeof c.st !== 'number') return null;
    return { id: c.id, net: c.net, st: c.st, exp: c.exp, se: Number(c.se) || 0, de: Number(c.de) || 0 };
  } catch {
    return null;
  }
}

/// Whether the account still stands behind a session or key: active, the same
/// epochs, the owner or someone with at least one ticked page, and, when
/// Cloudflare named a person, that same person.
export function memberStillAllowed(
  member: { email: string; disabledAt?: number; sessionEpoch?: number; deskEpoch?: number; deskOwner?: boolean; deskPages?: string[]; deskAccess?: Record<string, unknown> },
  stamp: { se?: number; de: number },
  accessEmail: string | null,
): boolean {
  if (member.disabledAt) return false;
  if (stamp.se !== undefined && stamp.se !== (member.sessionEpoch ?? 0)) return false;
  if (stamp.de !== (member.deskEpoch ?? 0)) return false;
  if (!member.deskOwner && !Object.keys(accessFor(member)).length) return false;
  if (accessEmail && accessEmail !== member.email.toLowerCase()) return false;
  return true;
}

// ---------------------------------------------------------------- sign-in tickets (view 79)

/// Between the password and the mainnet code: names the member and the network,
/// lasts 5 minutes, and on a first sign-in carries the new code secret, sealed,
/// until a code proves the phone has it.
export const DESK_TICKET_TTL_MS = 5 * 60 * 1000;
const TICKET_PREFIX = 'deskt';

export interface DeskTicketClaims {
  id: string;
  net: DeskNetwork;
  exp: number;
  /// A new code secret, sealed, during first-time setup.
  ps?: string;
}

function signTicket(payload: string, secret: string): string {
  return createHmac('sha256', `desk-ticket:${secret}`).update(payload).digest('base64url');
}

export function mintDeskTicket(memberId: string, net: DeskNetwork, secret: string, now: number, pendingSecret?: string): string {
  const claims: DeskTicketClaims = { id: memberId, net, exp: now + DESK_TICKET_TTL_MS, ...(pendingSecret ? { ps: pendingSecret } : {}) };
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  return `${TICKET_PREFIX}.${payload}.${signTicket(payload, secret)}`;
}

export function readDeskTicket(raw: string, secret: string, now: number, net: DeskNetwork): DeskTicketClaims | null {
  const parts = raw.split('.');
  if (parts.length !== 3 || parts[0] !== TICKET_PREFIX || !parts[1] || !parts[2]) return null;
  const want = Buffer.from(signTicket(parts[1], secret));
  const got = Buffer.from(parts[2]);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  try {
    const c = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as Partial<DeskTicketClaims>;
    if (typeof c.id !== 'string' || typeof c.exp !== 'number' || c.exp <= now || c.net !== net) return null;
    return { id: c.id, net: c.net, exp: c.exp, ...(typeof c.ps === 'string' ? { ps: c.ps } : {}) };
  } catch {
    return null;
  }
}
