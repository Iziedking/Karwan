import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Context } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { config } from '../config.js';

// Stateless session cookies, HMAC-signed with SESSION_SECRET so the backend
// doesn't have to remember anything between requests. Payload is small on
// purpose, just enough to identify the user and the auth method.

const COOKIE_NAME = 'karwan_session';
const DEFAULT_TTL_DAYS = 30;

export interface SessionPayload {
  /// The user's on-chain address. For web3 users this is their wallet's
  /// public address; for circle users it is their Circle identity wallet's
  /// address. Either way it is what the rest of the app reads as `address`.
  address: string;
  /// How the user signed in. The app treats both as first-class.
  method: 'web3' | 'circle';
  /// Email is present only for circle users; web3 users authenticate by
  /// wallet signature without ever giving up an email.
  email?: string;
  /// Expiry in seconds since epoch. Checked server-side on every read.
  exp: number;
}

function secret(): string {
  if (!config.SESSION_SECRET) {
    throw new Error(
      'SESSION_SECRET is not set — required to sign session cookies. Add to .env.',
    );
  }
  return config.SESSION_SECRET;
}

function b64url(buf: Buffer | string): string {
  const b = typeof buf === 'string' ? Buffer.from(buf, 'utf8') : buf;
  return b
    .toString('base64')
    .replace(/=+$/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function b64urlDecode(s: string): Buffer {
  const pad = (4 - (s.length % 4)) % 4;
  return Buffer.from(
    s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat(pad),
    'base64',
  );
}

function sign(body: string): string {
  return b64url(createHmac('sha256', secret()).update(body).digest());
}

export function signSession(payload: Omit<SessionPayload, 'exp'> & { ttlDays?: number }): string {
  const exp =
    Math.floor(Date.now() / 1000) + (payload.ttlDays ?? DEFAULT_TTL_DAYS) * 86_400;
  const full: SessionPayload = {
    address: payload.address.toLowerCase(),
    method: payload.method,
    email: payload.email,
    exp,
  };
  const body = b64url(JSON.stringify(full));
  const sig = sign(body);
  return `${body}.${sig}`;
}

export function verifySession(token: string): SessionPayload | null {
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const expected = sign(body);
  // Constant-time compare guards against signature-leaking timing oracles.
  const expectedBuf = Buffer.from(expected);
  const sigBuf = Buffer.from(sig);
  if (expectedBuf.length !== sigBuf.length) return null;
  if (!timingSafeEqual(expectedBuf, sigBuf)) return null;
  let payload: SessionPayload;
  try {
    payload = JSON.parse(b64urlDecode(body).toString('utf8')) as SessionPayload;
  } catch {
    return null;
  }
  if (payload.exp < Math.floor(Date.now() / 1000)) return null;
  return payload;
}

// Cookie helpers. We set HttpOnly so JS can't read the token, SameSite=Lax
// for dev convenience (same effective host: localhost), and bump to None+
// Secure in production. Path=/ so every route can read it.
function isProd(): boolean {
  return process.env.NODE_ENV === 'production';
}

export function setSessionCookie(c: Context, payload: Omit<SessionPayload, 'exp'>) {
  const token = signSession(payload);
  setCookie(c, COOKIE_NAME, token, {
    path: '/',
    httpOnly: true,
    secure: isProd(),
    sameSite: isProd() ? 'None' : 'Lax',
    maxAge: DEFAULT_TTL_DAYS * 86_400,
  });
}

export function readSession(c: Context): SessionPayload | null {
  const token = getCookie(c, COOKIE_NAME);
  if (!token) return null;
  return verifySession(token);
}

/// The authenticated caller's address, lowercased, or null when unauthenticated.
/// Use this (never a client-supplied param) to gate who may read a private
/// resource. The address is cryptographically bound to the signed session.
export function sessionAddress(c: Context): string | null {
  return readSession(c)?.address?.toLowerCase() ?? null;
}

/// True when the signed-in session matches the address a mutation claims to act
/// as. Mutations carry a `caller`/`posterAddress` in their body for the party
/// comparison, but that field is client-controlled and spoofable. Gate every
/// state-changing route with this so a user can only act as their own wallet.
/// Agent-driven flows are unaffected: the agents act in-process (not via these
/// HTTP routes), so they never carry a session and never hit this check.
export function isSessionSelf(c: Context, claimed: string | null | undefined): boolean {
  const s = sessionAddress(c);
  return !!s && !!claimed && s === claimed.toLowerCase();
}

/// True only when a session IS present and does NOT match the claimed actor.
/// Use this to gate mutations: it blocks a logged-in user from acting as someone
/// else, but does NOT block requests with no session at all. only Circle users
/// get a backend session today; web3 users authenticate by wallet and have none,
/// so a hard session requirement would lock them out. For the sessionless case
/// the route's own `caller === party` / on-chain signature still applies.
/// Tighten to isSessionSelf once web3 sessions (SIWE) exist (see todo.md).
export function sessionMismatchesClaim(c: Context, claimed: string | null | undefined): boolean {
  const s = sessionAddress(c);
  return !!s && !!claimed && s !== claimed.toLowerCase();
}

/// Viewer identity for read-gating: the verified session, and nothing else.
/// Web3 users now complete SIWE on connect (SiweGate in AppProviders mints a
/// real session cookie), so privacy reads no longer fall back to a client-
/// supplied `caller` query param. That fallback was spoofable: anyone could
/// read a private resource by naming a party's address, since the per-job gate
/// trusted the param as identity. Identity is the signed session, full stop.
export function viewerAddress(c: Context): string | null {
  return sessionAddress(c);
}

export function clearSessionCookie(c: Context) {
  deleteCookie(c, COOKIE_NAME, {
    path: '/',
    secure: isProd(),
    sameSite: isProd() ? 'None' : 'Lax',
  });
}
