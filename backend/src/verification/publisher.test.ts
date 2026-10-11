import assert from 'node:assert/strict';
import test from 'node:test';
import type { StoredFact } from './evidence.js';
import { LEVEL_CODE, createFactPublisher, type PublisherDeps } from './publisher.js';

const now = Date.UTC(2026, 9, 12);
const fact = (over: Partial<StoredFact>): StoredFact => ({
  id: 'f1',
  kind: 'client_confirmation',
  level: 'user_proof',
  issuedAt: now,
  expiresAt: now + 1e10,
  evidenceHash: `0x${'aa'.repeat(32)}`,
  source: 'whatsapp',
  ...over,
});

function setup(opts: { configured?: boolean; event?: boolean; revokeEvent?: boolean; stored?: Record<string, StoredFact[]> } = {}) {
  const stored = new Map(Object.entries(opts.stored ?? { '0xada': [fact({})] }));
  const calls: Array<{ subject: string; level: number; expiresAt: number }> = [];
  const revokes: string[] = [];
  const deps: PublisherDeps = {
    configured: opts.configured ?? true,
    listSubjects: async () => [...stored.keys()],
    getStored: async (a) => stored.get(a) ?? [],
    putStored: async (a, f) => {
      stored.set(a, f);
    },
    recordOnChain: async (input) => {
      calls.push({ subject: input.subject, level: input.level, expiresAt: input.expiresAtSec });
      return opts.event === false ? null : { txHash: '0xtx', factId: '7' };
    },
    revokeOnChain: async ({ factId }) => {
      revokes.push(factId);
      return opts.revokeEvent === false ? null : { txHash: '0xrevoke' };
    },
  };
  return { publish: createFactPublisher(deps), stored, calls, revokes };
}

test('an unpublished fact is written once and marked with its transaction', async () => {
  const { publish, stored, calls } = setup();
  assert.equal(await publish(), 1);
  assert.deepEqual(stored.get('0xada')![0].onchain, { factId: '7', txHash: '0xtx' });
  assert.equal(await publish(), 0);
  assert.equal(calls.length, 1);
});

test('the level is written as its published code and the expiry in seconds', async () => {
  const { publish, calls } = setup();
  await publish();
  assert.equal(calls[0].level, LEVEL_CODE.user_proof);
  assert.equal(calls[0].expiresAt, Math.floor((now + 1e10) / 1000));
});

test('a receipt without the FactRecorded event leaves the fact unpublished', async () => {
  const { publish, stored } = setup({ event: false });
  assert.equal(await publish(), 0);
  assert.equal(stored.get('0xada')![0].onchain, undefined);
});

test('nothing is written when the contract or issuer wallet is not configured', async () => {
  const { publish, calls } = setup({ configured: false });
  assert.equal(await publish(), 0);
  assert.equal(calls.length, 0);
});

test('expired facts and self-reported facts are never written', async () => {
  const { publish, calls } = setup({
    stored: { '0xada': [fact({ id: 'old', expiresAt: now - 1 }), fact({ id: 'self', level: 'self_reported' })] },
  });
  assert.equal(await publish(now), 0);
  assert.equal(calls.length, 0);
});

test('one failing fact does not stop the others', async () => {
  let n = 0;
  const { publish, stored } = setup({ stored: { '0xada': [fact({ id: 'a' }), fact({ id: 'b', evidenceHash: `0x${'bb'.repeat(32)}` })] } });
  const failing = createFactPublisher({
    configured: true,
    listSubjects: async () => ['0xada'],
    getStored: async (a) => stored.get(a) ?? [],
    putStored: async (a, f) => {
      stored.set(a, f);
    },
    recordOnChain: async () => {
      if (n++ === 0) throw new Error('rpc down');
      return { txHash: '0xtx2', factId: '8' };
    },
    revokeOnChain: async () => null,
  });
  void publish;
  assert.equal(await failing(), 1);
  assert.equal(stored.get('0xada')!.filter((f) => f.onchain).length, 1);
});

test('a fact a reviewer withdrew before it was published never goes on chain', async () => {
  const { publish, calls } = setup({ stored: { '0xada': [fact({ revokedAt: now })] } });
  assert.equal(await publish(), 0);
  assert.equal(calls.length, 0);
});

test('a withdrawn fact already on Arc is revoked there once, by the issuer that wrote it', async () => {
  const onchain = { factId: '7', txHash: '0xtx' };
  const { publish, stored, revokes, calls } = setup({ stored: { '0xada': [fact({ revokedAt: now, onchain })] } });
  assert.equal(await publish(), 1);
  assert.deepEqual(revokes, ['7']);
  assert.deepEqual(stored.get('0xada')![0].onchain, { ...onchain, revokedTxHash: '0xrevoke' });
  assert.equal(await publish(), 0);
  assert.deepEqual(revokes, ['7'], 'never twice');
  assert.equal(calls.length, 0, 'a withdrawn fact is never written again');
});

test('a revoke whose receipt shows no FactRevoked is tried again on the next sweep', async () => {
  const { publish, stored, revokes } = setup({ revokeEvent: false, stored: { '0xada': [fact({ revokedAt: now, onchain: { factId: '7', txHash: '0xtx' } })] } });
  assert.equal(await publish(), 0);
  assert.equal(stored.get('0xada')![0].onchain?.revokedTxHash, undefined);
  await publish();
  assert.deepEqual(revokes, ['7', '7']);
});
