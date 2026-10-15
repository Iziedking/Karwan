import assert from 'node:assert/strict';
import test from 'node:test';

process.env.NODE_ENV = 'test';
const { recipientsFor, summaryFor } = await import('./notifier.js');

const event = (notify: boolean) => ({
  type: 'request.shortlist' as const,
  jobId: '0xjob',
  actor: 'buyer' as const,
  ts: 1,
  payload: { buyer: '0xBUYER', notify, readsBalanceEmpty: false, entries: [] },
});

test('the shortlist goes only to the buyer, and only for updates marked worth a message', async () => {
  assert.deepEqual(await recipientsFor(event(true)), [{ address: '0xbuyer', role: 'buyer' }]);
  assert.deepEqual(await recipientsFor(event(false)), []);
});

test('the shortlist message is the chat rendering of the list', () => {
  assert.match(summaryFor(event(true), 'buyer')?.text ?? '', /No one has offered yet/);
});
