import assert from 'node:assert/strict';
import test from 'node:test';
import type { Context } from 'hono';
import type { SessionPayload } from '../auth/session.js';
import { presenceAction } from '../presence/action.js';
import { hashPin, verifyPinHash, PIN_LOCK_MS } from '../presence/pin.js';
import { CONFIRM_HEADER, createPresenceService } from '../presence/service.js';
import { createMemoryPresenceStore, type PresencePasskey } from '../presence/store.js';
import { softPasskey } from '../presence/softPasskey.test.js';
import { createConfirmRoutes, type ConfirmRouteDeps } from './confirm.js';

const A = '0x00000000000000000000000000000000000000aa';
const W3 = '0x00000000000000000000000000000000000000ab';
const TO = '0x00000000000000000000000000000000000000cc';
const RP = { rpID: 'localhost', rpName: 'Karwan', origin: ['http://localhost:3000'] };
const ORIGIN = RP.origin[0]!;
const PIN = '402917';

function harness(opts: { limit?: number } = {}) {
  const clock = { now: 2_000_000_000_000 };
  const store = createMemoryPresenceStore();
  const login: PresencePasskey[] = [];
  const sent: { email: string; code: string }[] = [];
  const sessions = new Map<string, SessionPayload>();
  const service = createPresenceService({
    store,
    now: () => clock.now,
    chainId: 5042002,
    rp: () => RP,
    loginPasskeys: async (w) => login.filter((p) => p.wallet === w),
    bumpLoginPasskey: async () => {},
    verifyWalletSignature: async () => true,
  });
  const deps: ConfirmRouteDeps = {
    service,
    store,
    now: () => clock.now,
    session: (c: Context) => sessions.get(c.req.header('x-test-as') ?? '') ?? null,
    rp: () => RP,
    loginPasskeys: async (w) => login.filter((p) => p.wallet === w),
    emailCodes: {
      request: async (email) => {
        sent.push({ email, code: '135790' });
        return { delivered: true };
      },
      verify: (email, code) => (sent.some((s) => s.email === email && s.code === code.replace(/\s/g, '')) ? 'ok' : 'wrong'),
    },
    limit: { windowMs: 10 * 60_000, max: opts.limit ?? 10_000 },
  };
  const app = createConfirmRoutes(deps);
  const as = (name: string, session: Omit<SessionPayload, 'exp'>) => sessions.set(name, { exp: 9e9, ...session });
  as('email', { address: A, method: 'circle', email: 'a@example.com' });
  as('web3', { address: W3, method: 'web3' });
  const call = (who: string, method: string, path: string, body?: unknown, headers: Record<string, string> = {}) =>
    app.request(path, {
      method,
      headers: { 'content-type': 'application/json', 'x-test-as': who, ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  const challenge = async (who = 'email', wallet = A) =>
    service.challengeFor(sessions.get(who)!, presenceAction({ kind: 'move_out', wallet, amountMicros: '5000000', recipient: TO }));
  return { app, store, clock, sent, login, as, call, challenge, service, sessions };
}

test('status_needs_a_session_and_reports_the_factors', async () => {
  const h = harness();
  assert.equal((await h.call('nobody', 'GET', '/status')).status, 401);
  const res = await h.call('email', 'GET', '/status');
  assert.equal(res.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await res.json(), { methods: ['passkey', 'pin'], pinSet: false, pinLockedUntil: null, passkeys: 0, hasEmail: true });
});

test('first_pin_needs_an_email_code', async () => {
  const h = harness();
  const without = await h.call('email', 'POST', '/pin', { pin: PIN });
  assert.equal(without.status, 403);
  assert.equal((await without.json()).code, 'ENROL_PROOF_REQUIRED');
  assert.equal((await h.call('email', 'POST', '/email-code')).status, 200);
  assert.deepEqual(h.sent.map((s) => s.email), ['a@example.com']);
  const wrong = await h.call('email', 'POST', '/pin', { pin: PIN, emailCode: '000001' });
  assert.equal(wrong.status, 400);
  assert.equal((await wrong.json()).code, 'EMAIL_CODE_WRONG');
  assert.equal((await h.call('email', 'POST', '/pin', { pin: PIN, emailCode: '135 790' })).status, 200);
  assert.equal(await verifyPinHash(PIN, (await h.store.pin(A))!.hash), true);
});

test('a_simple_or_short_pin_is_refused', async () => {
  const h = harness();
  await h.call('email', 'POST', '/email-code');
  assert.equal((await (await h.call('email', 'POST', '/pin', { pin: '123456', emailCode: '135790' })).json()).code, 'PIN_TOO_SIMPLE');
  assert.equal((await (await h.call('email', 'POST', '/pin', { pin: '1234', emailCode: '135790' })).json()).code, 'PIN_FORMAT');
});

test('fresh_open_link_session_sets_first_pin_without_email', async () => {
  const h = harness();
  h.as('link', { address: A, method: 'circle', via: 'open_link', iat: Math.floor(h.clock.now / 1000) - 60 });
  assert.equal((await h.call('link', 'POST', '/pin', { pin: PIN })).status, 200);
});

test('open_link_session_11_minutes_old_cannot', async () => {
  const h = harness();
  h.as('link', { address: A, method: 'circle', via: 'open_link', iat: Math.floor(h.clock.now / 1000) - 11 * 60 });
  const res = await h.call('link', 'POST', '/pin', { pin: PIN });
  assert.equal(res.status, 403);
  assert.equal((await res.json()).code, 'ENROL_PROOF_REQUIRED');
});

test('email_less_open_link_session_registers_a_passkey', async () => {
  const h = harness();
  h.as('link', { address: A, method: 'circle', via: 'open_link', iat: Math.floor(h.clock.now / 1000) - 60 });
  const key = softPasskey();
  const o = await h.call('link', 'POST', '/passkey/options', {});
  assert.equal(o.status, 200);
  const options = await o.json();
  assert.equal(options.authenticatorSelection.userVerification, 'required');
  const unverified = await h.call('link', 'POST', '/passkey/register', { response: key.register({ challenge: options.challenge, origin: ORIGIN, rpID: RP.rpID, userVerified: false }) });
  assert.equal(unverified.status, 400);
  const o2 = await (await h.call('link', 'POST', '/passkey/options', {})).json();
  const res = await h.call('link', 'POST', '/passkey/register', { response: key.register({ challenge: o2.challenge, origin: ORIGIN, rpID: RP.rpID }) });
  assert.equal(res.status, 200);
  const keys = await h.store.passkeys(A);
  assert.deepEqual(keys.map((k) => k.credentialId), [key.credentialId]);
  assert.equal(keys[0]?.publicKey, key.publicKey);
  assert.equal((await h.call('link', 'POST', '/passkey/register', { response: key.register({ challenge: o2.challenge, origin: ORIGIN, rpID: RP.rpID }) })).status, 400, 'a registration challenge works once');
});

test('changing_a_pin_without_a_grant_is_refused', async () => {
  const h = harness();
  await h.store.savePin(A, { hash: await hashPin(PIN), failures: 0, lockedUntil: null });
  const asked = await h.call('email', 'POST', '/pin', { pin: '502918' });
  assert.equal(asked.status, 428);
  const required = await asked.json();
  assert.equal(required.code, 'CONFIRM_REQUIRED');
  assert.equal(required.action.kind, 'factor_change');
  const ok = await h.call('email', 'POST', '/', { challengeId: required.challengeId, pin: PIN });
  const { grant } = await ok.json();
  assert.equal((await h.call('email', 'POST', '/pin', { pin: '502918' }, { [CONFIRM_HEADER]: grant })).status, 200);
  assert.equal(await verifyPinHash('502918', (await h.store.pin(A))!.hash), true);
});

test('a_sign_in_passkey_counts_as_a_factor_so_a_first_pin_needs_a_confirmation', async () => {
  const h = harness();
  h.login.push({ credentialId: 'login', wallet: A, publicKey: 'pk', counter: 0, transports: [], createdAt: 1 });
  assert.equal((await h.call('email', 'POST', '/pin', { pin: PIN, emailCode: '135790' })).status, 428);
});

test('removing_a_passkey_needs_a_grant', async () => {
  const h = harness();
  await h.store.savePin(A, { hash: await hashPin(PIN), failures: 0, lockedUntil: null });
  await h.store.addPasskey({ credentialId: 'k1', wallet: A, publicKey: 'pk', counter: 0, transports: [], createdAt: 1 });
  const asked = await h.call('email', 'DELETE', '/passkey/k1');
  assert.equal(asked.status, 428);
  const required = await asked.json();
  assert.deepEqual(required.action.detail, { change: 'passkey_remove', credentialId: 'k1' });
  const { grant } = await (await h.call('email', 'POST', '/', { challengeId: required.challengeId, pin: PIN })).json();
  assert.equal((await h.call('email', 'DELETE', '/passkey/k1', undefined, { [CONFIRM_HEADER]: grant })).status, 200);
  assert.deepEqual(await h.store.passkeys(A), []);
});

test('reset_without_email_answers_no_email', async () => {
  const h = harness();
  h.as('chat', { address: A, method: 'circle', via: 'open_link', iat: Math.floor(h.clock.now / 1000) - 60 });
  const res = await h.call('chat', 'POST', '/email-code');
  assert.equal(res.status, 409);
  assert.deepEqual(await res.json(), { error: 'Add an email in the chat to reset your PIN.', code: 'NO_EMAIL' });
});

test('reset_clears_the_lock', async () => {
  const h = harness();
  await h.store.savePin(A, { hash: await hashPin(PIN), failures: 0, lockedUntil: h.clock.now + PIN_LOCK_MS });
  assert.equal((await h.call('email', 'POST', '/pin/reset', { pin: '502918', emailCode: '135790' })).status, 400, 'no code was sent yet');
  await h.call('email', 'POST', '/email-code');
  assert.equal((await h.call('email', 'POST', '/pin/reset', { pin: '502918', emailCode: '135790' })).status, 200);
  const state = (await h.store.pin(A))!;
  assert.equal(state.lockedUntil, null);
  assert.equal(await verifyPinHash('502918', state.hash), true);
});

test('locked_pin_answers_423_with_unlock_time', async () => {
  const h = harness();
  await h.store.savePin(A, { hash: await hashPin(PIN), failures: 0, lockedUntil: h.clock.now + 60_000 });
  const required = await h.challenge();
  const res = await h.call('email', 'POST', '/', { challengeId: required.challengeId, pin: PIN });
  assert.equal(res.status, 423);
  assert.deepEqual(await res.json(), { code: 'PIN_LOCKED', until: h.clock.now + 60_000 });
});

test('pin_with_spaces_confirms', async () => {
  const h = harness();
  await h.store.savePin(A, { hash: await hashPin(PIN), failures: 0, lockedUntil: null });
  const required = await h.challenge();
  const res = await h.call('email', 'POST', '/', { challengeId: required.challengeId, pin: '40 29 17' });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).grant, required.challengeId);
  const wrong = await h.call('email', 'POST', '/', { challengeId: (await h.challenge()).challengeId, pin: '111222' });
  assert.equal(wrong.status, 400);
  assert.deepEqual(await wrong.json(), { code: 'WRONG_PIN', left: 4 });
});

test('a_passkey_confirms_through_options_then_confirm', async () => {
  const h = harness();
  const key = softPasskey();
  await h.store.addPasskey({ credentialId: key.credentialId, wallet: A, publicKey: key.publicKey, counter: 0, transports: [], createdAt: 1 });
  const required = await h.challenge();
  const options = await (await h.call('email', 'POST', '/options', { challengeId: required.challengeId })).json();
  const res = await h.call('email', 'POST', '/', { challengeId: required.challengeId, passkey: key.assert({ challenge: options.challenge, origin: ORIGIN, rpID: RP.rpID }) });
  assert.equal(res.status, 200);
  assert.equal((await h.call('email', 'POST', '/options', { challengeId: 'gone' })).status, 400);
});

test('a_web3_session_confirms_by_signature_and_sets_no_pin', async () => {
  const h = harness();
  const required = await h.challenge('web3', W3);
  assert.equal((await h.call('web3', 'POST', '/', { challengeId: required.challengeId, signature: '0x1234' })).status, 200);
  const pin = await h.call('web3', 'POST', '/pin', { pin: PIN });
  assert.equal(pin.status, 403);
  assert.equal((await pin.json()).code, 'METHOD_NOT_ALLOWED');
});

test('over_30_calls_in_10_minutes_get_429', async () => {
  const h = harness({ limit: 30 });
  for (let i = 0; i < 30; i++) assert.notEqual((await h.call('email', 'GET', '/status')).status, 429);
  assert.equal((await h.call('email', 'GET', '/status')).status, 429);
});

test('an_open_link_session_of_an_account_with_an_email_still_needs_the_email_code', async () => {
  const h = harness();
  h.as('linked', { address: A, method: 'circle', email: 'a@example.com', via: 'open_link', iat: Math.floor(h.clock.now / 1000) - 60 });
  const res = await h.call('linked', 'POST', '/pin', { pin: PIN });
  assert.equal(res.status, 403);
  assert.equal((await res.json()).code, 'ENROL_PROOF_REQUIRED');
  assert.equal((await h.call('linked', 'POST', '/passkey/options', {})).status, 403);
  assert.equal((await h.service.challengeFor(h.sessions.get('linked')!, presenceAction({ kind: 'move_out', wallet: A, amountMicros: '1', recipient: TO }))).enrol, 'email_code');
});
