import assert from 'node:assert/strict';
import test from 'node:test';
import { Hono } from 'hono';

process.env.SESSION_SECRET ??= 'presence-check-test-secret-at-least-32-characters';
const { signSession } = await import('../auth/session.js');
const { presenceAction } = await import('./action.js');
const { createRequirePresence } = await import('./check.js');
const { CONFIRM_HEADER, createPresenceService } = await import('./service.js');
const { createMemoryPresenceStore } = await import('./store.js');
const { hashPin } = await import('./pin.js');

const A = '0x00000000000000000000000000000000000000aa';
const TO = '0x00000000000000000000000000000000000000cc';
const store = createMemoryPresenceStore();
const service = createPresenceService({
  store,
  now: Date.now,
  chainId: 5042002,
  rp: () => ({ rpID: 'localhost', origin: ['http://localhost:3000'] }),
  loginPasskeys: async () => [],
  bumpLoginPasskey: async () => {},
  verifyWalletSignature: async () => false,
});
const requirePresence = createRequirePresence(service);

let moved = 0;
const app = new Hono();
app.post('/out', async (c) => {
  const session = { address: A };
  const refused = await requirePresence(c, presenceAction({ kind: 'move_out', wallet: session.address, amountMicros: '5000000', recipient: TO }));
  if (refused) return refused;
  moved += 1;
  return c.json({ ok: true });
});

const cookie = `karwan_session=${signSession({ address: A, method: 'circle', email: 'a@example.com' })}`;
const post = (headers: Record<string, string> = {}) => app.request('/out', { method: 'POST', headers: { cookie, ...headers } });

test('428_with_challenge_without_header', async () => {
  const res = await post();
  assert.equal(res.status, 428);
  assert.equal(res.headers.get('cache-control'), 'no-store');
  const body = await res.json();
  assert.equal(body.code, 'CONFIRM_REQUIRED');
  assert.equal(body.action.amountMicros, '5000000');
  assert.equal(moved, 0);
});

test('one_pass_with_grant_then_428_again', async () => {
  await store.savePin(A, { hash: await hashPin('402917'), failures: 0, lockedUntil: null });
  const required = await (await post()).json();
  const r = await service.confirmPin({ address: A, method: 'circle', exp: 9e9 }, required.challengeId, '402917');
  assert.ok(r.ok);
  const before = moved;
  assert.equal((await post({ [CONFIRM_HEADER]: r.grant })).status, 200);
  assert.equal(moved, before + 1);
  assert.equal((await post({ [CONFIRM_HEADER]: r.grant })).status, 428);
  assert.equal((await post({ [CONFIRM_HEADER]: 'made-up' })).status, 428);
  assert.equal(moved, before + 1);
});

test('401_without_session', async () => {
  const res = await app.request('/out', { method: 'POST' });
  assert.equal(res.status, 401);
});
