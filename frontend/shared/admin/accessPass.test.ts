import assert from 'node:assert/strict';
import test from 'node:test';
import { generateKeyPairSync, sign as rsaSign, type KeyObject } from 'node:crypto';
import { accessPassValid, type AccessJwk } from './accessPass';

///   npx tsx --test shared/admin/accessPass.test.ts

const TEAM = 'karwan.cloudflareaccess.com';
const AUD = 'aud-tag-admin';
const NOW = 1_800_000_000_000;
const opts = { teamDomain: TEAM, aud: AUD, nowMs: NOW };

function keyPair(kid: string) {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  return { privateKey, jwk: { ...(publicKey.export({ format: 'jwk' }) as AccessJwk), kid, alg: 'RS256' } };
}
const b64 = (v: object | Buffer) => (Buffer.isBuffer(v) ? v : Buffer.from(JSON.stringify(v))).toString('base64url');
function pass(key: KeyObject, kid: string, claims: Record<string, unknown>) {
  const head = b64({ alg: 'RS256', kid });
  const body = b64(claims);
  return `${head}.${body}.${b64(rsaSign('RSA-SHA256', Buffer.from(`${head}.${body}`), key))}`;
}
const good = (over: Record<string, unknown> = {}) => ({
  aud: [AUD], iss: `https://${TEAM}`, email: 'ada@karwan.site', exp: NOW / 1000 + 600, ...over,
});

const k1 = keyPair('k1');
const k2 = keyPair('k2');
const keys = [k2.jwk, k1.jwk];

test('a pass Cloudflare signed for this app opens the desk', async () => {
  assert.equal(await accessPassValid(pass(k1.privateKey, 'k1', good()), keys, opts), true);
  assert.equal(await accessPassValid(pass(k2.privateKey, 'k2', good({ email: undefined, common_name: 'svc.access' })), keys, opts), true);
});

test('anything else does not', async () => {
  const stranger = keyPair('k1');
  for (const [name, token] of [
    ['forged', pass(stranger.privateKey, 'k1', good())],
    ['expired', pass(k1.privateKey, 'k1', good({ exp: NOW / 1000 - 120 }))],
    ['other app', pass(k1.privateKey, 'k1', good({ aud: 'other' }))],
    ['other team', pass(k1.privateKey, 'k1', good({ iss: 'https://evil.cloudflareaccess.com' }))],
    ['nobody', pass(k1.privateKey, 'k1', good({ email: undefined }))],
    ['alg none', `${b64({ alg: 'none' })}.${b64(good())}.`],
    ['garbled', 'x.y.z'],
  ] as const) {
    assert.equal(await accessPassValid(token, keys, opts), false, name);
  }
});
