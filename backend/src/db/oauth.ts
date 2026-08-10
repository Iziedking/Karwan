import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db, pgEnabled } from './client.js';
import { oauthClients, oauthGrants } from './schema.js';
import type { TeamRole } from './teamKeys.js';

/// OAuth 2.1 storage: registered clients, authorization codes, tokens.
///
/// Hashed at rest, like the team keys, so a dump of these tables does not hand
/// anyone a working session. SHA-256 rather than scrypt here, deliberately:
/// scrypt is slow on purpose to defend LOW entropy secrets that humans choose.
/// These are 32 random bytes. There is nothing to brute force, and a slow hash
/// on the token path would just be a way to burn the server's CPU per request.
/// Passwords still use scrypt, in teamMembers.ts, which is where it belongs.

export type GrantKind = 'code' | 'token';

export interface OAuthClient {
  clientId: string;
  /// Absent for public clients, which is what Claude and ChatGPT are: they run
  /// on somebody's machine and cannot keep a secret. PKCE is what protects
  /// them, not a password.
  clientSecretHash?: string;
  clientName: string;
  /// Exact-match allowlist. Never prefix or wildcard matched: a loose redirect
  /// check is how authorization codes get delivered to an attacker.
  redirectUris: string[];
  createdAt: number;
  /// Dynamic registration is unauthenticated by design, so anyone can create a
  /// client. That is acceptable because a client alone grants nothing: a human
  /// still has to log in and approve. Recorded so a flood is visible.
  registeredFrom?: string;
}

export interface OAuthGrant {
  id: string;
  kind: GrantKind;
  /// SHA-256 of the value handed to the client.
  secretHash: string;
  clientId: string;
  memberId: string;
  role: TeamRole;
  /// The MCP server this is for, RFC 8707. A token minted for one resource must
  /// not work against another.
  resource: string;
  scope: string;
  createdAt: number;
  expiresAt: number;
  /// Codes are single use. Set the moment one is exchanged.
  usedAt?: number;
  revokedAt?: number;

  // code only
  redirectUri?: string;
  codeChallenge?: string;

  // token only
  refreshHash?: string;
  refreshExpiresAt?: number;
}

const STORE_PATH = process.env.OAUTH_STORE_PATH
  ? resolve(process.env.OAUTH_STORE_PATH)
  : resolve(process.cwd(), 'data', 'oauth.json');

/// Short enough that a leaked code in a log or a referrer is almost certainly
/// already dead, long enough to survive a slow redirect.
export const CODE_TTL_MS = 60_000;
export const ACCESS_TTL_MS = 60 * 60_000;
export const REFRESH_TTL_MS = 30 * 24 * 60 * 60_000;

function sha(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function sameHash(a: string, b: string): boolean {
  const x = Buffer.from(a, 'hex');
  const y = Buffer.from(b, 'hex');
  return x.length === y.length && timingSafeEqual(x, y);
}

/// The canonical form of a resource identifier, per RFC 8707 and the MCP spec's
/// guidance: no trailing slash, no fragment, lowercased host. Both sides of
/// every comparison go through this, so `https://mcp.karwan.site/mcp` and
/// `https://MCP.karwan.site/mcp/` are one resource rather than two.
export function canonicalResource(raw: string): string {
  let parsed: URL;
  try {
    parsed = new URL(raw.trim());
  } catch {
    return raw.trim();
  }
  parsed.hash = '';
  parsed.hostname = parsed.hostname.toLowerCase();
  let out = parsed.toString();
  if (parsed.pathname !== '/' && out.endsWith('/')) out = out.slice(0, -1);
  else if (parsed.pathname === '/' && out.endsWith('/')) out = out.slice(0, -1);
  return out;
}

// ---------------------------------------------------------------- clients

export async function registerClient(input: {
  clientName: string;
  redirectUris: string[];
  confidential?: boolean;
  registeredFrom?: string;
}): Promise<{ client: OAuthClient; clientSecret?: string }> {
  if (input.redirectUris.length === 0) throw new Error('at least one redirect_uri is required');

  for (const uri of input.redirectUris) {
    let parsed: URL;
    try {
      parsed = new URL(uri);
    } catch {
      throw new Error(`redirect_uri is not a valid absolute URI: ${uri}`);
    }
    // http is allowed only on loopback, which is how a desktop client receives
    // the redirect. Anywhere else it would send an authorization code across
    // the network in the clear.
    const loopback = ['localhost', '127.0.0.1', '[::1]', '::1'].includes(parsed.hostname);
    if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && loopback)) {
      throw new Error(`redirect_uri must be https, or http on loopback: ${uri}`);
    }
    if (parsed.hash) throw new Error(`redirect_uri must not carry a fragment: ${uri}`);
  }

  const clientId = randomUUID();
  const secret = input.confidential ? randomBytes(32).toString('base64url') : undefined;

  const client: OAuthClient = {
    clientId,
    clientName: input.clientName.slice(0, 120),
    redirectUris: input.redirectUris,
    createdAt: Date.now(),
    ...(secret ? { clientSecretHash: sha(secret) } : {}),
    ...(input.registeredFrom ? { registeredFrom: input.registeredFrom } : {}),
  };

  if (pgEnabled) {
    await db().insert(oauthClients).values({ clientId, data: client });
  } else {
    const store = load();
    store.clients[clientId] = client;
    save(store);
  }

  return { client, clientSecret: secret };
}

export async function getClient(clientId: string): Promise<OAuthClient | null> {
  if (pgEnabled) {
    const rows = await db().select().from(oauthClients).where(eq(oauthClients.clientId, clientId));
    return rows[0]?.data ?? null;
  }
  return load().clients[clientId] ?? null;
}

export function clientSecretMatches(client: OAuthClient, presented: string | undefined): boolean {
  if (!client.clientSecretHash) return true; // public client, PKCE is the proof
  if (!presented) return false;
  return sameHash(sha(presented), client.clientSecretHash);
}

/// Exact match, always. RFC 6749 allows some flexibility and every bit of it
/// has been used to steal codes.
export function redirectUriAllowed(client: OAuthClient, uri: string): boolean {
  return client.redirectUris.includes(uri);
}

// ---------------------------------------------------------------- codes

export async function issueCode(input: {
  clientId: string;
  memberId: string;
  role: TeamRole;
  redirectUri: string;
  codeChallenge: string;
  resource: string;
  scope: string;
}): Promise<string> {
  const secret = randomBytes(32).toString('base64url');
  const grant: OAuthGrant = {
    id: randomUUID(),
    kind: 'code',
    secretHash: sha(secret),
    clientId: input.clientId,
    memberId: input.memberId,
    role: input.role,
    resource: canonicalResource(input.resource),
    scope: input.scope,
    redirectUri: input.redirectUri,
    codeChallenge: input.codeChallenge,
    createdAt: Date.now(),
    expiresAt: Date.now() + CODE_TTL_MS,
  };
  await persist(grant);
  return `${grant.id}.${secret}`;
}

export interface CodeRedemption {
  ok: boolean;
  grant?: OAuthGrant;
  reason?: string;
}

/// Redeem a code. Single use, and a second attempt does not merely fail: it
/// revokes everything already issued from that code, because a replay means
/// either the code leaked or the client is broken, and neither deserves a live
/// token.
export async function redeemCode(input: {
  code: string;
  clientId: string;
  redirectUri: string;
  codeVerifier: string;
}): Promise<CodeRedemption> {
  const dot = input.code.indexOf('.');
  if (dot < 0) return { ok: false, reason: 'malformed code' };

  const id = input.code.slice(0, dot);
  const secret = input.code.slice(dot + 1);
  const grant = await getGrant(id);

  if (!grant || grant.kind !== 'code') return { ok: false, reason: 'unknown code' };
  if (!sameHash(sha(secret), grant.secretHash)) return { ok: false, reason: 'unknown code' };

  if (grant.usedAt) {
    await revokeDescendants(grant.id);
    return { ok: false, reason: 'this code has already been used' };
  }
  if (grant.revokedAt) return { ok: false, reason: 'this code was revoked' };
  if (grant.expiresAt < Date.now()) return { ok: false, reason: 'this code has expired' };

  // Bound to the client it was issued to, and to the exact redirect it was
  // issued against. Either mismatch means somebody else is holding it.
  if (grant.clientId !== input.clientId) return { ok: false, reason: 'wrong client for this code' };
  if (grant.redirectUri !== input.redirectUri) {
    return { ok: false, reason: 'redirect_uri does not match the authorization request' };
  }

  // PKCE, S256 only. `plain` is forbidden in OAuth 2.1 and offers no protection
  // against an attacker who already has the code.
  const computed = createHash('sha256').update(input.codeVerifier).digest('base64url');
  if (!grant.codeChallenge || computed !== grant.codeChallenge) {
    return { ok: false, reason: 'code_verifier does not match code_challenge' };
  }

  await persist({ ...grant, usedAt: Date.now() });
  return { ok: true, grant };
}

// ---------------------------------------------------------------- tokens

export interface IssuedToken {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export async function issueToken(input: {
  clientId: string;
  memberId: string;
  role: TeamRole;
  resource: string;
  scope: string;
  /// The code this came from, so a replayed code can revoke what it produced.
  parentId?: string;
}): Promise<IssuedToken> {
  const secret = randomBytes(32).toString('base64url');
  const refresh = randomBytes(32).toString('base64url');
  const now = Date.now();

  const grant: OAuthGrant = {
    id: input.parentId ? `${input.parentId}:${randomUUID()}` : randomUUID(),
    kind: 'token',
    secretHash: sha(secret),
    refreshHash: sha(refresh),
    refreshExpiresAt: now + REFRESH_TTL_MS,
    clientId: input.clientId,
    memberId: input.memberId,
    role: input.role,
    resource: canonicalResource(input.resource),
    scope: input.scope,
    createdAt: now,
    expiresAt: now + ACCESS_TTL_MS,
  };

  await persist(grant);
  return {
    accessToken: `${grant.id}.${secret}`,
    refreshToken: `${grant.id}.${refresh}`,
    expiresIn: Math.floor(ACCESS_TTL_MS / 1000),
  };
}

export interface Introspection {
  active: boolean;
  memberId?: string;
  role?: TeamRole;
  clientId?: string;
  scope?: string;
  resource?: string;
  expiresAt?: number;
  reason?: string;
}

/// Validate an access token for a specific resource.
///
/// The audience check is not optional. A token minted for one MCP server must
/// not work against another, or a malicious server could collect tokens and
/// replay them against ours.
export async function introspect(token: string, resource: string): Promise<Introspection> {
  const dot = token.indexOf('.');
  if (dot < 0) return { active: false, reason: 'malformed' };

  const id = token.slice(0, dot);
  const secret = token.slice(dot + 1);
  const grant = await getGrant(id);

  if (!grant || grant.kind !== 'token') return { active: false, reason: 'unknown' };
  if (!sameHash(sha(secret), grant.secretHash)) return { active: false, reason: 'unknown' };
  if (grant.revokedAt) return { active: false, reason: 'revoked' };
  if (grant.expiresAt < Date.now()) return { active: false, reason: 'expired' };

  if (canonicalResource(resource) !== grant.resource) {
    return { active: false, reason: 'this token was issued for a different resource' };
  }

  return {
    active: true,
    memberId: grant.memberId,
    role: grant.role,
    clientId: grant.clientId,
    scope: grant.scope,
    resource: grant.resource,
    expiresAt: grant.expiresAt,
  };
}

export interface RefreshResult {
  ok: boolean;
  grant?: OAuthGrant;
  reason?: string;
}

/// Exchange a refresh token. The old one dies here: refresh tokens rotate, so a
/// stolen one is usable at most once and the theft shows up as the legitimate
/// client suddenly being logged out.
export async function redeemRefresh(input: {
  refreshToken: string;
  clientId: string;
}): Promise<RefreshResult> {
  const dot = input.refreshToken.indexOf('.');
  if (dot < 0) return { ok: false, reason: 'malformed refresh token' };

  const id = input.refreshToken.slice(0, dot);
  const secret = input.refreshToken.slice(dot + 1);
  const grant = await getGrant(id);

  if (!grant || grant.kind !== 'token' || !grant.refreshHash) {
    return { ok: false, reason: 'unknown refresh token' };
  }
  if (!sameHash(sha(secret), grant.refreshHash)) return { ok: false, reason: 'unknown refresh token' };
  if (grant.revokedAt) return { ok: false, reason: 'this refresh token was revoked' };
  if ((grant.refreshExpiresAt ?? 0) < Date.now()) return { ok: false, reason: 'this refresh token has expired' };
  if (grant.clientId !== input.clientId) return { ok: false, reason: 'wrong client for this token' };

  await persist({ ...grant, revokedAt: Date.now() });
  return { ok: true, grant };
}

/// Kill everything a member holds. This is what makes disabling an account
/// meaningful: without it a disabled person keeps a working token for an hour.
export async function revokeForMember(memberId: string): Promise<number> {
  const all = await allGrants();
  const targets = all.filter((grant) => grant.memberId === memberId && !grant.revokedAt);
  const revokedAt = Date.now();

  if (pgEnabled) {
    await Promise.all(
      targets.map((grant) =>
        db()
          .update(oauthGrants)
          .set({ data: { ...grant, revokedAt } })
          .where(eq(oauthGrants.id, grant.id)),
      ),
    );
    return targets.length;
  }

  for (const grant of targets) await persist({ ...grant, revokedAt });
  return targets.length;
}

/// Revoke every token descended from one authorization code.
async function revokeDescendants(codeId: string): Promise<void> {
  const all = await allGrants();
  for (const grant of all) {
    if (!grant.id.startsWith(`${codeId}:`) || grant.revokedAt) continue;
    await persist({ ...grant, revokedAt: Date.now() });
  }
}

/// Drop expired rows. Codes live a minute and tokens an hour, so without a
/// sweep this table is mostly rubbish within a week.
export async function pruneExpired(now = Date.now()): Promise<number> {
  const all = await allGrants();
  let n = 0;
  for (const grant of all) {
    const dead = Math.max(grant.expiresAt, grant.refreshExpiresAt ?? 0);
    if (dead > now) continue;
    await removeGrant(grant.id);
    n += 1;
  }
  return n;
}

// ---------------------------------------------------------------- storage

async function getGrant(id: string): Promise<OAuthGrant | null> {
  if (pgEnabled) {
    const rows = await db().select().from(oauthGrants).where(eq(oauthGrants.id, id));
    return rows[0]?.data ?? null;
  }
  return load().grants[id] ?? null;
}

async function allGrants(): Promise<OAuthGrant[]> {
  if (pgEnabled) return (await db().select().from(oauthGrants)).map((r) => r.data);
  return Object.values(load().grants);
}

async function persist(grant: OAuthGrant): Promise<void> {
  if (pgEnabled) {
    const existing = await getGrant(grant.id);
    if (existing) {
      await db()
        .update(oauthGrants)
        .set({ memberId: grant.memberId, expiresAt: grant.expiresAt, data: grant })
        .where(eq(oauthGrants.id, grant.id));
    } else {
      await db().insert(oauthGrants).values({
        id: grant.id,
        memberId: grant.memberId,
        expiresAt: grant.expiresAt,
        data: grant,
      });
    }
    return;
  }
  const store = load();
  store.grants[grant.id] = grant;
  save(store);
}

async function removeGrant(id: string): Promise<void> {
  if (pgEnabled) {
    await db().delete(oauthGrants).where(eq(oauthGrants.id, id));
    return;
  }
  const store = load();
  delete store.grants[id];
  save(store);
}

interface FileStore {
  clients: Record<string, OAuthClient>;
  grants: Record<string, OAuthGrant>;
}

function ensureFile() {
  const dir = dirname(STORE_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  if (!existsSync(STORE_PATH)) writeFileSync(STORE_PATH, '{"clients":{},"grants":{}}', 'utf8');
}

function load(): FileStore {
  ensureFile();
  try {
    const parsed = JSON.parse(readFileSync(STORE_PATH, 'utf8')) as Partial<FileStore>;
    return { clients: parsed.clients ?? {}, grants: parsed.grants ?? {} };
  } catch {
    return { clients: {}, grants: {} };
  }
}

function save(store: FileStore) {
  ensureFile();
  writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), 'utf8');
}
