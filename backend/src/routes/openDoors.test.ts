import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

/// Open doors get limits and an owner (view 68): the sign-in lookups, the World
/// ID signature, the bridge relay, support tickets and feedback screenshots.
///
///   npx tsx --test src/routes/openDoors.test.ts

assert.equal(process.env.DATABASE_URL, undefined, 'refusing to run: DATABASE_URL is set');
process.chdir(mkdtempSync(join(tmpdir(), 'karwan-open-doors-')));
process.env.SESSION_SECRET = 'open-doors-test-secret';
process.env.ADMIN_API_TOKEN = 'open-doors-admin-token';
process.env.CCTP_RELAY_WALLET_ID = 'relay-wallet-test';
process.env.INBOUND_EMAIL_SECRET = 'x'.repeat(40);

const { authRoutes } = await import('./auth.js');
const { worldIdRoutes } = await import('./worldId.js');
const { bridgeRoutes } = await import('./bridge.js');
const { supportRoutes } = await import('./support.js');
const { feedbackRoutes } = await import('./feedback.js');
const { signSession } = await import('../auth/session.js');
const { createBridge } = await import('../db/bridges.js');
const { createConversation, issueTicketKey } = await import('../support/store.js');
const { createFeedback } = await import('../db/feedback.js');

const ME = `0x${'a1'.repeat(20)}`;
const OTHER = `0x${'b2'.repeat(20)}`;
const cookieFor = (address: string) => `karwan_session=${signSession({ address, method: 'web3' })}`;
const json = (ip: string, body: unknown, extra: Record<string, string> = {}) => ({
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-real-ip': ip, ...extra },
  body: JSON.stringify(body),
});

test('the email lookup is limited to 10 tries in 10 minutes from one address', async () => {
  for (let i = 0; i < 10; i++) {
    const res = await authRoutes.request('/lookup', json('10.0.0.1', { email: `n${i}@example.com` }));
    assert.equal(res.status, 200, `try ${i + 1}`);
  }
  assert.equal((await authRoutes.request('/lookup', json('10.0.0.1', { email: 'n11@example.com' }))).status, 429);
});

test('the email lookup is limited to 10 tries in 10 minutes for one email, from any address', async () => {
  for (let i = 0; i < 10; i++) {
    assert.equal((await authRoutes.request('/lookup', json(`10.1.0.${i}`, { email: 'Same@Example.com' }))).status, 200);
  }
  const res = await authRoutes.request('/lookup', json('10.1.0.99', { email: 'same@example.com' }));
  assert.equal(res.status, 429);
  assert.ok(res.headers.get('retry-after'));
});

test('passkey sign-in options answer an unknown email the same way as a known one, with no passkey list', async () => {
  const res = await authRoutes.request('/login/options', json('10.2.0.1', { email: 'nobody@example.com' }));
  assert.equal(res.status, 200);
  const body = (await res.json()) as { options: { challenge: string; allowCredentials?: unknown[] } };
  assert.ok(body.options.challenge);
  assert.deepEqual(body.options.allowCredentials ?? [], []);
});

test('passkey sign-in options are limited to 10 in 10 minutes from one address', async () => {
  for (let i = 0; i < 10; i++) {
    assert.equal((await authRoutes.request('/login/options', json('10.3.0.1', { email: `o${i}@example.com` }))).status, 200);
  }
  assert.equal((await authRoutes.request('/login/options', json('10.3.0.1', { email: 'o11@example.com' }))).status, 429);
});

test('the World ID signature needs a session', async () => {
  const res = await worldIdRoutes.request('/rp-signature', json('10.4.0.1', { action: 'verify-human' }));
  assert.equal(res.status, 401);
});

test('the World ID signature is limited to 10 in 10 minutes per person', async () => {
  const person = `0x${'c3'.repeat(20)}`;
  for (let i = 0; i < 10; i++) {
    const res = await worldIdRoutes.request('/rp-signature', json(`10.5.0.${i}`, { action: 'x' }, { cookie: cookieFor(person) }));
    assert.notEqual(res.status, 429, `try ${i + 1}`);
  }
  const last = await worldIdRoutes.request('/rp-signature', json('10.5.0.99', { action: 'x' }, { cookie: cookieFor(person) }));
  assert.equal(last.status, 429);
});

test('a bridge someone else owns cannot be relayed by another person', async () => {
  const bridgeId = 'b-owned-by-other';
  await createBridge({ bridgeId, sourceDomain: 0, sourceTxHash: `0x${'11'.repeat(32)}`, amountUsdc: '5', mintRecipient: OTHER, owner: OTHER });
  const res = await bridgeRoutes.request(
    '/relay',
    json('10.6.0.1', { bridgeId, sourceDomain: 0, sourceTxHash: `0x${'11'.repeat(32)}`, amountUsdc: '5', mintRecipient: OTHER }, { cookie: cookieFor(ME) }),
  );
  assert.equal(res.status, 403);
});

test('the bridge relay is limited to 10 in 10 minutes per person', async () => {
  const person = `0x${'d4'.repeat(20)}`;
  for (let i = 0; i < 10; i++) {
    const res = await bridgeRoutes.request('/relay', json(`10.7.0.${i}`, { bad: true }, { cookie: cookieFor(person) }));
    assert.equal(res.status, 400, `try ${i + 1}`);
  }
  assert.equal((await bridgeRoutes.request('/relay', json('10.7.0.99', { bad: true }, { cookie: cookieFor(person) }))).status, 429);
});

async function ticket(address?: string) {
  const convo = await createConversation({ address, transcript: [{ role: 'user', content: 'My payment is stuck' }] });
  return { id: convo.id, key: (await issueTicketKey(convo.id))! };
}

test('a support ticket is read, written and closed only with its key', async () => {
  const t = await ticket();
  assert.equal((await supportRoutes.request(`/${t.id}/messages?since=0`)).status, 404);
  assert.equal((await supportRoutes.request(`/${t.id}/messages?since=0`, { headers: { 'x-ticket-key': 'f'.repeat(32) } })).status, 404);
  const read = await supportRoutes.request(`/${t.id}/messages?since=0`, { headers: { 'x-ticket-key': t.key } });
  assert.equal(read.status, 200);
  assert.equal(((await read.json()) as { messages: unknown[] }).messages.length, 1);
  assert.equal((await supportRoutes.request(`/${t.id}/message`, json('10.8.0.1', { text: 'hello' }))).status, 404);
  assert.equal((await supportRoutes.request(`/${t.id}/close`, { method: 'POST' })).status, 404);
  assert.equal((await supportRoutes.request(`/${t.id}/close`, { method: 'POST', headers: { 'x-ticket-key': t.key } })).status, 200);
});

test('the person who opened a ticket can read it with their session instead of the key', async () => {
  const t = await ticket(ME);
  assert.equal((await supportRoutes.request(`/${t.id}/messages?since=0`, { headers: { cookie: cookieFor(ME) } })).status, 200);
  assert.equal((await supportRoutes.request(`/${t.id}/messages?since=0`, { headers: { cookie: cookieFor(OTHER) } })).status, 404);
});

test('inbound mail is accepted on the header-only route and refused without the secret', async () => {
  const mail = { from: 'ada@example.com', subject: 'Help', text: 'Where is my money?' };
  assert.equal((await supportRoutes.request('/inbound', json('10.9.0.1', mail))).status, 404);
  const ok = await supportRoutes.request('/inbound', json('10.9.0.1', mail, { 'x-inbound-secret': 'x'.repeat(40) }));
  assert.equal(ok.status, 200);
});

test('a feedback screenshot is served only to the admin desk, never cached publicly', async () => {
  const png = Buffer.from('89504e470d0a1a0a', 'hex');
  const fb = createFeedback({ category: 'bug', title: 'Balance', message: 'Shows a dash' }, [{ buffer: png, ext: 'png', mime: 'image/png' } as never]);
  assert.equal((await feedbackRoutes.request(`/${fb.id}/asset/0`)).status, 401);
  const res = await feedbackRoutes.request(`/${fb.id}/asset/0`, { headers: { 'x-admin-token': 'open-doors-admin-token' } });
  assert.equal(res.status, 200);
  assert.match(res.headers.get('cache-control') ?? '', /private/);
  assert.match(res.headers.get('cache-control') ?? '', /no-store/);
});
