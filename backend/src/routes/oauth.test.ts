import { test, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

/// The authorization server, driven through its real HTTP handlers.
///
/// The storage tests prove the crypto refuses what it should. These prove the
/// endpoints do, which is a different question: a correct store behind a
/// handler that redirects to an unvalidated URI is still a broken server.
///
///   npx tsx --test src/routes/oauth.test.ts

assert.equal(
  process.env.DATABASE_URL,
  undefined,
  'refusing to run: DATABASE_URL is set, which would run this against a real database',
);

const OAUTH_STORE = join(tmpdir(), `karwan-oauth-routes-${process.pid}.json`);
const MEMBERS = join(tmpdir(), `karwan-oauth-members-${process.pid}.json`);
const INVITES = join(tmpdir(), `karwan-oauth-invites-${process.pid}.json`);
process.env.OAUTH_STORE_PATH = OAUTH_STORE;
process.env.TEAM_MEMBERS_STORE_PATH = MEMBERS;
process.env.TEAM_INVITES_STORE_PATH = INVITES;
process.env.OAUTH_ISSUER = 'https://api.karwan.site';
process.env.OAUTH_RESOURCES = 'https://mcp.karwan.site/mcp';
process.env.OAUTH_INTROSPECT_TOKEN = 'introspect-secret-for-tests';
process.env.SESSION_SECRET = 'test-session-secret';

const { oauthRoutes, oauthMetadataRoutes } = await import('./oauth.js');
const { createInvite, redeemInvite } = await import('../db/teamMembers.js');

const RESOURCE = 'https://mcp.karwan.site/mcp';
const REDIRECT = 'https://claude.ai/api/mcp/auth_callback';
const PASSWORD = 'correct horse battery staple';

const STORES = [OAUTH_STORE, MEMBERS, INVITES];
beforeEach(() => {
  for (const p of STORES) if (existsSync(p)) rmSync(p);
});
after(() => {
  for (const p of STORES) if (existsSync(p)) rmSync(p);
  delete process.env.OAUTH_INTROSPECT_TOKEN;
});

function pkce() {
  const verifier = randomBytes(32).toString('base64url');
  return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') };
}

async function member(role: 'dev' | 'marketing' = 'marketing') {
  const { rawToken } = await createInvite({ email: 'aisha@karwan.site', name: 'Aisha', role });
  const result = await redeemInvite(rawToken, PASSWORD);
  assert.ok(result.ok);
  return result.member;
}

async function register(redirectUris = [REDIRECT]) {
  const res = await oauthRoutes.request('/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ client_name: 'Claude', redirect_uris: redirectUris }),
  });
  assert.equal(res.status, 201);
  return (await res.json()) as { client_id: string };
}

function authorizeUrl(clientId: string, challenge: string, over: Record<string, string> = {}) {
  const q = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: REDIRECT,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    resource: RESOURCE,
    state: 'xyz',
    ...over,
  });
  return `/authorize?${q.toString()}`;
}

/// Walk the flow to a code, the way a real client would.
async function getCode(clientId: string, challenge: string) {
  const form = await oauthRoutes.request(authorizeUrl(clientId, challenge));
  const html = await form.text();
  const r = /name="r" value="([^"]+)"/.exec(html)?.[1];
  const s = /name="s" value="([^"]+)"/.exec(html)?.[1];
  assert.ok(r && s, 'the login form did not render its signed parameters');

  const posted = await oauthRoutes.request('/authorize', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-real-ip': '10.0.0.1' },
    body: new URLSearchParams({ r, s, email: 'aisha@karwan.site', password: PASSWORD }).toString(),
  });
  // Location is read off the headers, so the body is only touched on failure.
  if (posted.status !== 302) assert.fail(`expected a redirect, got ${posted.status}: ${await posted.text()}`);
  return new URL(posted.headers.get('location') ?? '');
}

test('metadata advertises what the spec requires and nothing weaker', async () => {
  const res = await oauthMetadataRoutes.request('/oauth-authorization-server');
  assert.equal(res.status, 200);
  const meta = (await res.json()) as Record<string, unknown>;

  // The issuer must equal the origin this was fetched from, or clients reject
  // the document outright.
  assert.equal(meta.issuer, 'https://api.karwan.site');
  assert.equal(meta.authorization_endpoint, 'https://api.karwan.site/oauth/authorize');
  assert.equal(meta.registration_endpoint, 'https://api.karwan.site/oauth/register');
  // Advertising `plain` would invite a client to use it.
  assert.deepEqual(meta.code_challenge_methods_supported, ['S256']);
  assert.equal(meta.authorization_response_iss_parameter_supported, true);
});

test('the full flow: register, authorize, exchange, introspect', async () => {
  await member('marketing');
  const client = await register();
  const { verifier, challenge } = pkce();

  const back = await getCode(client.client_id, challenge);
  assert.ok(back.searchParams.get('code'));
  assert.equal(back.searchParams.get('state'), 'xyz');
  // RFC 9207: without this a client cannot tell which server answered.
  assert.equal(back.searchParams.get('iss'), 'https://api.karwan.site');

  const tokenRes = await oauthRoutes.request('/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code: back.searchParams.get('code') ?? '',
      client_id: client.client_id,
      redirect_uri: REDIRECT,
      code_verifier: verifier,
      resource: RESOURCE,
    }).toString(),
  });
  // Read once. Passing `await res.text()` as an assertion message consumes the
  // body eagerly, and the parse afterwards then fails on an unusable stream.
  const tokenBody = await tokenRes.text();
  assert.equal(tokenRes.status, 200, tokenBody);
  const token = JSON.parse(tokenBody) as { access_token: string; token_type: string; refresh_token: string };
  assert.equal(token.token_type, 'Bearer');

  const introspected = await oauthRoutes.request('/introspect', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: 'Bearer introspect-secret-for-tests',
    },
    body: JSON.stringify({ token: token.access_token, resource: RESOURCE }),
  });
  const claims = (await introspected.json()) as { active: boolean; role: string };
  assert.equal(claims.active, true);
  assert.equal(claims.role, 'marketing', 'the token did not carry the role');
});

test('an unverified redirect_uri is never redirected to', async () => {
  const client = await register();
  const { challenge } = pkce();

  // The attack: point a real client_id at a redirect it does not own. The
  // answer must be rendered here, not sent there.
  const res = await oauthRoutes.request(
    authorizeUrl(client.client_id, challenge, { redirect_uri: 'https://evil.example/steal' }),
  );
  assert.equal(res.status, 400);
  assert.equal(res.headers.get('location'), null, 'the server redirected to an unregistered uri');
  assert.match(await res.text(), /not one this application registered/);

  // An unknown client is the same story.
  const unknown = await oauthRoutes.request(authorizeUrl('no-such-client', challenge));
  assert.equal(unknown.status, 400);
  assert.equal(unknown.headers.get('location'), null);
});

test('a bad request redirects the error only once the redirect is proven', async () => {
  const client = await register();
  const { challenge } = pkce();

  // Valid client and redirect, but the challenge method is wrong. Now an
  // error redirect is correct, and it must carry state and iss.
  const res = await oauthRoutes.request(
    authorizeUrl(client.client_id, challenge, { code_challenge_method: 'plain' }),
  );
  assert.equal(res.status, 302);
  const url = new URL(res.headers.get('location') ?? '');
  assert.equal(url.origin + url.pathname, REDIRECT);
  assert.equal(url.searchParams.get('error'), 'invalid_request');
  assert.match(url.searchParams.get('error_description') ?? '', /PKCE with S256/);
  assert.equal(url.searchParams.get('state'), 'xyz');
  assert.equal(url.searchParams.get('iss'), 'https://api.karwan.site');
});

test('a token is refused for a resource this server does not serve', async () => {
  const client = await register();
  const { challenge } = pkce();

  const res = await oauthRoutes.request(
    authorizeUrl(client.client_id, challenge, { resource: 'https://someone-else.example/mcp' }),
  );
  assert.equal(res.status, 302);
  const url = new URL(res.headers.get('location') ?? '');
  assert.equal(url.searchParams.get('error'), 'invalid_target');
});

test('the login form cannot be forged', async () => {
  await member();
  const client = await register();
  const { challenge } = pkce();

  const form = await oauthRoutes.request(authorizeUrl(client.client_id, challenge));
  const html = await form.text();
  const r = /name="r" value="([^"]+)"/.exec(html)?.[1] ?? '';

  // Right parameters, wrong signature.
  const forged = await oauthRoutes.request('/authorize', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-real-ip': '10.0.0.9' },
    body: new URLSearchParams({
      r,
      s: 'not-the-signature',
      email: 'aisha@karwan.site',
      password: PASSWORD,
    }).toString(),
  });
  assert.equal(forged.status, 400);
  assert.match(await forged.text(), /expired/i);
});

test('a wrong password re-renders the form and says nothing useful', async () => {
  await member();
  const client = await register();
  const { challenge } = pkce();

  const form = await oauthRoutes.request(authorizeUrl(client.client_id, challenge));
  const html = await form.text();
  const r = /name="r" value="([^"]+)"/.exec(html)?.[1] ?? '';
  const s = /name="s" value="([^"]+)"/.exec(html)?.[1] ?? '';

  for (const [email, password] of [
    ['aisha@karwan.site', 'wrong password entirely'],
    ['nobody@karwan.site', PASSWORD],
  ]) {
    const res = await oauthRoutes.request('/authorize', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-real-ip': '10.0.0.2' },
      body: new URLSearchParams({ r, s, email, password }).toString(),
    });
    assert.equal(res.status, 200);
    const body = await res.text();
    // Identical wording either way: a different message for a missing account
    // turns this page into an address checker.
    assert.match(body, /do not match an active account/);
    assert.equal(res.headers.get('location'), null);
  }
});

test('a client name cannot inject markup into the login page', async () => {
  await member();
  const res = await oauthRoutes.request('/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      client_name: '<script>alert(1)</script>',
      redirect_uris: [REDIRECT],
    }),
  });
  const client = (await res.json()) as { client_id: string };
  const { challenge } = pkce();

  // Registration is unauthenticated, so the client name is attacker controlled
  // and lands on a page where a human types a password.
  const page = await (await oauthRoutes.request(authorizeUrl(client.client_id, challenge))).text();
  assert.equal(page.includes('<script>alert(1)</script>'), false, 'client_name was not escaped');
  assert.ok(page.includes('&lt;script&gt;'));
});

test('registration refuses redirects that would leak a code', async () => {
  const res = await oauthRoutes.request('/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ client_name: 'x', redirect_uris: ['http://evil.example/cb'] }),
  });
  assert.equal(res.status, 400);
  assert.equal(((await res.json()) as { error: string }).error, 'invalid_redirect_uri');
});

test('the token endpoint enforces PKCE and the exact redirect', async () => {
  await member();
  const client = await register();
  const { verifier, challenge } = pkce();
  const back = await getCode(client.client_id, challenge);
  const code = back.searchParams.get('code') ?? '';

  const bad = async (over: Record<string, string>) => {
    const res = await oauthRoutes.request('/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: client.client_id,
        redirect_uri: REDIRECT,
        code_verifier: verifier,
        ...over,
      }).toString(),
    });
    return res;
  };

  assert.equal((await bad({ code_verifier: 'nope' })).status, 400);
  assert.equal((await bad({ redirect_uri: 'https://evil.example/steal' })).status, 400);
  assert.equal((await bad({ client_id: 'someone-else' })).status, 401);
});

test('introspection refuses without its own credential', async () => {
  const call = (headers: Record<string, string>) =>
    oauthRoutes.request('/introspect', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify({ token: 'anything', resource: RESOURCE }),
    });

  assert.equal((await call({})).status, 401);
  assert.equal((await call({ authorization: 'Bearer wrong' })).status, 401);
  // With the right credential an unknown token is simply inactive, which is the
  // OAuth-shaped answer rather than an error.
  const ok = await call({ authorization: 'Bearer introspect-secret-for-tests' });
  assert.equal(ok.status, 200);
  assert.equal(((await ok.json()) as { active: boolean }).active, false);
});
