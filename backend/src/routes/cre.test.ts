import assert from 'node:assert/strict';
import test from 'node:test';
import { fingerprint } from '../cre/shared/canonical.js';
import { REPLAY_POLICY } from '../cre/shared/policy.js';
import { EVIDENCE_VERSION } from '../cre/shared/evidence.js';
import { createMemoryCreStore } from '../cre/store.js';
import { toBytes, toHex } from 'viem';
import { canonicalJson } from '../cre/shared/canonical.js';
import { createCreRoutes, type CreRouteDeps } from './cre.js';

const TOKEN = 'workflow-token-0123456789';
const DEAL = `0x${'d'.repeat(64)}`;
const FAMILY = `0x${'f'.repeat(40)}`;
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
const reference = { repository: policy.repository, pull: 3, sha: 'b'.repeat(40) };
const evidenceDoc = {
  version: EVIDENCE_VERSION,
  policyHash: fingerprint(policy),
  referenceHash: fingerprint(reference),
  run: { id: 1, headSha: 'c'.repeat(40), runnerBlobSha: 'a'.repeat(40) },
  items: [{ id: 'a', passed: true }],
  passed: 1,
  required: 1,
  decision: 'PASS',
  reason: 'ALL_REQUIRED_PASSED',
};

function setup(over: Partial<CreRouteDeps> = {}) {
  const store = createMemoryCreStore();
  const notified: unknown[] = [];
  const deps: CreRouteDeps = {
    store,
    token: TOKEN,
    now: () => 10_000,
    checkApprovedOnChain: async () => true,
    verifyReport: async (r) => ({ ok: true, simulated: false, workflowId: (r.rawReport === 'risk' ? '0xbb' : '0xaa'), body: r.context as `0x${string}` }),
    workflows: { check: ['0xaa'], risk: ['0xbb'] },
    notify: async (alerts) => {
      notified.push(...alerts);
    },
    ...over,
  };
  const app = createCreRoutes(deps);
  const call = (path: string, init: { method?: string; body?: unknown; auth?: string | null } = {}) =>
    app.request(path, {
      method: init.method ?? 'GET',
      headers: {
        'content-type': 'application/json',
        ...(init.auth === null ? {} : { authorization: `Bearer ${init.auth ?? TOKEN}` }),
      },
      ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
    });
  return { store, call, notified };
}

test('every route needs the workflow token, and says no-store', async () => {
  const { call } = setup();
  for (const [path, method] of [['/doc/0x00', 'GET'], ['/check/pending', 'GET'], ['/risk/open-deals', 'GET'], ['/check/started', 'POST'], ['/check/evidence', 'POST']] as const) {
    assert.equal((await call(path, { method, auth: null })).status, 401, path);
    assert.equal((await call(path, { method, auth: 'wrong-token-0123456789' })).status, 401, path);
  }
  const ok = await call('/check/pending');
  assert.equal(ok.headers.get('cache-control'), 'no-store');
});

test('no token configured means the bridge is off', async () => {
  const { call } = setup({ token: undefined });
  assert.equal((await call('/check/pending')).status, 503);
});

test('documents are served by fingerprint only', async () => {
  const { store, call } = setup();
  const hash = await store.putDocument('policy', policy);
  const res = await call(`/doc/${hash}`);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { kind: 'policy', body: policy });
  assert.equal((await call(`/doc/0x${'0'.repeat(64)}`)).status, 404);
});

test('a started replay enters the index and is served with its documents inline', async () => {
  const { store, call } = setup();
  const policyHash = await store.putDocument('policy', policy);
  const referenceHash = await store.putDocument('reference', reference);
  const started = await call('/check/started', {
    method: 'POST',
    body: { kind: 'deal', dealKey: `${DEAL}-r1`, family: FAMILY, dealId: DEAL, revision: 1, deliveredBlockHash: `0x${'e'.repeat(64)}`, deliveredBlockNumber: 66_719_640, policyHash, referenceHash },
  });
  assert.equal(started.status, 200);
  const pending = (await (await call('/check/pending?limit=9')).json()) as { items: { dealKey: string; deliveredBlockNumber: number | null; policy: unknown; reference: unknown }[] };
  assert.equal(pending.items.length, 1);
  assert.equal(pending.items[0]!.deliveredBlockNumber, 66_719_640);
  assert.deepEqual(pending.items[0]!.policy, policy);
  assert.deepEqual(pending.items[0]!.reference, reference);
});

test('a dry run registers its branch reference as a document', async () => {
  const { store, call } = setup();
  const policyHash = await store.putDocument('policy', policy);
  await call('/check/started', {
    method: 'POST',
    body: { kind: 'dry', dealKey: `dry-${'7'.repeat(64)}`, family: FAMILY, dealId: DEAL, revision: 0, deliveredBlockHash: null, policyHash, reference },
  });
  const pending = (await (await call('/check/pending')).json()) as { items: { reference: unknown }[] };
  assert.deepEqual(pending.items[0]!.reference, reference);
});

test('evidence is accepted only when it matches its hash, and an attested result only when Arc shows it', async () => {
  const evidenceHash = fingerprint(evidenceDoc);
  const base = { dealKey: `${DEAL}-r1`, family: FAMILY, dealId: DEAL, revision: 1, decision: 'PASS', reason: 'ALL_REQUIRED_PASSED', doc: evidenceDoc, evidenceHash };
  const ok = setup();
  assert.equal((await ok.call('/check/evidence', { method: 'POST', body: { ...base, attested: true } })).status, 200);
  assert.equal((await ok.store.getDocument(evidenceHash))?.kind, 'evidence');

  const mismatch = setup();
  assert.equal((await mismatch.call('/check/evidence', { method: 'POST', body: { ...base, evidenceHash: `0x${'1'.repeat(64)}`, attested: true } })).status, 400);

  const notOnChain = setup({ checkApprovedOnChain: async () => false });
  assert.equal((await notOnChain.call('/check/evidence', { method: 'POST', body: { ...base, attested: true } })).status, 409);
});

test('shadow evidence is stored for comparison and never needs Arc', async () => {
  const evidenceHash = fingerprint(evidenceDoc);
  const s = setup({ checkApprovedOnChain: async () => { throw new Error('must not read Arc'); } });
  const res = await s.call('/check/evidence', {
    method: 'POST',
    body: { dealKey: `${DEAL}-r1`, family: FAMILY, dealId: DEAL, revision: 1, decision: 'PASS', reason: 'ALL_REQUIRED_PASSED', doc: evidenceDoc, evidenceHash, attested: false },
  });
  assert.equal(res.status, 200);
});

const signed = (rawReport: string, body: unknown) => ({ rawReport, context: toHex(toBytes(canonicalJson(body))), signatures: [] as string[] });

test('alerts are acted on only when the risk workflow signed exactly those alerts, once', async () => {
  const alert = { kind: 'deadline_near_no_delivery', family: FAMILY, dealId: DEAL };
  const good = setup();
  assert.equal((await good.call('/risk/alerts', { method: 'POST', body: { alerts: [alert], report: signed('risk', { alerts: [alert] }) } })).status, 200);
  assert.deepEqual(good.notified, [alert]);
  assert.equal((await good.call('/risk/alerts', { method: 'POST', body: { alerts: [alert], report: signed('risk', { alerts: [alert] }) } })).status, 409);

  const swapped = setup();
  const other = { ...alert, kind: 'ruling_due' };
  assert.equal((await swapped.call('/risk/alerts', { method: 'POST', body: { alerts: [other], report: signed('risk', { alerts: [alert] }) } })).status, 400);
  const wrongWorkflow = setup();
  assert.equal((await wrongWorkflow.call('/risk/alerts', { method: 'POST', body: { alerts: [alert], report: signed('check', { alerts: [alert] }) } })).status, 401);
  assert.deepEqual([...swapped.notified, ...wrongWorkflow.notified], []);
});

test('a dry-run result is stored under its fee run only when the check workflow signed exactly that result', async () => {
  const runId = `0x${'7'.repeat(64)}`;
  const payload = { dealKey: `dry-${runId.slice(2)}`, decision: 'PASS' };
  const good = setup();
  assert.equal((await good.call('/dry-run/result', { method: 'POST', body: { payload, report: signed('check', payload) } })).status, 200);
  assert.deepEqual(((await good.store.getDryRun(runId))?.result as { payload: unknown }).payload, payload);
  const old = { dealKey: 'dry-7f1c2a90-1b2c-4d5e-8f90-a1b2c3d4e5f6', decision: 'PASS' };
  assert.equal((await good.call('/dry-run/result', { method: 'POST', body: { payload: old, report: signed('check', old) } })).status, 400);
  const forged = setup();
  assert.equal((await forged.call('/dry-run/result', { method: 'POST', body: { payload: { ...payload, decision: 'FAIL' }, report: signed('check', payload) } })).status, 400);
  const bad = setup({ verifyReport: async () => ({ ok: false, reason: 'INSUFFICIENT_SIGNATURES' }) });
  assert.equal((await bad.call('/dry-run/result', { method: 'POST', body: { payload, report: signed('check', payload) } })).status, 401);
});

test('a pending page follows the cursor, and dropped items can be closed', async () => {
  const { store, call } = setup();
  const policyHash = await store.putDocument('policy', policy);
  const referenceHash = await store.putDocument('reference', reference);
  for (const n of [1, 2]) {
    await call('/check/started', { method: 'POST', body: { kind: 'deal', dealKey: `${DEAL}-r${n}`, family: FAMILY, dealId: DEAL, revision: n, deliveredBlockHash: null, policyHash, referenceHash } });
  }
  const page = (await (await call('/check/pending?limit=1&cursor=1')).json()) as { items: { dealKey: string }[] };
  assert.equal(page.items[0]!.dealKey, `${DEAL}-r2`);
  assert.equal((await call('/check/close', { method: 'POST', body: { dealKey: `${DEAL}-r2`, outcome: 'stale' } })).status, 200);
  assert.equal(((await (await call('/check/pending?limit=5&cursor=0')).json()) as { items: unknown[] }).items.length, 1);
});

test('the keeper sees the watch list, at most three deals a page', async () => {
  const { store, call } = setup();
  for (const n of [1, 2, 3, 4]) await store.watch({ kind: 'agreement', family: FAMILY, id: `0x${String(n).repeat(64)}` }, n);
  const res = (await (await call('/risk/open-deals?limit=9')).json()) as { items: unknown[] };
  assert.equal(res.items.length, 3);
});
