import assert from 'node:assert/strict';
import test from 'node:test';
import { recoveryRoutes, __test } from './recovery.js';
import { linkModularAccount } from '../db/modularAccounts.js';
import { recoveryEmail } from '../emails/recovery.js';
import { RECOVERY_WAIT_MS } from '../recovery/rules.js';

const W = '0x6666666666666666666666666666666666666666';
const OTHER = '0x8888888888888888888888888888888888888888';
const EMAIL = 'recover-ada@example.com';
const verifier = Buffer.alloc(32, 9).toString('base64url');
let now = 1_000_000;
let signedIn: string | null = W;
let ownerOk = true;
const codes: string[] = [];
const emails: string[] = [];
__test.setClock(() => now);
__test.setSession(() => signedIn);
__test.setOwnerCheck(async () => ownerOk);
__test.setCodeSink((c) => codes.push(c));
__test.setMailer(async (kind) => { emails.push(kind); });

// Each call comes from its own address so the per-IP rate limits (tested on
// their own in middleware) do not cut the flow short here.
let ip = 0;
const post = (path: string, body: unknown = {}) =>
  recoveryRoutes.request(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-real-ip': `10.0.0.${++ip}` },
    body: JSON.stringify(body),
  });
const json = async (r: Response) => (await r.json()) as Record<string, unknown>;

async function ticket(): Promise<string> {
  await post('/code/request', { email: EMAIL });
  return (await json(await post('/code/verify', { email: EMAIL, code: codes.at(-1) }))).ticket as string;
}

test('setup stores the backup once and status reports it', async () => {
  await linkModularAccount(W, EMAIL);
  const body = {
    recoveryAddress: '0x7777777777777777777777777777777777777777',
    kdf: { alg: 'argon2id', m: 65536, t: 3, p: 1, salt: 'c2FsdHNhbHQ' },
    iv: 'aXZpdml2aXZpdg',
    blob: 'YmxvYg',
    verifier,
  };
  assert.equal((await post('/setup', body)).status, 200);
  assert.equal((await post('/setup', body)).status, 409);
  assert.deepEqual(await json(await recoveryRoutes.request('/status')), { backup: true, onchain: false, request: null });
});

test('start is refused until recovery is switched on', async () => {
  const r = await post('/start', { ticket: await ticket(), verifier });
  assert.equal(r.status, 400);
  assert.equal((await json(r)).code, 'not_registered');
});

test('registered needs the on-chain owner proof', async () => {
  ownerOk = false;
  assert.equal((await json(await post('/registered', { message: 'm', signature: '0x01' }))).code, 'not_owner');
  ownerOk = true;
  assert.equal((await post('/registered', { message: 'm', signature: '0x01' })).status, 200);
  assert.equal((await json(await recoveryRoutes.request('/status'))).onchain, true);
});

test('own-backup is only for the signed-in wallet', async () => {
  assert.equal((await json(await recoveryRoutes.request('/own-backup'))).blob, 'YmxvYg');
  signedIn = OTHER;
  assert.equal((await recoveryRoutes.request('/own-backup')).status, 404);
  signedIn = null;
  assert.equal((await recoveryRoutes.request('/own-backup')).status, 401);
  signedIn = W;
});

test('state reads without using up the ticket', async () => {
  const t = await ticket();
  assert.deepEqual(await json(await post('/state', { ticket: t })), { request: null });
  assert.equal((await post('/kdf', { ticket: t })).status, 200);
});

test('a wrong password says how many tries are left, and the sixth try is locked', async () => {
  const bad = Buffer.alloc(32, 1).toString('base64url');
  for (let i = 0; i < 5; i++) {
    const r = await json(await post('/start', { ticket: await ticket(), verifier: bad }));
    assert.equal(r.code, 'wrong_password');
    assert.equal(r.remaining, 4 - i);
  }
  const locked = await post('/start', { ticket: await ticket(), verifier });
  assert.equal(locked.status, 429, 'the right password is locked out too');
  now += 24 * 60 * 60 * 1000 + 1;
});

test('start opens one waiting request; starting again keeps the clock and sends no second email', async () => {
  emails.length = 0;
  const first = await json(await post('/start', { ticket: await ticket(), verifier }));
  assert.equal(first.releasableAt, now + RECOVERY_WAIT_MS);
  now += 1000;
  const again = await json(await post('/start', { ticket: await ticket(), verifier }));
  assert.equal(again.releasableAt, first.releasableAt);
  assert.equal(again.created, false);
  assert.deepEqual(emails, ['started']);
  assert.equal(((await json(await recoveryRoutes.request('/status'))).request as { state: string }).state, 'waiting');
});

test('release is refused before 48 hours, reopens with a fresh code, and a ticket cannot be reused', async () => {
  assert.equal((await json(await post('/release', { ticket: await ticket() }))).code, 'too_early');
  now += RECOVERY_WAIT_MS;
  const t = await ticket();
  const ok = await json(await post('/release', { ticket: t }));
  assert.equal(ok.blob, 'YmxvYg');
  assert.equal(ok.walletAddress, W);
  assert.equal((await json(await post('/release', { ticket: t }))).code, 'ticket_expired');
  emails.length = 0;
  assert.equal((await json(await post('/release', { ticket: await ticket() }))).blob, 'YmxvYg', 'a closed tab can come back');
  assert.deepEqual(emails, [], 'the ready email goes once');
});

test('another signed-in wallet cannot cancel; the owner session can', async () => {
  signedIn = OTHER;
  assert.equal((await json(await post('/cancel'))).code, 'nothing_to_cancel');
  signedIn = W;
  assert.equal((await post('/cancel')).status, 200);
  assert.equal((await json(await recoveryRoutes.request('/status'))).request, null);
});

test('an unknown email still answers sent, so accounts cannot be discovered', async () => {
  const before = codes.length;
  assert.deepEqual(await json(await post('/code/request', { email: 'nobody@example.com' })), { sent: true });
  assert.equal(codes.length, before, 'no code is made for an unknown email');
});

test('recovery emails carry no em dash and name the cancel link when there is one', () => {
  for (const kind of ['started', 'reminder', 'released', 'completed', 'cancelled'] as const) {
    const { subject, html, text } = recoveryEmail(kind, { releasableAt: 0, cancelUrl: 'https://karwan.site/recover/cancel?token=x' });
    for (const part of [subject, html, text]) assert.doesNotMatch(part, /—/, kind);
  }
  assert.match(recoveryEmail('started', { cancelUrl: 'https://karwan.site/recover/cancel?token=x' }).text, /recover\/cancel\?token=x/);
});
