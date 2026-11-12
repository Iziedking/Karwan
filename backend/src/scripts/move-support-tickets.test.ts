import assert from 'node:assert/strict';
import test from 'node:test';
import { memoryCaseStore } from '../support/cases.js';
import { moveTickets, type LegacyTicket } from './move-support-tickets.js';

const T0 = Date.parse('2026-11-10T10:00:00+01:00');

const tickets: LegacyTicket[] = [
  {
    id: 'KSUP-0011223344',
    address: '0xabc',
    channel: 'widget',
    status: 'closed',
    dealIds: ['0xdeal'],
    messages: [
      { role: 'user', text: 'My money is held', ts: T0 },
      { role: 'assistant', text: 'Passing you to a person', ts: T0 + 1 },
      { role: 'operator', text: 'Released now', ts: T0 + 60_000 },
    ],
    createdAt: T0,
    updatedAt: T0 + 60_000,
    closedAt: T0 + 61_000,
  },
  {
    id: 'KSUP-aabbccddee',
    email: 'ada@example.com',
    channel: 'email',
    subject: 'Payout',
    status: 'open',
    messages: [{ role: 'user', text: 'Where is my payout?', ts: T0 + 5 }],
    createdAt: T0 + 5,
    updatedAt: T0 + 5,
  },
];

test('moving keeps each ticket as a case with its old id, messages and state', async () => {
  const store = memoryCaseStore('testnet');
  assert.deepEqual(await moveTickets(tickets, store, { dryRun: false }), { moved: 2, skipped: 0 });
  const a = await store.byLegacyId('KSUP-0011223344');
  assert.equal(a?.state, 'solved');
  assert.equal(a?.solvedAt, T0 + 61_000);
  assert.equal(a?.firstRepliedAt, T0 + 60_000);
  assert.deepEqual(a?.records, [{ kind: 'deal', id: '0xdeal' }]);
  assert.deepEqual((await store.messages(a!.id, { forPerson: false })).map((m) => m.role), ['person', 'bot', 'teammate']);
  const b = await store.byLegacyId('KSUP-aabbccddee');
  assert.equal(b?.lastChannel, 'email');
  assert.equal(b?.contactVerified, false);
  assert.equal(b?.subject, 'Payout');
});

test('moving twice moves nothing the second time', async () => {
  const store = memoryCaseStore('testnet');
  await moveTickets(tickets, store, { dryRun: false });
  assert.deepEqual(await moveTickets(tickets, store, { dryRun: false }), { moved: 0, skipped: 2 });
  assert.equal((await store.queue({})).length + (await store.queue({ state: 'solved' })).length, 2);
});

test('dry run writes nothing', async () => {
  const store = memoryCaseStore('testnet');
  assert.deepEqual(await moveTickets(tickets, store, { dryRun: true }), { moved: 2, skipped: 0 });
  assert.equal(await store.byLegacyId('KSUP-0011223344'), null);
});
