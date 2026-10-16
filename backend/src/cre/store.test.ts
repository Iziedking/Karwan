import assert from 'node:assert/strict';
import test from 'node:test';
import { fingerprint } from './shared/canonical.js';
import { REPLAY_POLICY } from './shared/policy.js';
import { createMemoryCreStore } from './store.js';

const policy = {
  policy: REPLAY_POLICY,
  repository: { owner: 'acme', name: 'billing', id: 1 },
  baseBranch: 'main',
  delivery: 'pull',
  items: [{ id: 'a', title: 'A', run: 'npm test', required: true }],
  partialAt: null,
  runner: { repository: 'karwan-xyz/karwan-replay', workflow: '.github/workflows/replay.yml', blobSha: 'a'.repeat(40) },
  timeoutMinutes: 10,
};
const DEAL = `0x${'d'.repeat(64)}`;
const FAMILY = `0x${'f'.repeat(40)}`;

test('a document is stored under its fingerprint and read back', async () => {
  const store = createMemoryCreStore();
  const hash = await store.putDocument('policy', policy);
  assert.equal(hash, fingerprint(policy));
  assert.deepEqual(await store.getDocument(hash), { kind: 'policy', body: policy });
  assert.equal(await store.putDocument('policy', policy), hash);
  assert.equal(await store.getDocument(`0x${'0'.repeat(64)}`), null);
});

test('a policy or reference that does not parse is refused', async () => {
  const store = createMemoryCreStore();
  await assert.rejects(store.putDocument('policy', { ...policy, items: [] }));
  await assert.rejects(store.putDocument('reference', { repository: policy.repository, pull: 1, sha: 'nope' }));
});

test('a page of pending replays depends only on the cursor, so every DON node reads the same one', async () => {
  const store = createMemoryCreStore();
  for (const n of [1, 2, 3]) {
    await store.upsertCheckItem({
      dealKey: `${DEAL}-r${n}`, kind: 'deal', family: FAMILY, dealId: DEAL, revision: n,
      deliveredBlockHash: `0x${'b'.repeat(64)}`, deliveredBlockNumber: 1, policyHash: fingerprint(policy), referenceHash: `0x${'c'.repeat(64)}`,
    }, 1_000 + n);
  }
  assert.deepEqual((await store.pendingCheckItems(2, 2_000, 0)).map((i) => i.revision), [1, 2]);
  assert.deepEqual((await store.pendingCheckItems(2, 2_000, 0)).map((i) => i.revision), [1, 2]);
  assert.deepEqual((await store.pendingCheckItems(2, 2_000, 1)).map((i) => i.revision), [2, 3]);
  assert.deepEqual((await store.pendingCheckItems(2, 2_000, 2)).map((i) => i.revision), [3, 1]);
  await store.closeCheckItem(`${DEAL}-r1`, { decision: 'PASS' }, 2_000);
  assert.deepEqual((await store.pendingCheckItems(5, 2_001, 0)).map((i) => i.revision), [2, 3]);
});

test('a replay nobody answers drops out of the index after a day', async () => {
  const store = createMemoryCreStore();
  await store.upsertCheckItem({
    dealKey: `${DEAL}-r1`, kind: 'deal', family: FAMILY, dealId: DEAL, revision: 1,
    deliveredBlockHash: null, deliveredBlockNumber: null, policyHash: fingerprint(policy), referenceHash: null,
  }, 0);
  assert.equal((await store.pendingCheckItems(5, 86_400_000 + 1, 0)).length, 0);
});

test('shadow results record agreement with Karwan\'s own checks', async () => {
  const store = createMemoryCreStore();
  await store.recordShadow({ dealKey: `${DEAL}-r1`, revision: 1, family: FAMILY, creVerdict: 'PASS', karwanVerdict: 'PASS', evidenceHash: null }, 1);
  await store.recordShadow({ dealKey: `${DEAL}-r2`, revision: 2, family: FAMILY, creVerdict: 'FAIL', karwanVerdict: 'PASS', evidenceHash: null }, 2);
  await store.recordShadow({ dealKey: `${DEAL}-r3`, revision: 3, family: FAMILY, creVerdict: 'PASS', karwanVerdict: null, evidenceHash: null }, 3);
  const summary = await store.shadowSummary();
  assert.deepEqual({ compared: summary.compared, agreed: summary.agreed }, { compared: 2, agreed: 1 });
  assert.deepEqual(summary.disagreements.map((d) => d.dealKey), [`${DEAL}-r2`]);
});

test('dry-run results and the keeper watch list round-trip', async () => {
  const store = createMemoryCreStore();
  await store.putDryRun('7f1c2a90-1b2c-4d5e-8f90-a1b2c3d4e5f6', { decision: 'PASS' }, 5);
  assert.deepEqual(await store.getDryRun('7f1c2a90-1b2c-4d5e-8f90-a1b2c3d4e5f6'), { result: { decision: 'PASS' }, at: 5 });
  await store.watch({ kind: 'agreement', family: FAMILY, id: DEAL }, 1);
  await store.watch({ kind: 'agreement', family: FAMILY, id: DEAL }, 2);
  assert.equal((await store.watched(10, 0)).length, 1);
  await store.unwatch(FAMILY, DEAL);
  assert.equal((await store.watched(10, 0)).length, 0);
});

test('a closed check keeps its outcome for later reads', async () => {
  const store = createMemoryCreStore();
  await store.upsertCheckItem({
    dealKey: `${DEAL}-r1`, kind: 'deal', family: FAMILY, dealId: DEAL, revision: 1,
    deliveredBlockHash: null, deliveredBlockNumber: null, policyHash: fingerprint(policy), referenceHash: null,
  }, 1);
  assert.equal(await store.checkOutcome(`${DEAL}-r1`), null);
  await store.closeCheckItem(`${DEAL}-r1`, { decision: 'PASS', evidenceHash: '0xabc' }, 2);
  assert.deepEqual(await store.checkOutcome(`${DEAL}-r1`), { decision: 'PASS', evidenceHash: '0xabc' });
});

test('a CRE verdict arriving after Karwan\'s keeps Karwan\'s for the comparison', async () => {
  const store = createMemoryCreStore();
  await store.recordShadow({ dealKey: 'k', revision: 1, family: FAMILY, creVerdict: 'PENDING', karwanVerdict: 'PASS', evidenceHash: null }, 1);
  await store.recordShadow({ dealKey: 'k', revision: 1, family: FAMILY, creVerdict: 'FAIL', karwanVerdict: null, evidenceHash: '0xe' }, 2);
  const summary = await store.shadowSummary();
  assert.deepEqual({ compared: summary.compared, agreed: summary.agreed }, { compared: 1, agreed: 0 });
});

test('the keeper watch list rotates with the cursor', async () => {
  const store = createMemoryCreStore();
  for (const n of [1, 2, 3, 4]) await store.watch({ kind: 'agreement', family: FAMILY, id: `0x${String(n).repeat(64)}` }, n);
  const first = (await store.watched(3, 0)).map((w) => w.id.slice(2, 3));
  const next = (await store.watched(3, 1)).map((w) => w.id.slice(2, 3));
  assert.deepEqual(first, ['1', '2', '3']);
  assert.deepEqual(next, ['2', '3', '4']);
  assert.deepEqual((await store.watched(3, 3)).map((w) => w.id.slice(2, 3)), ['4', '1', '2']);
});
