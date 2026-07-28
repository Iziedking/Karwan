import { test, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

/// The portal, which is the only part of this a non-technical person ever sees.
///
///   npx tsx --test src/routes/teamPortal.test.ts

assert.equal(
  process.env.DATABASE_URL,
  undefined,
  'refusing to run: DATABASE_URL is set, which would run this against a real database',
);

const MEMBERS = join(tmpdir(), `karwan-portal-members-${process.pid}.json`);
const INVITES = join(tmpdir(), `karwan-portal-invites-${process.pid}.json`);
process.env.TEAM_MEMBERS_STORE_PATH = MEMBERS;
process.env.TEAM_INVITES_STORE_PATH = INVITES;
process.env.SESSION_SECRET = 'portal-test-secret';
process.env.OAUTH_ISSUER = 'https://api.karwan.site';
process.env.OAUTH_RESOURCES = 'https://mcp.karwan.site/mcp';

const { teamPortalRoutes } = await import('./teamPortal.js');
const { createInvite, setMemberDisabled, getMemberByEmail } = await import('../db/teamMembers.js');

const PASSWORD = 'correct horse battery staple';

beforeEach(() => {
  for (const p of [MEMBERS, INVITES]) if (existsSync(p)) rmSync(p);
});
after(() => {
  for (const p of [MEMBERS, INVITES]) if (existsSync(p)) rmSync(p);
});

function form(body: Record<string, string>) {
  return {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-real-ip': '10.0.0.1' },
    body: new URLSearchParams(body).toString(),
  };
}

/// Walk the invite flow the way a new member would, and hold on to the cookie.
async function joinAndSignIn(role: 'dev' | 'marketing' = 'marketing') {
  const { rawToken } = await createInvite({ email: 'aisha@karwan.site', name: 'Aisha', role });

  const landing = await teamPortalRoutes.request(`/invite?token=${encodeURIComponent(rawToken)}`);
  assert.equal(landing.status, 200);
  assert.match(await landing.text(), /Welcome, Aisha/);

  const created = await teamPortalRoutes.request('/invite', form({ token: rawToken, password: PASSWORD }));
  assert.equal(created.status, 302);
  const cookie = created.headers.get('set-cookie') ?? '';
  assert.match(cookie, /karwan_team=/);
  return { cookie: cookie.split(';')[0] ?? '', rawToken };
}

test('an invited person sets a password and lands on the guide', async () => {
  const { cookie } = await joinAndSignIn('marketing');

  const home = await teamPortalRoutes.request('/', { headers: { cookie } });
  assert.equal(home.status, 200);
  const html = await home.text();

  assert.match(html, /Connect your tools/);
  assert.match(html, /Signed in as <strong>Aisha<\/strong>/);
  // The role is shown because it decides what the canon returns.
  assert.match(html, /marketing/);
  // Every client the team actually uses gets its own instructions.
  for (const client of ['Claude app', 'ChatGPT', 'Claude Code', 'Codex']) {
    assert.ok(html.includes(client), `the guide never mentions ${client}`);
  }
  assert.ok(html.includes('https://mcp.karwan.site/mcp'), 'the guide does not show the address');
});

test('the guide is not reachable without signing in', async () => {
  await joinAndSignIn();

  const anonymous = await teamPortalRoutes.request('/');
  assert.equal(anonymous.status, 200);
  const html = await anonymous.text();
  assert.match(html, /Sign in/);
  assert.equal(html.includes('Connect your tools'), false, 'the guide leaked to a signed-out visitor');
});

test('a forged session cookie is refused', async () => {
  await joinAndSignIn();
  const member = await getMemberByEmail('aisha@karwan.site');
  assert.ok(member);

  // The payload is readable, so the signature is the only thing stopping
  // somebody minting a session for any account id they can guess.
  const payload = Buffer.from(JSON.stringify({ id: member.id, exp: Date.now() + 60_000 })).toString(
    'base64url',
  );
  const res = await teamPortalRoutes.request('/', {
    headers: { cookie: `karwan_team=${payload}.not-a-real-signature` },
  });
  assert.match(await res.text(), /Sign in/);
});

test('an expired session is refused', async () => {
  await joinAndSignIn();
  const member = await getMemberByEmail('aisha@karwan.site');
  const { createHmac } = await import('node:crypto');

  // Correctly signed, but already past its expiry. The signature alone must
  // not be enough.
  const payload = Buffer.from(
    JSON.stringify({ id: member!.id, exp: Date.now() - 1000 }),
  ).toString('base64url');
  const sig = createHmac('sha256', 'portal-test-secret').update(payload).digest('base64url');

  const res = await teamPortalRoutes.request('/', { headers: { cookie: `karwan_team=${payload}.${sig}` } });
  assert.match(await res.text(), /Sign in/);
});

test('disabling somebody logs them out of a session they already hold', async () => {
  const { cookie } = await joinAndSignIn();
  const member = await getMemberByEmail('aisha@karwan.site');
  assert.ok(member);

  // Their cookie is still valid and unexpired. The account is re-read on every
  // page load precisely so that stops mattering.
  await setMemberDisabled(member.id, true);

  const res = await teamPortalRoutes.request('/', { headers: { cookie } });
  const html = await res.text();
  assert.match(html, /no longer active/);
  assert.equal(html.includes('Connect your tools'), false);
});

test('a used or tampered invite link says so instead of half working', async () => {
  const { rawToken } = await joinAndSignIn();

  const used = await teamPortalRoutes.request(`/invite?token=${encodeURIComponent(rawToken)}`);
  assert.equal(used.status, 400);
  assert.match(await used.text(), /already been used/);

  const nonsense = await teamPortalRoutes.request('/invite?token=not-a-token');
  assert.equal(nonsense.status, 400);
  assert.match(await nonsense.text(), /not valid/);

  const missing = await teamPortalRoutes.request('/invite');
  assert.equal(missing.status, 400);
});

test('a short password is refused and the invite survives to try again', async () => {
  const { rawToken } = await createInvite({
    email: 'new@karwan.site',
    name: 'New',
    role: 'dev',
  });

  const tooShort = await teamPortalRoutes.request('/invite', form({ token: rawToken, password: 'short' }));
  assert.equal(tooShort.status, 200);
  assert.match(await tooShort.text(), /at least 12 characters/);

  // The link still works, because a rejected attempt must not burn it.
  const retry = await teamPortalRoutes.request('/invite', form({ token: rawToken, password: PASSWORD }));
  assert.equal(retry.status, 302);
});

test('login failures say the same thing whoever you are', async () => {
  await joinAndSignIn();

  for (const [email, password] of [
    ['aisha@karwan.site', 'wrong password here'],
    ['stranger@karwan.site', PASSWORD],
  ]) {
    const res = await teamPortalRoutes.request('/login', form({ email: email!, password: password! }));
    assert.equal(res.status, 200);
    assert.match(await res.text(), /do not match an active account/);
    assert.equal(res.headers.get('set-cookie'), null, 'a failed login set a session');
  }
});

test('signing out clears the session', async () => {
  const { cookie } = await joinAndSignIn();

  const out = await teamPortalRoutes.request('/logout', {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
  });
  assert.equal(out.status, 302);
  assert.match(out.headers.get('set-cookie') ?? '', /karwan_team=;|Max-Age=0/);
});

test('the pages refuse to be framed or cached', async () => {
  const res = await teamPortalRoutes.request('/');
  // A password form in an iframe is a clickjacking target, and a signed-in
  // page in a shared cache is somebody else's session.
  assert.equal(res.headers.get('x-frame-options'), 'DENY');
  assert.equal(res.headers.get('cache-control'), 'no-store');
  assert.equal(res.headers.get('referrer-policy'), 'no-referrer');
});
