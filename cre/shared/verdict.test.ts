import { describe, expect, test } from 'bun:test';
import { REPLAY_POLICY, parsePolicy } from './policy.js';
import { referenceSchema } from './reference.js';
import { replayInputsHash, replayVerdict, type RunFacts } from './verdict.js';
import { EVIDENCE_VERSION, buildEvidence } from './evidence.js';

const policy = parsePolicy({
  policy: REPLAY_POLICY,
  repository: { owner: 'acme', name: 'billing', id: 123456 },
  baseBranch: 'main',
  delivery: 'pull',
  items: [
    { id: 'i1', title: 'Export', run: 'npm test -- export', required: true },
    { id: 'i2', title: 'Rate limit', run: 'npm test -- auth', required: true },
    { id: 'i3', title: 'Docs build', run: 'npm run docs', required: false },
  ],
  partialAt: 1,
  runner: { repository: 'karwan-xyz/karwan-replay', workflow: '.github/workflows/replay.yml', blobSha: 'a'.repeat(40) },
  timeoutMinutes: 20,
}, { partialAllowed: true });

const reference = referenceSchema.parse({ repository: { owner: 'acme', name: 'billing', id: 123456 }, pull: 7, sha: 'b'.repeat(40) });
const NOW = 1_800_000_000;

const run = (over: Partial<RunFacts> = {}): RunFacts => ({
  runId: 99,
  status: 'completed',
  createdAt: NOW - 600,
  headSha: 'c'.repeat(40),
  runnerBlobSha: 'a'.repeat(40),
  inputsSha: 'b'.repeat(40),
  jobs: [
    { name: 'guard', conclusion: 'success' },
    { name: 'item:i1', conclusion: 'success' },
    { name: 'item:i2', conclusion: 'success' },
    { name: 'item:i3', conclusion: 'success' },
  ],
  ...over,
});

describe('replay verdict', () => {
  test('no run is no result', () => {
    expect(replayVerdict(policy, reference, null, NOW)).toMatchObject({ decision: 'UNAVAILABLE', reason: 'RUN_MISSING' });
  });

  test('a run still going is pending, then timed out after the agreed minutes', () => {
    expect(replayVerdict(policy, reference, run({ status: 'in_progress' }), NOW)).toMatchObject({ decision: 'UNAVAILABLE', reason: 'RUN_PENDING' });
    const old = run({ status: 'in_progress', createdAt: NOW - 20 * 60 - 1 });
    expect(replayVerdict(policy, reference, old, NOW)).toMatchObject({ decision: 'UNAVAILABLE', reason: 'RUN_TIMED_OUT' });
  });

  test('a runner other than the pinned one gives no result', () => {
    expect(replayVerdict(policy, reference, run({ runnerBlobSha: 'd'.repeat(40) }), NOW)).toMatchObject({ decision: 'UNAVAILABLE', reason: 'RUNNER_NOT_PINNED' });
  });

  test('a delivery from another repository fails, even one claiming the agreed id', () => {
    const other = referenceSchema.parse({ ...reference, repository: { owner: 'acme', name: 'other', id: 1 } });
    expect(replayVerdict(policy, other, run(), NOW)).toMatchObject({ decision: 'FAIL', reason: 'REPOSITORY_MISMATCH' });
    const sameId = referenceSchema.parse({ ...reference, repository: { owner: 'seller', name: 'fake', id: 123456 } });
    expect(replayVerdict(policy, sameId, run(), NOW)).toMatchObject({ decision: 'FAIL', reason: 'REPOSITORY_MISMATCH' });
    const casing = referenceSchema.parse({ ...reference, repository: { owner: 'ACME', name: 'Billing', id: 123456 } });
    expect(replayVerdict(policy, casing, run(), NOW).reason).not.toBe('REPOSITORY_MISMATCH');
  });

  test('a run whose guard did not confirm the agreed inputs gives no result, never a pass', () => {
    const failedGuard = run({ jobs: [{ name: 'guard', conclusion: 'failure' }, ...run().jobs.slice(1)] });
    expect(replayVerdict(policy, reference, failedGuard, NOW)).toMatchObject({ decision: 'UNAVAILABLE', reason: 'RUN_INPUTS_UNCONFIRMED' });
    const noGuard = run({ jobs: run().jobs.slice(1) });
    expect(replayVerdict(policy, reference, noGuard, NOW)).toMatchObject({ decision: 'UNAVAILABLE', reason: 'RUN_INPUTS_UNCONFIRMED' });
  });

  test('the inputs hash is sha256 of the five inputs, one per line, as the runner computes it', () => {
    // what `printf '%s\n%s\n%s\n%s\n%s' a/b c 0xd '[]' '' | sha256sum` prints
    expect(replayInputsHash({ targetRepo: 'a/b', sha: 'c', policyHash: '0xd', itemsJson: '[]', setup: '' }))
      .toBe(new Bun.CryptoHasher('sha256').update('a/b\nc\n0xd\n[]\n').digest('hex'));
  });

  test('a run on another commit fails', () => {
    expect(replayVerdict(policy, reference, run({ inputsSha: 'e'.repeat(40) }), NOW)).toMatchObject({ decision: 'FAIL', reason: 'SHA_MISMATCH' });
  });

  test('a required item that did not succeed fails, and the items say which', () => {
    const v = replayVerdict(policy, reference, run({ jobs: [{ name: 'guard', conclusion: 'success' }, { name: 'item:i1', conclusion: 'success' }, { name: 'item:i2', conclusion: 'failure' }] }), NOW);
    expect(v).toMatchObject({ decision: 'FAIL', reason: 'ITEM_FAILED', passed: 1, required: 2 });
    expect(v.items).toEqual([{ id: 'i1', passed: true }, { id: 'i2', passed: false }, { id: 'i3', passed: false }]);
  });

  test('an optional item failing does not fail the delivery', () => {
    const jobs = [{ name: 'guard', conclusion: 'success' }, { name: 'item:i1', conclusion: 'success' }, { name: 'item:i2', conclusion: 'success' }, { name: 'item:i3', conclusion: 'failure' }];
    expect(replayVerdict(policy, reference, run({ jobs }), NOW)).toMatchObject({ decision: 'PASS', reason: 'ALL_REQUIRED_PASSED', passed: 2, required: 2 });
  });

  test('every required item succeeding passes', () => {
    expect(replayVerdict(policy, reference, run(), NOW)).toMatchObject({ decision: 'PASS', passed: 2, required: 2 });
  });
});

describe('evidence document', () => {
  test('its hash does not depend on job order', () => {
    const a = buildEvidence(policy, reference, run(), replayVerdict(policy, reference, run(), NOW));
    const reversed = run({ jobs: [...run().jobs].reverse() });
    const b = buildEvidence(policy, reference, reversed, replayVerdict(policy, reference, reversed, NOW));
    expect(a.evidenceHash).toBe(b.evidenceHash);
    expect(a.doc.version).toBe(EVIDENCE_VERSION);
  });

  test('a different outcome is a different hash', () => {
    const pass = buildEvidence(policy, reference, run(), replayVerdict(policy, reference, run(), NOW));
    const failing = run({ jobs: [{ name: 'item:i1', conclusion: 'failure' }] });
    const fail = buildEvidence(policy, reference, failing, replayVerdict(policy, reference, failing, NOW));
    expect(pass.evidenceHash).not.toBe(fail.evidenceHash);
  });

  test('holds results and pins only, no commands or raw API data', () => {
    const { doc } = buildEvidence(policy, reference, run(), replayVerdict(policy, reference, run(), NOW));
    expect(JSON.stringify(doc)).not.toContain('npm test');
    expect(Object.keys(doc).sort()).toEqual(['decision', 'items', 'passed', 'policyHash', 'reason', 'referenceHash', 'required', 'run', 'version']);
  });
});
