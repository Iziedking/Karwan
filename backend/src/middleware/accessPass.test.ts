import assert from 'node:assert/strict';
import test from 'node:test';
import { generateKeyPairSync, sign as rsaSign, type KeyObject } from 'node:crypto';
import { Hono } from 'hono';
import { createAccessPassGate, verifyAccessPass, type AccessKeySet } from './accessPass.js';

///   npx tsx --test src/middleware/accessPass.test.ts

const TEAM = 'karwan.cloudflareaccess.com';
const AUD = 'aud-tag-admin';
const NOW = 1_800_000_000_000;

function keyPair(kid: string) {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  return { kid, privateKey, jwk: { ...(publicKey.export({ format: 'jwk' }) as object), kid, alg: 'RS256' } };
}

const b64 = (v: object | Buffer) => (Buffer.isBuffer(v) ? v : Buffer.from(JSON.stringify(v))).toString('base64url');

function pass(privateKey: KeyObject, kid: string, claims: Record<string, unknown>): string {
  const head = b64({ alg: 'RS256', kid, typ: 'JWT' });
  const body = b64(claims);
  const sig = rsaSign('RSA-SHA256', Buffer.from(`${head}.${body}`), privateKey);
  return `${head}.${body}.${b64(sig)}`;
}

const good = (over: Record<string, unknown> = {}) => ({
  aud: [AUD],
  iss: `https://${TEAM}`,
  email: 'ada@karwan.site',
  type: 'app',
  iat: NOW / 1000 - 60,
  exp: NOW / 1000 + 3600,
  ...over,
});

const k1 = keyPair('k1');
const k2 = keyPair('k2');
const keys: AccessKeySet = { keys: [k2.jwk, k1.jwk] };
const opts = { teamDomain: TEAM, aud: AUD, nowMs: NOW };

test('a pass signed by the team, for this app, in date, gets through with its email', () => {
  const r = verifyAccessPass(pass(k1.privateKey, 'k1', good()), keys, opts);
  assert.deepEqual(r, { ok: true, email: 'ada@karwan.site', serviceToken: null });
});

test('a service token pass carries its client id instead of an email', () => {
  const r = verifyAccessPass(pass(k1.privateKey, 'k1', good({ email: undefined, sub: '', common_name: 'client-id.access' })), keys, opts);
  assert.deepEqual(r, { ok: true, email: null, serviceToken: 'client-id.access' });
});

test('a key rotated in is found even when the kid is not the first key', () => {
  assert.equal(verifyAccessPass(pass(k2.privateKey, 'k2', good()), keys, opts).ok, true);
});

test('forged, expired, early, other app, other team, unsigned or garbled passes are refused', () => {
  const stranger = keyPair('k1');
  const cases: Array<[string, string]> = [
    ['forged', pass(stranger.privateKey, 'k1', good())],
    ['expired', pass(k1.privateKey, 'k1', good({ exp: NOW / 1000 - 61 }))],
    ['not yet valid', pass(k1.privateKey, 'k1', good({ nbf: NOW / 1000 + 600 }))],
    ['other app', pass(k1.privateKey, 'k1', good({ aud: ['someone-else'] }))],
    ['other team', pass(k1.privateKey, 'k1', good({ iss: 'https://evil.cloudflareaccess.com' }))],
    ['alg none', `${b64({ alg: 'none', kid: 'k1' })}.${b64(good())}.`],
    ['garbled', 'not-a-pass'],
    ['empty', ''],
  ];
  for (const [name, token] of cases) assert.equal(verifyAccessPass(token, keys, opts).ok, false, name);
});

function app(gate: ReturnType<typeof createAccessPassGate>) {
  const a = new Hono();
  a.use('/api/admin/*', gate);
  a.get('/api/admin/deals', (c) => c.json({ ok: true, email: c.get('accessEmail' as never) ?? null }));
  return a;
}

test('the gate answers not found without a valid pass, and lets a valid one through', async () => {
  const gate = createAccessPassGate({ teamDomain: TEAM, aud: AUD, production: true, now: () => NOW, loadKeys: async () => keys });
  const a = app(gate);
  assert.equal((await a.request('/api/admin/deals')).status, 404);
  assert.equal((await a.request('/api/admin/deals', { headers: { 'cf-access-jwt-assertion': 'nope' } })).status, 404);
  const ok = await a.request('/api/admin/deals', { headers: { 'cf-access-jwt-assertion': pass(k1.privateKey, 'k1', good()) } });
  assert.equal(ok.status, 200);
  assert.deepEqual(await ok.json(), { ok: true, email: 'ada@karwan.site' });
});

test('in production with no Access set up the desk is shut, not open', async () => {
  const a = app(createAccessPassGate({ teamDomain: undefined, aud: undefined, production: true, now: () => NOW, loadKeys: async () => keys }));
  assert.equal((await a.request('/api/admin/deals', { headers: { 'cf-access-jwt-assertion': pass(k1.privateKey, 'k1', good()) } })).status, 404);
});

test('outside production with no Access set up, the check is skipped for local work and tests', async () => {
  const a = app(createAccessPassGate({ teamDomain: undefined, aud: undefined, production: false, now: () => NOW, loadKeys: async () => keys }));
  assert.equal((await a.request('/api/admin/deals')).status, 200);
});

test('when the keys cannot be fetched the desk is shut', async () => {
  const a = app(createAccessPassGate({ teamDomain: TEAM, aud: AUD, production: true, now: () => NOW, loadKeys: async () => { throw new Error('offline'); } }));
  assert.equal((await a.request('/api/admin/deals', { headers: { 'cf-access-jwt-assertion': pass(k1.privateKey, 'k1', good()) } })).status, 404);
});

test('an unknown kid reloads the keys once, so a fresh rotation is picked up', async () => {
  let loads = 0;
  const k3 = keyPair('k3');
  const gate = createAccessPassGate({
    teamDomain: TEAM, aud: AUD, production: true, now: () => NOW,
    loadKeys: async () => (++loads === 1 ? keys : { keys: [...keys.keys, k3.jwk] }),
  });
  const a = app(gate);
  await a.request('/api/admin/deals', { headers: { 'cf-access-jwt-assertion': pass(k1.privateKey, 'k1', good()) } });
  const r = await a.request('/api/admin/deals', { headers: { 'cf-access-jwt-assertion': pass(k3.privateKey, 'k3', good()) } });
  assert.equal(r.status, 200);
  assert.equal(loads, 2);
});
