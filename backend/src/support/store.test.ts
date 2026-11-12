import assert from 'node:assert/strict';
import test from 'node:test';
import { memoryCaseStore, useCaseStoreForTests } from './cases.js';

const DEAL = `0x${'d1'.repeat(32)}`;
const ME = `0x${'a1'.repeat(20)}`;

const store = memoryCaseStore('testnet');
useCaseStoreForTests(store);
const {
  appendOperatorMessage,
  appendUserMessage,
  closeConversation,
  createConversation,
  getConversation,
  messagesSince,
} = await import('./store.js');

test('a second start about the same deal joins the open case', async () => {
  const first = await createConversation({ address: ME, dealId: DEAL, transcript: [{ role: 'user', content: 'My money is held' }] });
  const second = await createConversation({ address: ME, dealId: DEAL, transcript: [{ role: 'user', content: 'Still held' }] });
  assert.equal(second.id, first.id);
  assert.match(first.id, /^KT-\d{4}$/);
  const texts = (await messagesSince(first.id, 0)).map((m) => m.text);
  assert.deepEqual(texts, ['My money is held', 'Still held']);
  assert.deepEqual(second.dealIds, [DEAL]);
});

test('a start with no deal opens its own case', async () => {
  const a = await createConversation({ address: ME, transcript: [{ role: 'user', content: 'How do I post?' }] });
  const b = await createConversation({ address: ME, transcript: [{ role: 'user', content: 'Another question' }] });
  assert.notEqual(a.id, b.id);
});

test('a solved case written to again reopens', async () => {
  const c = await createConversation({ address: ME, transcript: [{ role: 'user', content: 'Help' }] });
  await appendOperatorMessage(c.id, 'Done, it is back in your balance');
  await closeConversation(c.id);
  assert.equal((await getConversation(c.id))?.status, 'closed');
  const again = await appendUserMessage(c.id, 'Not there yet', 'telegram');
  assert.equal(again?.status, 'open');
});

test('team notes and held replies never show in the person\'s messages', async () => {
  const c = await createConversation({ address: ME, transcript: [{ role: 'user', content: 'Help' }] });
  const caseRow = await store.get(c.id);
  await store.add(caseRow!.id, { role: 'note', memberId: 'm1', channel: 'desk', text: 'internal', at: Date.now() });
  await store.add(caseRow!.id, { role: 'teammate', memberId: 'm1', channel: 'desk', text: 'send the OTP', heldReason: 'asks for a code', at: Date.now() });
  const roles = (await messagesSince(c.id, 0)).map((m) => m.role);
  assert.deepEqual(roles, ['user']);
});

test('an old KSUP id still finds the moved case', async () => {
  const moved = await store.open({
    address: ME, contactVerified: true, kind: 'other', records: [], channel: 'web', text: 'old', role: 'person', legacyId: 'KSUP-0011223344', now: Date.now(),
  });
  assert.equal((await getConversation('KSUP-0011223344'))?.id, moved.ref);
});
