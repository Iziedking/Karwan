import { createPublicKey, verify as rsaVerify, type JsonWebKey } from 'node:crypto';
import type { Context, Next } from 'hono';
import { config } from '../config.js';
import { logger } from '../logger.js';

/// The admin desk is reached only through admin.karwan.site behind Cloudflare
/// Access (view 64). Access signs a pass onto every request it lets through, in
/// the Cf-Access-Jwt-Assertion header. Every admin request is answered "not
/// found" unless that pass verifies: RS256 against the team's published keys,
/// this app's audience tag, this team as issuer, and in date. Seeing the header
/// is not enough, because anyone can send a header.

export interface AccessKeySet {
  keys: Array<JsonWebKey & { kid?: string; alg?: string }>;
}

export type AccessPassResult =
  | { ok: true; email: string | null; serviceToken: string | null }
  | { ok: false; reason: string };

const SKEW_SECS = 60;

function decodePart(part: string): Record<string, unknown> | null {
  try {
    const v = JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function verifyAccessPass(
  token: string,
  keySet: AccessKeySet,
  opts: { teamDomain: string; aud: string; nowMs: number },
): AccessPassResult {
  const parts = token.split('.');
  if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) return { ok: false, reason: 'malformed' };
  const header = decodePart(parts[0]);
  const claims = decodePart(parts[1]);
  if (!header || !claims) return { ok: false, reason: 'malformed' };
  if (header.alg !== 'RS256') return { ok: false, reason: 'alg' };

  const data = Buffer.from(`${parts[0]}.${parts[1]}`);
  const sig = Buffer.from(parts[2], 'base64url');
  const kid = typeof header.kid === 'string' ? header.kid : undefined;
  // The matching kid first, then every other key: a rotation can briefly sign
  // with a key listed under a kid the token does not name.
  const ordered = [...keySet.keys].sort((a, b) => Number(b.kid === kid) - Number(a.kid === kid));
  const signed = ordered.some((jwk) => {
    if (jwk.kty !== 'RSA') return false;
    try {
      return rsaVerify('RSA-SHA256', data, createPublicKey({ key: jwk, format: 'jwk' }), sig);
    } catch {
      return false;
    }
  });
  if (!signed) return { ok: false, reason: 'signature' };

  const nowSecs = opts.nowMs / 1000;
  if (typeof claims.exp !== 'number' || claims.exp + SKEW_SECS < nowSecs) return { ok: false, reason: 'expired' };
  if (typeof claims.nbf === 'number' && claims.nbf - SKEW_SECS > nowSecs) return { ok: false, reason: 'early' };
  if (claims.iss !== `https://${opts.teamDomain}`) return { ok: false, reason: 'issuer' };
  const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!aud.includes(opts.aud)) return { ok: false, reason: 'audience' };

  const email = typeof claims.email === 'string' && claims.email ? claims.email.toLowerCase() : null;
  const serviceToken = !email && typeof claims.common_name === 'string' && claims.common_name ? claims.common_name : null;
  if (!email && !serviceToken) return { ok: false, reason: 'subject' };
  return { ok: true, email, serviceToken };
}

const KEYS_TTL_MS = 10 * 60_000;
const RELOAD_GAP_MS = 30_000;

export function createAccessPassGate(deps: {
  teamDomain: string | undefined;
  aud: string | undefined;
  production: boolean;
  now?: () => number;
  loadKeys?: (teamDomain: string) => Promise<AccessKeySet>;
}) {
  const now = deps.now ?? Date.now;
  const loadKeys = deps.loadKeys ?? fetchAccessKeys;
  let cached: { keys: AccessKeySet; at: number } | null = null;
  let forcedAt: number | null = null;

  // A pass signed by a key we have not seen reloads the keys, at most once per
  // gap, so a stream of forged passes cannot hammer Cloudflare.
  async function keys(force: boolean): Promise<AccessKeySet> {
    const t = now();
    if (cached && !force && t - cached.at < KEYS_TTL_MS) return cached.keys;
    if (cached && force) {
      if (forcedAt !== null && t - forcedAt < RELOAD_GAP_MS) return cached.keys;
      forcedAt = t;
    }
    cached = { keys: await loadKeys(deps.teamDomain!), at: t };
    return cached.keys;
  }

  return async function accessPassGate(c: Context, next: Next): Promise<Response | void> {
    const notFound = () => c.json({ error: 'not found' }, 404);
    if (!deps.teamDomain || !deps.aud) {
      if (deps.production) return notFound();
      return next();
    }
    const token = c.req.header('cf-access-jwt-assertion') ?? '';
    if (!token) return notFound();
    const opts = { teamDomain: deps.teamDomain, aud: deps.aud, nowMs: now() };
    let result: AccessPassResult;
    try {
      result = verifyAccessPass(token, await keys(false), opts);
      if (!result.ok && result.reason === 'signature') result = verifyAccessPass(token, await keys(true), opts);
    } catch (err) {
      logger.warn({ err: (err as Error).message }, 'admin desk: Cloudflare Access keys could not be loaded');
      return notFound();
    }
    if (!result.ok) return notFound();
    c.set('accessEmail' as never, result.email as never);
    c.set('accessServiceToken' as never, result.serviceToken as never);
    return next();
  };
}

async function fetchAccessKeys(teamDomain: string): Promise<AccessKeySet> {
  const res = await fetch(`https://${teamDomain}/cdn-cgi/access/certs`, { signal: AbortSignal.timeout(5_000) });
  if (!res.ok) throw new Error(`certs ${res.status}`);
  const body = (await res.json()) as AccessKeySet;
  if (!Array.isArray(body?.keys)) throw new Error('certs without keys');
  return body;
}

export const requireAccessPass = createAccessPassGate({
  teamDomain: config.ADMIN_ACCESS_TEAM_DOMAIN,
  aud: config.ADMIN_ACCESS_AUD,
  production: config.NODE_ENV === 'production',
});
