import { test, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { existsSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

/// The OAuth storage layer, tested against the attacks it exists to stop.
///
/// Every case here is a real way OAuth deployments get broken: a code replayed,
/// a code redeemed by the wrong client, a redirect_uri swapped at exchange
/// time, PKCE skipped, a token minted for one server replayed against another,
/// a refresh token reused after rotation. The happy path is one test; the rest
/// are refusals.
///
///   npx tsx --test src/db/oauth.test.ts

assert.equal(
  process.env.DATABASE_URL,
  undefined,
  'refusing to run: DATABASE_URL is set, which would run this against a real database',
);

const STORE = join(tmpdir(), `karwan-oauth-${process.pid}.json`);
process.env.OAUTH_STORE_PATH = STORE;

const {
  registerClient,
  getClient,
  clientSecretMatches,
  redirectUriAllowed,
  issueCode,
  redeemCode,
  issueToken,
  introspect,
  redeemRefresh,
  revokeForMember,
  pruneExpired,
  canonicalResource,
  CODE_TTL_MS,
} = await import('./oauth.js');

const RESOURCE = 'https://mcp.karwan.site/mcp';
const REDIRECT = 'https://claude.ai/api/mcp/auth_callback';

beforeEach(() => {
  if (existsSync(STORE)) rmSync(STORE);
});

after(() => {
  if (existsSync(STORE)) rmSync(STORE);
});

function pkce() {
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

async function client(redirectUris = [REDIRECT]) {
  const { client } = await registerClient({ clientName: 'Claude', redirectUris });
  return client;
}

async function codeFor(clientId: string, challenge: string, resource = RESOURCE) {
  return issueCode({
    clientId,
    memberId: 'member-1',
    role: 'marketing',
    redirectUri: REDIRECT,
    codeChallenge: challenge,
    resource,
    scope: 'mcp',
  });
}

test('the happy path: register, authorize, exchange, use', async () => {
  const c = await client();
  const { verifier, challenge } = pkce();
  const code = await codeFor(c.clientId, challenge);

  const redeemed = await redeemCode({
    code,
    clientId: c.clientId,
    redirectUri: REDIRECT,
    codeVerifier: verifier,
  });
  assert.equal(redeemed.ok, true, redeemed.reason);

  const token = await issueToken({
    clientId: c.clientId,
    memberId: 'member-1',
    role: 'marketing',
    resource: RESOURCE,
    scope: 'mcp',
  });

  const check = await introspect(token.accessToken, RESOURCE);
  assert.equal(check.active, true, check.reason);
  assert.equal(check.role, 'marketing');
  assert.equal(check.memberId, 'member-1');
  assert.ok(token.expiresIn > 0);
});

test('a code cannot be used twice, and a replay kills what it already produced', async () => {
  const c = await client();
  const { verifier, challenge } = pkce();
  const code = await codeFor(c.clientId, challenge);

  const first = await redeemCode({ code, clientId: c.clientId, redirectUri: REDIRECT, codeVerifier: verifier });
  assert.equal(first.ok, true);

  const token = await issueToken({
    clientId: c.clientId,
    memberId: 'member-1',
    role: 'marketing',
    resource: RESOURCE,
    scope: 'mcp',
    parentId: first.grant!.id,
  });
  assert.equal((await introspect(token.accessToken, RESOURCE)).active, true);

  // The replay itself fails, which is the minimum. What matters more is that it
  // takes the earlier token with it: a replay means the code leaked, and the
  // token it already produced is in unknown hands.
  const second = await redeemCode({ code, clientId: c.clientId, redirectUri: REDIRECT, codeVerifier: verifier });
  assert.equal(second.ok, false);
  assert.match(second.reason ?? '', /already been used/);

  const after = await introspect(token.accessToken, RESOURCE);
  assert.equal(after.active, false, 'the token from a replayed code is still live');
  assert.equal(after.reason, 'revoked');
});

test('PKCE is enforced, and only S256', async () => {
  const c = await client();
  const { verifier, challenge } = pkce();
  const code = await codeFor(c.clientId, challenge);

  // Wrong verifier.
  const wrong = await redeemCode({
    code,
    clientId: c.clientId,
    redirectUri: REDIRECT,
    codeVerifier: randomBytes(32).toString('base64url'),
  });
  assert.equal(wrong.ok, false);
  assert.match(wrong.reason ?? '', /code_verifier/);

  // The plain challenge method, forbidden in OAuth 2.1: sending the verifier as
  // the challenge must not authenticate.
  const plainCode = await codeFor(c.clientId, verifier);
  const plain = await redeemCode({
    code: plainCode,
    clientId: c.clientId,
    redirectUri: REDIRECT,
    codeVerifier: verifier,
  });
  assert.equal(plain.ok, false, 'a plain code_challenge was accepted');
});

test('a code is bound to its client and its redirect_uri', async () => {
  const a = await client();
  const b = await client(['https://evil.example/callback']);
  const { verifier, challenge } = pkce();
  const code = await codeFor(a.clientId, challenge);

  const otherClient = await redeemCode({
    code,
    clientId: b.clientId,
    redirectUri: REDIRECT,
    codeVerifier: verifier,
  });
  assert.equal(otherClient.ok, false);
  assert.match(otherClient.reason ?? '', /wrong client/);

  const otherRedirect = await redeemCode({
    code,
    clientId: a.clientId,
    redirectUri: 'https://evil.example/callback',
    codeVerifier: verifier,
  });
  assert.equal(otherRedirect.ok, false);
  assert.match(otherRedirect.reason ?? '', /redirect_uri/);
});

test('a code expires', async () => {
  const c = await client();
  const { verifier, challenge } = pkce();
  const code = await codeFor(c.clientId, challenge);

  // Reach into the store and age it, rather than sleeping a minute.
  const raw = JSON.parse(readFileSync(STORE, 'utf8'));
  for (const g of Object.values(raw.grants) as Array<{ expiresAt: number }>) {
    g.expiresAt = Date.now() - 1;
  }
  const { writeFileSync } = await import('node:fs');
  writeFileSync(STORE, JSON.stringify(raw), 'utf8');

  const result = await redeemCode({ code, clientId: c.clientId, redirectUri: REDIRECT, codeVerifier: verifier });
  assert.equal(result.ok, false);
  assert.match(result.reason ?? '', /expired/);
  assert.ok(CODE_TTL_MS <= 600_000, 'a code lifetime over ten minutes is too long to be safe');
});

test('a token is bound to the resource it was minted for', async () => {
  const c = await client();
  const token = await issueToken({
    clientId: c.clientId,
    memberId: 'member-1',
    role: 'dev',
    resource: RESOURCE,
    scope: 'mcp',
  });

  assert.equal((await introspect(token.accessToken, RESOURCE)).active, true);

  // The attack: a hostile MCP server collects tokens and replays them against
  // ours. Audience binding is what stops it.
  const elsewhere = await introspect(token.accessToken, 'https://evil.example/mcp');
  assert.equal(elsewhere.active, false);
  assert.match(elsewhere.reason ?? '', /different resource/);
});

test('resource identifiers compare canonically', () => {
  assert.equal(canonicalResource('https://MCP.Karwan.site/mcp/'), 'https://mcp.karwan.site/mcp');
  assert.equal(canonicalResource('https://mcp.karwan.site/mcp#frag'), 'https://mcp.karwan.site/mcp');
  assert.equal(canonicalResource('https://mcp.karwan.site/'), 'https://mcp.karwan.site');
  // Different paths stay different.
  assert.notEqual(canonicalResource('https://mcp.karwan.site/a'), canonicalResource('https://mcp.karwan.site/b'));
});

test('refresh tokens rotate, and the old one dies', async () => {
  const c = await client();
  const token = await issueToken({
    clientId: c.clientId,
    memberId: 'member-1',
    role: 'marketing',
    resource: RESOURCE,
    scope: 'mcp',
  });

  const first = await redeemRefresh({ refreshToken: token.refreshToken, clientId: c.clientId });
  assert.equal(first.ok, true, first.reason);

  // Reuse of a rotated refresh token is how a theft announces itself.
  const replay = await redeemRefresh({ refreshToken: token.refreshToken, clientId: c.clientId });
  assert.equal(replay.ok, false);

  // And it is bound to its client.
  const other = await client(['https://other.example/cb']);
  const wrongClient = await redeemRefresh({ refreshToken: token.refreshToken, clientId: other.clientId });
  assert.equal(wrongClient.ok, false);
});

test('revoking a member kills every token they hold, immediately', async () => {
  const c = await client();
  const a = await issueToken({ clientId: c.clientId, memberId: 'gone', role: 'dev', resource: RESOURCE, scope: 'mcp' });
  const b = await issueToken({ clientId: c.clientId, memberId: 'gone', role: 'dev', resource: RESOURCE, scope: 'mcp' });
  const other = await issueToken({ clientId: c.clientId, memberId: 'stays', role: 'dev', resource: RESOURCE, scope: 'mcp' });

  assert.equal(await revokeForMember('gone'), 2);

  assert.equal((await introspect(a.accessToken, RESOURCE)).active, false);
  assert.equal((await introspect(b.accessToken, RESOURCE)).active, false);
  // Somebody else's access must survive.
  assert.equal((await introspect(other.accessToken, RESOURCE)).active, true);

  // A revoked token's refresh must not resurrect it.
  assert.equal((await redeemRefresh({ refreshToken: a.refreshToken, clientId: c.clientId })).ok, false);
});

test('registration refuses redirect URIs that would leak a code', async () => {
  await assert.rejects(
    () => registerClient({ clientName: 'x', redirectUris: ['http://evil.example/cb'] }),
    /must be https, or http on loopback/,
  );
  await assert.rejects(() => registerClient({ clientName: 'x', redirectUris: [] }), /at least one/);
  await assert.rejects(
    () => registerClient({ clientName: 'x', redirectUris: ['not a uri'] }),
    /not a valid absolute URI/,
  );
  await assert.rejects(
    () => registerClient({ clientName: 'x', redirectUris: ['https://ok.example/cb#frag'] }),
    /fragment/,
  );

  // Loopback over http is how a desktop client receives its redirect, so it has
  // to be allowed.
  const local = await registerClient({ clientName: 'desktop', redirectUris: ['http://127.0.0.1:33418/cb'] });
  assert.ok(local.client.clientId);
});

test('redirect matching is exact, never by prefix', async () => {
  const c = await client(['https://claude.ai/api/mcp/auth_callback']);

  assert.equal(redirectUriAllowed(c, 'https://claude.ai/api/mcp/auth_callback'), true);
  // Every one of these has been used to steal codes from a loose matcher.
  assert.equal(redirectUriAllowed(c, 'https://claude.ai/api/mcp/auth_callback/../../evil'), false);
  assert.equal(redirectUriAllowed(c, 'https://claude.ai/api/mcp/auth_callback?next=evil'), false);
  assert.equal(redirectUriAllowed(c, 'https://claude.ai.evil.example/api/mcp/auth_callback'), false);
  assert.equal(redirectUriAllowed(c, 'https://claude.ai/api/mcp/auth_callback2'), false);
});

test('a public client needs no secret, a confidential one does', async () => {
  const pub = await registerClient({ clientName: 'public', redirectUris: [REDIRECT] });
  assert.equal(pub.clientSecret, undefined);
  assert.equal(clientSecretMatches(pub.client, undefined), true);

  const conf = await registerClient({ clientName: 'conf', redirectUris: [REDIRECT], confidential: true });
  assert.ok(conf.clientSecret);
  assert.equal(clientSecretMatches(conf.client, conf.clientSecret), true);
  assert.equal(clientSecretMatches(conf.client, 'wrong'), false);
  assert.equal(clientSecretMatches(conf.client, undefined), false);
});

test('nothing usable is stored in the clear', async () => {
  const c = await client();
  const { verifier, challenge } = pkce();
  const code = await codeFor(c.clientId, challenge);
  const redeemed = await redeemCode({ code, clientId: c.clientId, redirectUri: REDIRECT, codeVerifier: verifier });
  const token = await issueToken({
    clientId: c.clientId,
    memberId: 'member-1',
    role: 'dev',
    resource: RESOURCE,
    scope: 'mcp',
    parentId: redeemed.grant!.id,
  });

  const raw = readFileSync(STORE, 'utf8');
  const codeSecret = code.slice(code.indexOf('.') + 1);
  const tokenSecret = token.accessToken.slice(token.accessToken.indexOf('.') + 1);
  const refreshSecret = token.refreshToken.slice(token.refreshToken.indexOf('.') + 1);

  assert.equal(raw.includes(codeSecret), false, 'the code secret is stored in the clear');
  assert.equal(raw.includes(tokenSecret), false, 'the access token is stored in the clear');
  assert.equal(raw.includes(refreshSecret), false, 'the refresh token is stored in the clear');
});

test('expired grants are pruned, live ones are not', async () => {
  const c = await client();
  await issueToken({ clientId: c.clientId, memberId: 'm', role: 'dev', resource: RESOURCE, scope: 'mcp' });
  const live = await issueToken({ clientId: c.clientId, memberId: 'm', role: 'dev', resource: RESOURCE, scope: 'mcp' });

  // Nothing is expired yet.
  assert.equal(await pruneExpired(), 0);

  // Far enough ahead that access and refresh have both lapsed.
  const removed = await pruneExpired(Date.now() + 400 * 24 * 60 * 60_000);
  assert.ok(removed >= 2);
  assert.equal((await introspect(live.accessToken, RESOURCE)).active, false);
});
