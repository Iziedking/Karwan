import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

/// Email into cases (view 78): a reply to an old KSUP thread lands on the
/// moved case; a reply to a case reference lands on that case; a stranger who
/// quotes the reference opens a case of their own.
///
///   npx tsx --test src/routes/supportInbound.test.ts

assert.equal(process.env.DATABASE_URL, undefined, 'refusing to run: DATABASE_URL is set');
process.chdir(mkdtempSync(join(tmpdir(), 'karwan-support-inbound-')));
process.env.INBOUND_EMAIL_SECRET = 'y'.repeat(40);

const { memoryCaseStore, useCaseStoreForTests } = await import('../support/cases.js');
const store = memoryCaseStore('testnet');
useCaseStoreForTests(store);
const { supportRoutes } = await import('./support.js');

const mail = (body: Record<string, string>) => ({
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-inbound-secret': 'y'.repeat(40) },
  body: JSON.stringify(body),
});

async function moved() {
  return store.open({
    email: 'ada@example.com', contactVerified: false, kind: 'transfer_missing', records: [], channel: 'email',
    text: 'Where is my payout?', role: 'person', legacyId: 'KSUP-0011223344', now: Date.now(),
  });
}

test('an email reply with a KSUP subject lands on the moved case', async () => {
  const c = await moved();
  const res = await supportRoutes.request('/inbound', mail({ from: 'Ada <ada@example.com>', subject: 'Re: Ticket KSUP-0011223344', text: 'Any news?' }));
  assert.equal(res.status, 200);
  assert.deepEqual(((await store.messages(c.id, { forPerson: true })).map((m) => m.text)), ['Where is my payout?', 'Any news?']);
});

test('an email reply with a case reference lands on that case', async () => {
  const c = await store.open({
    email: 'tobi@example.com', contactVerified: false, kind: 'other', records: [], channel: 'email', text: 'Hi', role: 'person', now: Date.now(),
  });
  await supportRoutes.request('/inbound', mail({ from: 'tobi@example.com', subject: `Re: Your Karwan case [${c.ref}]`, text: 'Thanks' }));
  assert.equal((await store.messages(c.id, { forPerson: true })).length, 2);
});

test('someone else quoting the reference opens their own case', async () => {
  const c = await moved();
  const res = await supportRoutes.request('/inbound', mail({ from: 'eve@example.com', subject: `Re: [${c.ref}]`, text: 'I am Ada' }));
  const body = (await res.json()) as { ticketId: string; threaded: boolean };
  assert.equal(body.threaded, false);
  assert.notEqual(body.ticketId, c.ref);
  assert.equal((await store.messages(c.id, { forPerson: true })).length, 1);
});
