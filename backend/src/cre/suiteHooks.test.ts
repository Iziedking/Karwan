import assert from 'node:assert/strict';
import test from 'node:test';
import { fingerprint } from './shared/canonical.js';
import { REPLAY_POLICY } from './shared/policy.js';
import { createMemoryCreStore } from './store.js';
import { prepareCheckedDeal } from './suiteHooks.js';

const policy = {
  policy: REPLAY_POLICY,
  repository: { owner: 'acme', name: 'billing', id: 1 },
  baseBranch: 'main',
  delivery: 'pull',
  items: [{ id: 'a', title: 'A', run: 'npm test', required: true }, { id: 'b', title: 'B', run: 'npm test -- b', required: true }],
  partialAt: 1,
  runner: { repository: 'karwan-xyz/karwan-replay', workflow: '.github/workflows/replay.yml', blobSha: 'a'.repeat(40) },
  timeoutMinutes: 10,
};
const verifiers = { verifierK: '0x000000000000000000000000000000000000000a', verifierCK: '0x000000000000000000000000000000000000000b' };

test('a checked deal gets the policy fingerprint as checkPolicy and the verifier the switch picks', async () => {
  const store = createMemoryCreStore();
  const off = await prepareCheckedDeal(store, { creEnabled: false, ...verifiers }, policy, { partialBps: 5000 });
  assert.deepEqual(off, { checkPolicy: fingerprint(policy), verifier: verifiers.verifierK, reviewStarts: 2 });
  assert.equal((await store.getDocument(off.checkPolicy))?.kind, 'policy');
  const on = await prepareCheckedDeal(store, { creEnabled: true, ...verifiers }, policy, { partialBps: 5000 });
  assert.equal(on.verifier, verifiers.verifierCK);
});

test('a partial line without a partial share in the terms is refused, and so is a missing verifier', async () => {
  const store = createMemoryCreStore();
  await assert.rejects(prepareCheckedDeal(store, { creEnabled: false, ...verifiers }, policy, { partialBps: 0 }), /POLICY_PARTIAL_LINE/);
  await assert.rejects(prepareCheckedDeal(store, { creEnabled: true, verifierK: verifiers.verifierK }, policy, { partialBps: 5000 }), /CRE_VERIFIER_UNSET/);
});
