import assert from 'node:assert/strict';
import test from 'node:test';
import { LAST_SAFE_MS, PassError, REFRESH_EARLY_MS, passFetch, passKeeper, type PassKeeper } from './anthropicPass.js';

/// The pass that lets the server ask Claude at Anthropic with no stored key
/// (view 89).
///
///   npx tsx --test src/llm/anthropicPass.test.ts

const TOKEN_URL = 'https://api.anthropic.com/v1/oauth/token';
const settings = { ruleId: 'fdrl_x', organizationId: 'org-1', workspaceId: 'wrkspc_t' };

interface Seen {
  url: string;
  method?: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
}

/// A token endpoint that answers in order from `replies`, recording every call.
function tokenEndpoint(replies: Array<{ status: number; body: unknown } | Error>) {
  const seen: Seen[] = [];
  let i = 0;
  const fetchFn = (async (url: string | URL | Request, init?: RequestInit) => {
    seen.push({
      url: String(url),
      method: init?.method,
      headers: Object.fromEntries(new Headers(init?.headers).entries()),
      body: JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>,
    });
    const r = replies[Math.min(i++, replies.length - 1)]!;
    if (r instanceof Error) throw r;
    return new Response(JSON.stringify(r.body), { status: r.status, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  return { fetchFn, seen };
}

const issued = (token: string, expiresIn = 600) => ({ status: 200, body: { access_token: token, token_type: 'Bearer', expires_in: expiresIn, scope: 'workspace:developer' } });

function notes() {
  let n = 0;
  const source = async () => `note-${++n}`;
  return { source, count: () => n };
}

function clock(start = 1_000_000) {
  let t = start;
  return { now: () => t, advance: (ms: number) => { t += ms; } };
}

test('the first call trades a note for a pass and sends the documented body', async () => {
  const { fetchFn, seen } = tokenEndpoint([issued('sk-ant-oat01-a')]);
  const keeper = passKeeper(settings, { note: notes().source, fetch: fetchFn });
  assert.equal(await keeper.get(), 'sk-ant-oat01-a');
  assert.equal(seen.length, 1);
  assert.equal(seen[0]!.url, TOKEN_URL);
  assert.equal(seen[0]!.method, 'POST');
  assert.equal(seen[0]!.headers['content-type'], 'application/json');
  assert.deepEqual(seen[0]!.body, {
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion: 'note-1',
    federation_rule_id: 'fdrl_x',
    organization_id: 'org-1',
    workspace_id: 'wrkspc_t',
  });
});

test('service_account_id and workspace_id are left out when not set, and sent when set', async () => {
  const a = tokenEndpoint([issued('p')]);
  await passKeeper({ ruleId: 'fdrl_x', organizationId: 'org-1' }, { note: notes().source, fetch: a.fetchFn }).get();
  assert.equal('workspace_id' in a.seen[0]!.body, false);
  assert.equal('service_account_id' in a.seen[0]!.body, false);

  const b = tokenEndpoint([issued('p')]);
  await passKeeper({ ...settings, serviceAccountId: 'svac_1' }, { note: notes().source, fetch: b.fetchFn }).get();
  assert.equal(b.seen[0]!.body.service_account_id, 'svac_1');
});

test('a held pass is reused until 120 seconds before it ends', async () => {
  assert.equal(REFRESH_EARLY_MS, 120_000);
  const { fetchFn, seen } = tokenEndpoint([issued('first'), issued('second')]);
  const c = clock();
  const keeper = passKeeper(settings, { note: notes().source, fetch: fetchFn, now: c.now });
  assert.equal(await keeper.get(), 'first');
  c.advance(479_000);
  assert.equal(await keeper.get(), 'first');
  assert.equal(seen.length, 1);
  c.advance(2_000);
  assert.equal(await keeper.get(), 'second');
  assert.equal(seen.length, 2);
  assert.equal(keeper.expiresAt(), c.now() + 600_000);
});

test('every exchange asks for a fresh note', async () => {
  const { fetchFn, seen } = tokenEndpoint([issued('first'), issued('second')]);
  const c = clock();
  const n = notes();
  const keeper = passKeeper(settings, { note: n.source, fetch: fetchFn, now: c.now });
  await keeper.get();
  c.advance(600_000);
  await keeper.get();
  assert.equal(n.count(), 2);
  assert.deepEqual(seen.map((s) => s.body.assertion), ['note-1', 'note-2']);
});

test('two calls at once share one exchange', async () => {
  const { fetchFn, seen } = tokenEndpoint([issued('shared'), issued('never')]);
  const keeper = passKeeper(settings, { note: notes().source, fetch: fetchFn });
  const [a, b] = await Promise.all([keeper.get(), keeper.get()]);
  assert.equal(a, 'shared');
  assert.equal(b, 'shared');
  assert.equal(seen.length, 1);
});

test('a failed refresh serves the held pass while more than 30 seconds remain', async () => {
  assert.equal(LAST_SAFE_MS, 30_000);
  const { fetchFn } = tokenEndpoint([issued('held'), new Error('fetch failed')]);
  const c = clock();
  const keeper = passKeeper(settings, { note: notes().source, fetch: fetchFn, now: c.now });
  await keeper.get();
  c.advance(540_000);
  assert.equal(await keeper.get(), 'held');
});

test('a failed refresh with 30 seconds or less left throws', async () => {
  const { fetchFn } = tokenEndpoint([issued('held'), new Error('fetch failed')]);
  const c = clock();
  const keeper = passKeeper(settings, { note: notes().source, fetch: fetchFn, now: c.now });
  await keeper.get();
  c.advance(570_000);
  await assert.rejects(keeper.get(), /fetch failed/);
});

test('a refused exchange throws with the status, and nothing of the note or pass in the message', async () => {
  const { fetchFn } = tokenEndpoint([{ status: 401, body: { type: 'error', error: { type: 'authentication_error', message: 'Authentication failed' } } }]);
  const keeper = passKeeper(settings, { note: async () => 'eyJ.secret-note.sig', fetch: fetchFn });
  const err = await keeper.get().then(() => null, (e: unknown) => e);
  assert.ok(err instanceof PassError);
  assert.equal(err.statusCode, 401);
  assert.match(err.message, /Authentication failed/);
  assert.doesNotMatch(err.message, /secret-note/);
});

test('an answer without a pass is an error', async () => {
  const { fetchFn } = tokenEndpoint([{ status: 200, body: { token_type: 'Bearer' } }]);
  const keeper = passKeeper(settings, { note: notes().source, fetch: fetchFn });
  await assert.rejects(keeper.get(), PassError);
});

test('a note source failure throws without a status', async () => {
  const { fetchFn, seen } = tokenEndpoint([issued('never')]);
  const keeper = passKeeper(settings, { note: async () => { throw new Error('OutboundWebIdentityFederationDisabled'); }, fetch: fetchFn });
  const err = await keeper.get().then(() => null, (e: unknown) => e as { statusCode?: number; message: string });
  assert.ok(err);
  assert.equal(err.statusCode, undefined);
  assert.match(err.message, /OutboundWebIdentityFederationDisabled/);
  assert.equal(seen.length, 0);
});

test('passFetch sets the bearer header and removes x-api-key', async () => {
  const keeper: PassKeeper = { get: async () => 'sk-ant-oat01-z', expiresAt: () => null };
  const sent: Array<Record<string, string>> = [];
  const base = (async (_url: string | URL | Request, init?: RequestInit) => {
    sent.push(Object.fromEntries(new Headers(init?.headers).entries()));
    return new Response('{}');
  }) as typeof fetch;
  const f = passFetch(keeper, base);
  await f('https://api.anthropic.com/v1/messages', { method: 'POST', headers: new Headers({ 'x-api-key': 'pass', 'anthropic-version': '2023-06-01' }) });
  await f('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'x-api-key': 'pass', 'content-type': 'application/json' } });
  await f('https://api.anthropic.com/v1/messages', { method: 'POST', headers: [['authorization', 'Bearer pass'], ['anthropic-beta', 'x']] });
  for (const h of sent) {
    assert.equal(h.authorization, 'Bearer sk-ant-oat01-z');
    assert.equal('x-api-key' in h, false);
  }
  assert.equal(sent[0]!['anthropic-version'], '2023-06-01');
  assert.equal(sent[1]!['content-type'], 'application/json');
  assert.equal(sent[2]!['anthropic-beta'], 'x');
});
