import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Context } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { config } from '../config.js';
import { ARC } from '../chain/client.js';
import { pgEnabled, postgresExecutor } from '../db/client.js';
import { logger } from '../logger.js';
import {
  createClosedList,
  deviceName,
  memorySessionRecordStore,
  newSid,
  postgresSessionRecordStore,
  type SessionRecordStore,
} from './sessionRecords.js';

// Session cookies, HMAC-signed with SESSION_SECRET. Each one names a session
// record (view 65): every request checks that record against the closed list,
// so a person can sign any device out from Profile or from chat.

export const COOKIE_NAME = 'karwan_session';
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
  /// The Arc chain the session was issued for. Absent on sessions issued before
  /// mainnet existed.
  chainId?: number;
  /// Set on the half-hour session a chat's one-time link opens.
  via?: 'open_link';
  /// Issued at, seconds since epoch. Absent on sessions from before it was recorded.
  iat?: number;
  /// The session record (view 65). Absent on cookies from before records,
  /// which get one on their first request.
  sid?: string;
  /// Set only on the token a chat channel signs for one call into this app.
  /// It never leaves the process and has no record.
  inp?: true;
  /// Expiry in seconds since epoch. Checked server-side on every read.
  exp: number;
}

// The placeholder shipped in .env.example. A production deploy that kept it
// would make every session cookie forgeable by anyone who has read the repo.
const EXAMPLE_SECRET = 'dev-secret-change-me-please-32-chars-min';

function secret(): string {
  if (!config.SESSION_SECRET) {
    throw new Error(
      'SESSION_SECRET is not set — required to sign session cookies. Add to .env.',
    );
  }
  if (process.env.NODE_ENV === 'production' && config.SESSION_SECRET === EXAMPLE_SECRET) {
    throw new Error(
      'SESSION_SECRET still equals the .env.example placeholder — refusing to sign sessions in production. Set a unique random value.',
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

/// A session only counts on the chain it was issued for, so a testnet session
/// can never act on mainnet even if both deployments shared a secret. Sessions
/// from before the chain was recorded stay valid on testnet only.
export function sessionChainOk(
  sessionChainId: number | undefined,
  active: { chainId: number; testnet: boolean },
): boolean {
  if (sessionChainId === undefined) return active.testnet;
  return sessionChainId === active.chainId;
}

function sign(body: string): string {
  return b64url(createHmac('sha256', secret()).update(body).digest());
}

export function signSession(
  payload: Omit<SessionPayload, 'exp'> & { ttlDays?: number; ttlSecs?: number },
): string {
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + (payload.ttlSecs ?? (payload.ttlDays ?? DEFAULT_TTL_DAYS) * 86_400);
  const full: SessionPayload = {
    address: payload.address.toLowerCase(),
    method: payload.method,
    email: payload.email,
    chainId: ARC.chainId,
    ...(payload.via ? { via: payload.via } : {}),
    ...(payload.sid ? { sid: payload.sid } : {}),
    ...(payload.inp ? { inp: true as const } : {}),
    iat,
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
  if (!sessionChainOk(payload.chainId, ARC)) return null;
  if (payload.sid && closedSessions.has(payload.sid)) return null;
  return payload;
}

// ---------------------------------------------------------------- records

let records: SessionRecordStore = pgEnabled ? postgresSessionRecordStore(postgresExecutor()) : memorySessionRecordStore();
const closedSessions = createClosedList(() => records.closedSince(Date.now()));

export function sessionRecordStore(): SessionRecordStore {
  return records;
}

/// Tests point the records at their own store.
export function useSessionRecordsForTests(next: SessionRecordStore): void {
  records = next;
}

export function refreshClosedSessions(): Promise<void> {
  return closedSessions.refresh();
}

/// Every minute, so a sign-out on another server reaches this one.
export function startClosedSessionRefresh(): () => void {
  const tick = () => void refreshClosedSessions().catch((err) => logger.warn({ err: (err as Error).message }, 'closed sessions refresh failed'));
  tick();
  const t = setInterval(tick, 60_000);
  t.unref?.();
  return () => clearInterval(t);
}

export async function closeSession(address: string, sid: string): Promise<boolean> {
  const rec = await records.get(sid);
  if (!rec || rec.address !== address.toLowerCase()) return false;
  const closed = await records.close(sid, Date.now());
  closedSessions.add([sid]);
  return closed;
}

export async function closeAllSessions(address: string): Promise<number> {
  const sids = await records.closeAllFor(address.toLowerCase(), Date.now());
  closedSessions.add(sids);
  return sids.length;
}

async function openRecord(c: Context, payload: { address: string; method: SessionPayload['method']; via?: SessionPayload['via'] }, expiresAtMs: number): Promise<string> {
  const sid = newSid();
  const now = Date.now();
  await records.insert({
    sid,
    address: payload.address.toLowerCase(),
    method: payload.method,
    device: payload.via === 'open_link' ? 'Chat link' : deviceName(c.req.header('user-agent')),
    ...(payload.via ? { via: payload.via } : {}),
    createdAt: now,
    lastSeenAt: now,
    expiresAt: expiresAtMs,
  });
  return sid;
}

// Cookie helpers. We set HttpOnly so JS can't read the token, SameSite=Lax
// for dev convenience (same effective host: localhost), and bump to None+
// Secure in production. Path=/ so every route can read it.
function isProd(): boolean {
  return process.env.NODE_ENV === 'production';
}

/// `ttlSecs` shortens a session that should not outlive one task, such as the
/// one-time link a chat account opens for a verification page. The record is
/// written first: a session that could not be recorded could not be signed out,
/// so it is not handed out.
export async function setSessionCookie(c: Context, payload: Omit<SessionPayload, 'exp'>, opts: { ttlSecs?: number } = {}) {
  const ttlSecs = opts.ttlSecs ?? DEFAULT_TTL_DAYS * 86_400;
  const sid = await openRecord(c, payload, Date.now() + ttlSecs * 1000);
  const token = signSession({ ...payload, sid, ttlSecs });
  setCookie(c, COOKIE_NAME, token, {
    path: '/',
    httpOnly: true,
    secure: isProd(),
    sameSite: isProd() ? 'None' : 'Lax',
    maxAge: ttlSecs,
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

const TOUCH_EVERY_MS = 5 * 60_000;
const touched = new Map<string, number>();

/// Runs on every request. A cookie from before records gets one and a fresh
/// cookie with the same end; a recorded one has its last-seen time kept, at
/// most every five minutes.
export async function sessionUpkeep(c: Context, next: () => Promise<void>): Promise<void> {
  const payload = readSession(c);
  if (payload && !payload.inp) {
    try {
      if (!payload.sid) {
        const remaining = payload.exp - Math.floor(Date.now() / 1000);
        if (remaining > 60) {
          const sid = await openRecord(c, payload, payload.exp * 1000);
          const { exp: _exp, iat: _iat, ...rest } = payload;
          const token = signSession({ ...rest, sid, ttlSecs: remaining });
          setCookie(c, COOKIE_NAME, token, { path: '/', httpOnly: true, secure: isProd(), sameSite: isProd() ? 'None' : 'Lax', maxAge: remaining });
        }
      } else {
        const now = Date.now();
        if ((touched.get(payload.sid) ?? 0) + TOUCH_EVERY_MS < now) {
          touched.set(payload.sid, now);
          if (touched.size > 50_000) touched.clear();
          void records.touch(payload.sid, now).catch(() => undefined);
        }
      }
    } catch (err) {
      logger.warn({ err: (err as Error).message }, 'session record upkeep failed');
    }
  }
  await next();
}

export function clearSessionCookie(c: Context) {
  deleteCookie(c, COOKIE_NAME, {
    path: '/',
    secure: isProd(),
    sameSite: isProd() ? 'None' : 'Lax',
  });
}
