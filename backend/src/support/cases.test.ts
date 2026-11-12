import assert from 'node:assert/strict';
import test from 'node:test';
import { firstReplyDue } from './caseRules.js';
import { memoryCaseStore, type CaseStore } from './cases.js';

const NOW = Date.parse('2026-11-12T10:00:00+01:00');

function opened(store: CaseStore, over: Partial<Parameters<CaseStore['open']>[0]> = {}) {
  return store.open({
    address: '0xabc',
    contactVerified: true,
    kind: 'money_in_deal',
    records: [{ kind: 'deal', id: 'd1' }],
    channel: 'web',
    text: 'My money is stuck',
    role: 'person',
    now: NOW,
    ...over,
  });
}

test('the first case is KT-1001 and the next KT-1002', async () => {
  const store = memoryCaseStore('testnet');
  assert.equal((await opened(store)).ref, 'KT-1001');
  assert.equal((await opened(store, { address: '0xdef' })).ref, 'KT-1002');
});

test('open sets dueAt from firstReplyDue and state new', async () => {
  const c = await opened(memoryCaseStore('testnet'));
  assert.equal(c.state, 'new');
  assert.equal(c.dueAt, firstReplyDue(NOW));
  assert.equal(c.lastChannel, 'web');
});

test('messages for the person leave out notes', async () => {
  const store = memoryCaseStore('testnet');
  const c = await opened(store);
  await store.add(c.id, { role: 'note', memberId: 'm1', channel: 'desk', text: 'Looks like a partner failure', at: NOW + 1 });
  await store.add(c.id, { role: 'teammate', memberId: 'm1', channel: 'desk', text: 'We are on it', at: NOW + 2 });
  assert.equal((await store.messages(c.id, { forPerson: true })).length, 2);
  assert.equal((await store.messages(c.id, { forPerson: false })).length, 3);
  assert.ok((await store.messages(c.id, { forPerson: true })).every((m) => m.role !== 'note'));
});

test('a teammate reply sets firstRepliedAt once and state waiting_person', async () => {
  const store = memoryCaseStore('testnet');
  const c = await opened(store);
  await store.add(c.id, { role: 'teammate', memberId: 'm1', channel: 'desk', text: 'First', at: NOW + 10 });
  await store.add(c.id, { role: 'teammate', memberId: 'm2', channel: 'desk', text: 'Second', at: NOW + 20 });
  const after = await store.get(c.ref);
  assert.equal(after?.state, 'waiting_person');
  assert.equal(after?.firstRepliedAt, NOW + 10);
});

test('a held teammate reply changes nothing', async () => {
  const store = memoryCaseStore('testnet');
  const c = await opened(store);
  await store.add(c.id, { role: 'teammate', memberId: 'm1', channel: 'desk', text: 'Send me the OTP', heldReason: 'asks for a code', at: NOW + 10 });
  const after = await store.get(c.ref);
  assert.equal(after?.state, 'new');
  assert.equal(after?.firstRepliedAt, undefined);
  assert.equal((await store.messages(c.id, { forPerson: true })).length, 1);
});

test('a person message on a solved case sets waiting_us and clears solvedAt', async () => {
  const store = memoryCaseStore('testnet');
  const c = await opened(store);
  await store.update(c.id, { state: 'solved', solvedAt: NOW + 5 });
  await store.add(c.id, { role: 'person', channel: 'telegram', text: 'Still not there', at: NOW + 30 });
  const after = await store.get(c.ref);
  assert.equal(after?.state, 'waiting_us');
  assert.equal(after?.solvedAt, undefined);
  assert.equal(after?.lastChannel, 'telegram');
});

test('get finds a case by ref or id, and byLegacyId by the old ticket id', async () => {
  const store = memoryCaseStore('testnet');
  const c = await opened(store, { legacyId: 'KSUP-a1b2c3d4e5' });
  assert.equal((await store.get(c.id))?.ref, c.ref);
  assert.equal((await store.get(c.ref))?.id, c.id);
  assert.equal((await store.byLegacyId('KSUP-a1b2c3d4e5'))?.id, c.id);
});

test('openFor lists unsolved cases, forPerson lists all', async () => {
  const store = memoryCaseStore('testnet');
  const a = await opened(store);
  await opened(store, { records: [{ kind: 'deal', id: 'd2' }] });
  await store.update(a.id, { state: 'solved', solvedAt: NOW });
  assert.equal((await store.openFor('0xabc')).length, 1);
  assert.equal((await store.forPerson('0xabc')).length, 2);
});

test('queue is oldest due first and filters', async () => {
  const store = memoryCaseStore('testnet');
  const late = await opened(store, { now: NOW + 60_000 });
  const early = await opened(store, { address: '0xdef', now: NOW });
  await store.update(late.id, { asked: 'm2' });
  assert.deepEqual((await store.queue({})).map((c) => c.ref), [early.ref, late.ref]);
  assert.deepEqual((await store.queue({ asked: 'm2' })).map((c) => c.ref), [late.ref]);
  assert.deepEqual((await store.queue({ state: 'solved' })).map((c) => c.ref), []);
});

test('deleteFor removes the person\'s cases and their messages', async () => {
  const store = memoryCaseStore('testnet');
  const c = await opened(store);
  await opened(store, { address: '0xdef' });
  assert.equal(await store.deleteFor('0xABC'), 1);
  assert.equal(await store.get(c.ref), null);
  assert.deepEqual(await store.messages(c.id, { forPerson: false }), []);
  assert.equal((await store.queue({})).length, 1);
});
