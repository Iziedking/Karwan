import assert from 'node:assert/strict';
import test from 'node:test';
import type { SessionPayload } from '../auth/session.js';
import { presenceAction, actionText, type PresenceAction } from './action.js';
import { PIN_LOCK_MS, hashPin } from './pin.js';
import { CHALLENGE_TTL_MS, createPresenceService, type PresenceService } from './service.js';
import { createMemoryPresenceStore, type PresencePasskey, type PresenceStore } from './store.js';
import { softPasskey } from './softPasskey.test.js';

const A = '0x00000000000000000000000000000000000000aa';
const B = '0x00000000000000000000000000000000000000bb';
const TO = '0x00000000000000000000000000000000000000cc';
const CHAIN = 5042002;
const RP = { rpID: 'localhost', origin: ['http://localhost:3000'] };
const PIN = '402917';

const circle = (address = A, over: Partial<SessionPayload> = {}): SessionPayload => ({ address, method: 'circle', email: 'a@example.com', exp: 9e9, ...over });
const web3 = (address = A): SessionPayload => ({ address, method: 'web3', exp: 9e9 });
const cashOut = (amount = '50000000', wallet = A): PresenceAction =>
  presenceAction({ kind: 'move_out', wallet, amountMicros: amount, recipient: TO, detail: { chain: 'arc' } });

interface Harness {
  svc: PresenceService;
  store: PresenceStore;
  clock: { now: number };
  login: PresencePasskey[];
  bumped: string[];
  signatures: { address: string; message: string }[];
}

function harness(): Harness {
  const store = createMemoryPresenceStore();
  const clock = { now: 1_000_000 };
  const login: PresencePasskey[] = [];
  const bumped: string[] = [];
  const signatures: { address: string; message: string }[] = [];
  const svc = createPresenceService({
    store,
    now: () => clock.now,
    chainId: CHAIN,
    rp: () => RP,
    loginPasskeys: async (w) => login.filter((p) => p.wallet === w.toLowerCase()),
    bumpLoginPasskey: async (id, counter) => {
      bumped.push(`${id}:${counter}`);
    },
    verifyWalletSignature: async (address, message, signature) => {
      signatures.push({ address, message });
      return signature === '0x5167';
    },
  });
  return { svc, store, clock, login, bumped, signatures };
}

async function withPin(h: Harness, wallet = A) {
  await h.store.savePin(wallet, { hash: await hashPin(PIN), failures: 0, lockedUntil: null });
}

test('circle_sessions_use_passkey_or_pin_web3_its_wallet', () => {
  const { svc } = harness();
  assert.deepEqual(svc.methodsFor(circle()), ['passkey', 'pin']);
  assert.deepEqual(svc.methodsFor(web3()), ['wallet']);
});

test('a_pin_grant_fits_only_its_action', async () => {
  const h = harness();
  await withPin(h);
  const req = await h.svc.challengeFor(circle(), cashOut());
  assert.equal(req.code, 'CONFIRM_REQUIRED');
  assert.equal(req.pinSet, true);
  assert.equal(req.enrol, null);
  assert.ok(req.text.startsWith(actionText(cashOut(), CHAIN)));
  assert.match(req.text, /\nNonce: [A-Za-z0-9_-]{43}$/);
  const r = await h.svc.confirmPin(circle(), req.challengeId, ' 40 29 17 ');
  assert.ok(r.ok);
  assert.deepEqual(await h.svc.confirmPresence({ account: circle(), action: cashOut('51000000'), proof: r.grant }).then((x) => x.ok), false);
  assert.deepEqual(await h.svc.confirmPresence({ account: circle(), action: cashOut(), proof: r.grant }), { ok: true });
  const again = await h.svc.confirmPresence({ account: circle(), action: cashOut(), proof: r.grant });
  assert.equal(again.ok, false, 'a grant is spent once');
  if (!again.ok) assert.equal(again.required.action.amountMicros, '50000000');
});

test('another_wallet_cannot_confirm_or_spend_my_challenge', async () => {
  const h = harness();
  await withPin(h);
  await withPin(h, B);
  const req = await h.svc.challengeFor(circle(), cashOut());
  assert.deepEqual(await h.svc.confirmPin(circle(B), req.challengeId, PIN), { ok: false, code: 'CHALLENGE_NOT_YOURS' });
  const mine = await h.svc.confirmPin(circle(), req.challengeId, PIN);
  assert.ok(mine.ok);
  const theirs = await h.svc.confirmPresence({ account: circle(B), action: cashOut('50000000', B), proof: mine.grant });
  assert.equal(theirs.ok, false);
  await assert.rejects(() => h.svc.challengeFor(circle(B), cashOut()), /not the signed-in account/);
});

test('wrong_pins_count_down_and_the_fifth_locks', async () => {
  const h = harness();
  await withPin(h);
  const req = await h.svc.challengeFor(circle(), cashOut());
  for (const left of [4, 3, 2, 1]) {
    assert.deepEqual(await h.svc.confirmPin(circle(), req.challengeId, '111222'), { ok: false, code: 'WRONG_PIN', left });
  }
  assert.deepEqual(await h.svc.confirmPin(circle(), req.challengeId, '111222'), { ok: false, code: 'PIN_LOCKED', until: h.clock.now + PIN_LOCK_MS });
  const again = await h.svc.challengeFor(circle(), cashOut());
  assert.equal(again.pinLockedUntil, h.clock.now + PIN_LOCK_MS);
});

test('a_locked_pin_does_not_run_scrypt_or_extend_the_lock', async () => {
  const h = harness();
  await h.store.savePin(A, { hash: 'scrypt$32768$8$1$AAAA$AAAA', failures: 0, lockedUntil: h.clock.now + 60_000 });
  const req = await h.svc.challengeFor(circle(), cashOut());
  const started = Date.now();
  assert.deepEqual(await h.svc.confirmPin(circle(), req.challengeId, PIN), { ok: false, code: 'PIN_LOCKED', until: h.clock.now + 60_000 });
  assert.equal((await h.store.pin(A))?.lockedUntil, h.clock.now + 60_000);
  assert.ok(Date.now() - started < 50, 'no hash was computed');
});

test('a_pin_after_the_challenge_expires_is_refused', async () => {
  const h = harness();
  await withPin(h);
  const req = await h.svc.challengeFor(circle(), cashOut());
  h.clock.now += CHALLENGE_TTL_MS + 1;
  assert.deepEqual(await h.svc.confirmPin(circle(), req.challengeId, PIN), { ok: false, code: 'CHALLENGE_EXPIRED' });
  assert.deepEqual(await h.svc.confirmPin(circle(), 'nope', PIN), { ok: false, code: 'CHALLENGE_EXPIRED' });
});

test('no_pin_set_answers_no_pin', async () => {
  const h = harness();
  const req = await h.svc.challengeFor(circle(), cashOut());
  assert.deepEqual(await h.svc.confirmPin(circle(), req.challengeId, PIN), { ok: false, code: 'NO_PIN' });
});

test('passkey_options_allow_only_this_wallets_keys_and_require_user_verification', async () => {
  const h = harness();
  const mine = softPasskey();
  const login = softPasskey();
  await h.store.addPasskey({ credentialId: mine.credentialId, wallet: A, publicKey: mine.publicKey, counter: 0, transports: ['internal'], createdAt: 1 });
  await h.store.addPasskey({ credentialId: 'theirs', wallet: B, publicKey: 'x', counter: 0, transports: [], createdAt: 1 });
  h.login.push({ credentialId: login.credentialId, wallet: A, publicKey: login.publicKey, counter: 0, transports: [], createdAt: 1 });
  const req = await h.svc.challengeFor(circle(), cashOut());
  assert.equal(req.passkeys, 2);
  const o = await h.svc.passkeyOptions(circle(), req.challengeId);
  assert.equal(o.userVerification, 'required');
  assert.deepEqual(o.allowCredentials!.map((c) => c.id).sort(), [mine.credentialId, login.credentialId].sort());

  const r = await h.svc.confirmPasskey(circle(), req.challengeId, login.assert({ challenge: o.challenge, origin: RP.origin[0]!, rpID: RP.rpID, counter: 4 }));
  assert.ok(r.ok);
  assert.deepEqual(h.bumped, [`${login.credentialId}:4`], 'the counter is bumped where the key lives');
  assert.deepEqual(await h.svc.confirmPresence({ account: circle(), action: cashOut(), proof: r.grant }), { ok: true });

  const req2 = await h.svc.challengeFor(circle(), cashOut());
  const o2 = await h.svc.passkeyOptions(circle(), req2.challengeId);
  const r2 = await h.svc.confirmPasskey(circle(), req2.challengeId, mine.assert({ challenge: o2.challenge, origin: RP.origin[0]!, rpID: RP.rpID, counter: 9 }));
  assert.ok(r2.ok);
  assert.equal((await h.store.passkeys(A))[0]?.counter, 9);
});

test('a_passkey_response_without_user_verified_is_refused', async () => {
  const h = harness();
  const key = softPasskey();
  await h.store.addPasskey({ credentialId: key.credentialId, wallet: A, publicKey: key.publicKey, counter: 0, transports: [], createdAt: 1 });
  const req = await h.svc.challengeFor(circle(), cashOut());
  const o = await h.svc.passkeyOptions(circle(), req.challengeId);
  const r = await h.svc.confirmPasskey(circle(), req.challengeId, key.assert({ challenge: o.challenge, origin: RP.origin[0]!, rpID: RP.rpID, userVerified: false }));
  assert.deepEqual(r, { ok: false, code: 'PASSKEY_FAILED' });
});

test('a_passkey_of_another_wallet_or_signed_for_another_challenge_is_refused', async () => {
  const h = harness();
  const theirs = softPasskey();
  await h.store.addPasskey({ credentialId: theirs.credentialId, wallet: B, publicKey: theirs.publicKey, counter: 0, transports: [], createdAt: 1 });
  const req = await h.svc.challengeFor(circle(), cashOut());
  const o = await h.svc.passkeyOptions(circle(), req.challengeId);
  assert.deepEqual(
    await h.svc.confirmPasskey(circle(), req.challengeId, theirs.assert({ challenge: o.challenge, origin: RP.origin[0]!, rpID: RP.rpID })),
    { ok: false, code: 'PASSKEY_FAILED' },
  );
  const mine = softPasskey();
  await h.store.addPasskey({ credentialId: mine.credentialId, wallet: A, publicKey: mine.publicKey, counter: 0, transports: [], createdAt: 1 });
  assert.deepEqual(
    await h.svc.confirmPasskey(circle(), req.challengeId, mine.assert({ challenge: 'b3RoZXI', origin: RP.origin[0]!, rpID: RP.rpID })),
    { ok: false, code: 'PASSKEY_FAILED' },
  );
});

test('web3_confirms_by_signing_the_action_text', async () => {
  const h = harness();
  const req = await h.svc.challengeFor(web3(), cashOut());
  assert.deepEqual(req.methods, ['wallet']);
  assert.equal(req.enrol, null);
  assert.deepEqual(await h.svc.confirmWallet(web3(), req.challengeId, '0xbad0'), { ok: false, code: 'WALLET_SIGNATURE_FAILED' });
  const r = await h.svc.confirmWallet(web3(), req.challengeId, '0x5167');
  assert.ok(r.ok);
  assert.deepEqual(h.signatures.at(-1), { address: A, message: req.text });
  assert.deepEqual(await h.svc.confirmPin(web3(), req.challengeId, PIN), { ok: false, code: 'METHOD_NOT_ALLOWED' });
  const circleReq = await h.svc.challengeFor(circle(), cashOut());
  assert.deepEqual(await h.svc.confirmWallet(circle(), circleReq.challengeId, '0x5167'), { ok: false, code: 'METHOD_NOT_ALLOWED' });
});

test('web3_record_setup_needs_no_proof', async () => {
  const h = harness();
  const setup = presenceAction({ kind: 'record_setup', wallet: A, amountMicros: null, recipient: null });
  assert.deepEqual(await h.svc.confirmPresence({ account: web3(), action: setup, proof: null }), { ok: true });
  assert.equal((await h.svc.confirmPresence({ account: circle(), action: setup, proof: null })).ok, false);
});

test('no_factor_says_how_to_enrol', async () => {
  const h = harness();
  assert.equal((await h.svc.challengeFor(circle(), cashOut())).enrol, 'email_code');
  const fresh = circle(A, { email: undefined, via: 'open_link', iat: Math.floor(h.clock.now / 1000) - 60 });
  assert.equal((await h.svc.challengeFor(fresh, cashOut())).enrol, 'open_link');
  const old = circle(A, { email: undefined, via: 'open_link', iat: Math.floor(h.clock.now / 1000) - 11 * 60 });
  assert.equal((await h.svc.challengeFor(old, cashOut())).enrol, 'add_email');
  await withPin(h);
  assert.equal((await h.svc.challengeFor(circle(), cashOut())).enrol, null);
});

test('a_wallet_signature_confirms_only_the_challenge_it_was_made_for', async () => {
  const h = harness();
  const first = await h.svc.challengeFor(web3(), cashOut());
  const second = await h.svc.challengeFor(web3(), cashOut());
  assert.notEqual(first.text, second.text, 'each challenge has its own nonce');
  assert.ok(first.text.startsWith(actionText(cashOut(), CHAIN)));
  assert.ok(await h.svc.confirmWallet(web3(), first.challengeId, '0x5167').then((r) => r.ok));
  assert.equal(h.signatures.at(-1)?.message, first.text);
  await h.svc.confirmWallet(web3(), second.challengeId, '0x5167');
  assert.equal(h.signatures.at(-1)?.message, second.text, 'the second challenge is checked against its own text');
});

test('asking_for_a_confirmation_cleans_out_old_challenges_now_and_then', async () => {
  const h = harness();
  const old = await h.svc.challengeFor(circle(), cashOut());
  h.clock.now += 60 * 60_000;
  await h.svc.challengeFor(circle(), cashOut());
  assert.equal(await h.store.challenge(old.challengeId), null);
});
