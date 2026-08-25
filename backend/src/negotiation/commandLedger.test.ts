import assert from 'node:assert/strict';
import test from 'node:test';
import { CommandIdempotencyConflict, InMemoryNegotiationCommandLedger } from './commandLedger.js';

test('command ledger returns the first result for duplicate delivery', async () => {
  const ledger = new InMemoryNegotiationCommandLedger();
  const first = await ledger.put({ commandId: 'cmd-1', idempotencyKey: 'accept:room-1:8', kind: 'accept', result: { outcome: 'accepted' }, createdAt: 100 });
  const duplicate = await ledger.put({ commandId: 'cmd-1', idempotencyKey: 'accept:room-1:8', kind: 'accept', result: { outcome: 'different' }, createdAt: 200 });
  assert.deepEqual(duplicate, first);
});

test('command ledger rejects reuse of a key for a different command', async () => {
  const ledger = new InMemoryNegotiationCommandLedger();
  await ledger.put({ commandId: 'cmd-1', idempotencyKey: 'offer:room-1:8', kind: 'offer', result: { outcome: 'published' }, createdAt: 100 });
  await assert.rejects(() => ledger.put({ commandId: 'cmd-2', idempotencyKey: 'offer:room-1:8', kind: 'offer', result: { outcome: 'published' }, createdAt: 100 }), CommandIdempotencyConflict);
});

test('command ledger audit counts durable stale offer acceptances', async () => {
  const ledger = new InMemoryNegotiationCommandLedger();
  await ledger.put({ commandId: 'accept-1', idempotencyKey: 'accept:room-1:1', kind: 'accept_offer', result: { outcome: 'stale', reason: 'STALE_OFFER' }, createdAt: 100 });
  await ledger.put({ commandId: 'offer-1', idempotencyKey: 'offer:room-1:1', kind: 'publish_offer', result: { outcome: 'published' }, createdAt: 100 });
  assert.deepEqual(await ledger.summary(), { total: 2, staleOfferAcceptances: 1, duplicateCommandConflicts: 0 });
});

test('command ledger audit records an explicit conflict without executing a command', async () => {
  const ledger = new InMemoryNegotiationCommandLedger();
  await ledger.recordConflict({
    idempotencyKey: 'offer:room-1:9', commandId: 'cmd-conflict', kind: 'accept_offer', createdAt: 100,
  });
  assert.equal((await ledger.summary()).duplicateCommandConflicts, 1);
});
