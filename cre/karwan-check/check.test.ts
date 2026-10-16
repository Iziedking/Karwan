import { describe, expect, test } from 'bun:test';
import { decodeAbiParameters, keccak256, parseAbiParameters, toBytes, type Address, type Hex } from 'viem';
import { REPLAY_POLICY, policyFingerprint, parsePolicy } from '../shared/policy.js';
import { proofFingerprint, referenceSchema } from '../shared/reference.js';
import { replayInputsHash, type RunFacts } from '../shared/verdict.js';
import { canonicalJson } from '../shared/canonical.js';
import { collectResults, runsListUrl, startDryRun, startReplay, type CheckConfig, type CheckPorts, type DeliveredLog, type PendingItem } from './check.js';

const FAMILY = '0x00000000000000000000000000000000000fa411' as Address;
const VERIFIER = '0x00000000000000000000000000000000000c4ec4' as Address;
const ADAPTER = '0x00000000000000000000000000000000000ada97' as Address;
const DEAL = keccak256(toBytes('deal'));
const BLOCK = keccak256(toBytes('block'));
const FEES = '0x00000000000000000000000000000000000fee05' as Address;
const RUN = keccak256(toBytes('agent payment run'));
const DRY_KEY = `dry-${RUN.slice(2)}`;
const NOW = 1_800_000_000;

const policy = parsePolicy({
  policy: REPLAY_POLICY,
  repository: { owner: 'acme', name: 'billing', id: 123456 },
  baseBranch: 'main',
  delivery: 'pull',
  setup: 'npm ci',
  items: [
    { id: 'i1', title: 'Export', run: 'npm test -- export', required: true },
    { id: 'i2', title: 'Rate limit', run: 'npm test -- auth', required: true },
  ],
  partialAt: 1,
  runner: { repository: 'karwan-xyz/karwan-replay', workflow: '.github/workflows/replay.yml', blobSha: 'a'.repeat(40) },
  timeoutMinutes: 20,
}, { partialAllowed: true });
const reference = referenceSchema.parse({ repository: { owner: 'acme', name: 'billing', id: 123456 }, pull: 7, sha: 'b'.repeat(40) });

const config: CheckConfig = { chainId: 5_042_002, verifiers: [VERIFIER], attest: true, adapter: ADAPTER, maxItems: 3, runnerRepo: 'karwan-xyz/karwan-replay', fees: FEES };
const INPUTS = replayInputsHash({ targetRepo: 'acme/billing', sha: 'b'.repeat(40), policyHash: policyFingerprint(policy), itemsJson: canonicalJson(policy.items), setup: 'npm ci' });

function harness(over: Partial<{
  verifier: Address;
  checkPolicy: Hex;
  partialBps: number;
  state: number;
  revision: number;
  checkPassed: boolean;
  checkFailed: boolean;
  docs: Record<string, unknown>;
  runnerBlob: string | null;
  run: RunFacts | null;
  pending: PendingItem[];
  loggedProof: Hex | null;
  pull: { headSha: string; baseRef: string } | null;
  feeState: number;
  /// What Arc shows after a write: the adapter took it, or refused it.
  writeTakes: boolean;
}> = {}) {
  const calls = { dispatched: [] as unknown[], started: [] as unknown[], written: [] as Hex[], evidence: [] as unknown[], dryResults: [] as unknown[], closed: [] as unknown[], runLookups: [] as unknown[] };
  const s = {
    verifier: VERIFIER,
    checkPolicy: policyFingerprint(policy),
    partialBps: 5000,
    state: 2,
    revision: 1,
    checkPassed: false,
    checkFailed: false,
    docs: { [policyFingerprint(policy)]: policy, [proofFingerprint(reference)]: reference } as Record<string, unknown>,
    runnerBlob: 'a'.repeat(40) as string | null,
    run: null as RunFacts | null,
    pending: [] as PendingItem[],
    loggedProof: proofFingerprint(reference) as Hex | null,
    pull: { headSha: 'b'.repeat(40), baseRef: 'main' } as { headSha: string; baseRef: string } | null,
    feeState: 1,
    writeTakes: true,
    held: { set: false, pass: false, evidenceHash: `0x${'0'.repeat(64)}` as Hex },
    ...over,
  };
  const ports: CheckPorts = {
    now: () => NOW,
    readTerms: () => ({ verifier: s.verifier, checkPolicy: s.checkPolicy, partialBps: s.partialBps }),
    readDeal: () => ({ state: s.state, revision: s.revision, checkPassed: s.checkPassed, checkFailed: s.checkFailed }),
    deliveredProof: (_f, _d, _r, hash, number) => { calls.runLookups.push({ proofAt: [hash, number] }); return s.loggedProof; },
    fetchDoc: (hash) => s.docs[hash] ?? null,
    runnerBlob: () => s.runnerBlob,
    dispatch: (args) => { calls.dispatched.push(args); return true; },
    started: (info) => { calls.started.push(info); },
    pending: (limit, cursor) => { calls.runLookups.push({ cursor }); return s.pending; },
    findRun: (runner, dealKey, sha, inputsHash) => { calls.runLookups.push({ runner, dealKey, sha, inputsHash }); return s.run; },
    pullHead: () => s.pull,
    feeRun: (fees, runId) => { calls.runLookups.push({ fees, runId }); return { state: s.feeState }; },
    closeItem: (dealKey, outcome) => { calls.closed.push({ dealKey, outcome }); },
    // The forwarder never reverts, so a write always "succeeds"; only Arc's
    // state after it says whether the adapter took the report.
    writeReport: (report) => {
      calls.written.push(report);
      if (s.writeTakes) {
        const [kind, , , , , body] = decodeAbiParameters(parseAbiParameters('uint8, uint256, address, uint64, bytes32, bytes'), report);
        if (kind === 1) {
          const [, , , , pass, evidenceHash] = decodeAbiParameters(parseAbiParameters('address, address, bytes32, uint32, bool, bytes32'), body);
          s.held = { set: true, pass, evidenceHash };
        }
        if (kind === 4) s.feeState = 2;
      }
      return { ok: true };
    },
    verdictOnChain: () => s.held,
    postEvidence: (payload) => { calls.evidence.push(payload); },
    postDryRun: (payload) => { calls.dryResults.push(payload); },
  };
  return { ports, calls };
}

const delivered: DeliveredLog = { family: FAMILY, dealId: DEAL, revision: 1, proofHash: proofFingerprint(reference), blockHash: BLOCK, blockNumber: 66_719_640 };

const completedRun = (conclusions: [string, string][] = [['item:i1', 'success'], ['item:i2', 'success']]): RunFacts => ({
  runId: 501,
  status: 'completed',
  createdAt: NOW - 300,
  headSha: 'c'.repeat(40),
  runnerBlobSha: 'a'.repeat(40),
  inputsSha: 'b'.repeat(40),
  jobs: [{ name: 'guard', conclusion: 'success' }, ...conclusions.map(([name, conclusion]) => ({ name, conclusion }))],
});

const pendingDeal = (): PendingItem => ({
  kind: 'deal',
  dealKey: `${DEAL}-r1`,
  family: FAMILY,
  dealId: DEAL,
  revision: 1,
  deliveredBlockHash: BLOCK,
  deliveredBlockNumber: 66_719_640,
  policy,
  reference,
});

describe('starting a replay (Delivered log)', () => {
  test('skips a deal whose verifier is not one of ours', () => {
    const { ports, calls } = harness({ verifier: '0x000000000000000000000000000000000000dead' });
    expect(startReplay(ports, config, delivered)).toBe('not-ours');
    expect(calls.dispatched).toHaveLength(0);
  });

  test('skips a delivery that is no longer the current one', () => {
    const { ports, calls } = harness({ revision: 2 });
    expect(startReplay(ports, config, delivered)).toBe('stale');
    expect(calls.dispatched).toHaveLength(0);
  });

  test('stops when the policy Karwan serves does not match checkPolicy on Arc', () => {
    const altered = { ...policy, items: [{ ...policy.items[0], run: 'true' }, policy.items[1]] };
    const { ports, calls } = harness({ docs: { [policyFingerprint(policy)]: altered, [proofFingerprint(reference)]: reference } });
    expect(startReplay(ports, config, delivered)).toBe('policy-mismatch');
    expect(calls.dispatched).toHaveLength(0);
  });

  test('stops when the delivery reference does not match the proof on Arc', () => {
    const other = { ...reference, sha: 'd'.repeat(40) };
    const { ports, calls } = harness({ docs: { [policyFingerprint(policy)]: policy, [proofFingerprint(reference)]: other } });
    expect(startReplay(ports, config, delivered)).toBe('reference-mismatch');
    expect(calls.dispatched).toHaveLength(0);
  });

  test('stops when a document is missing', () => {
    const { ports } = harness({ docs: {} });
    expect(startReplay(ports, config, delivered)).toBe('policy-unavailable');
  });

  test('stops when the runner is not the pinned version', () => {
    const { ports, calls } = harness({ runnerBlob: 'e'.repeat(40) });
    expect(startReplay(ports, config, delivered)).toBe('runner-not-pinned');
    expect(calls.dispatched).toHaveLength(0);
  });

  test('dispatches the agreed items on the delivered commit and tells Karwan', () => {
    const { ports, calls } = harness();
    expect(startReplay(ports, config, delivered)).toBe('dispatched');
    expect(calls.dispatched).toEqual([{
      runner: 'karwan-xyz/karwan-replay',
      targetRepo: 'acme/billing',
      sha: 'b'.repeat(40),
      dealKey: `${DEAL}-r1`,
      policyHash: policyFingerprint(policy),
      items: policy.items,
      setup: 'npm ci',
      timeoutMinutes: 20,
      inputsHash: INPUTS,
    }]);
    expect(calls.started).toEqual([{
      kind: 'deal',
      dealKey: `${DEAL}-r1`,
      family: FAMILY,
      dealId: DEAL,
      revision: 1,
      deliveredBlockHash: BLOCK,
      deliveredBlockNumber: 66_719_640,
      policyHash: policyFingerprint(policy),
      referenceHash: proofFingerprint(reference),
    }]);
  });
});

describe('collecting results', () => {
  const decodeCheck = (report: Hex) => {
    const [kind, chainId, adapter, issuedAt, , body] = decodeAbiParameters(parseAbiParameters('uint8, uint256, address, uint64, bytes32, bytes'), report);
    const [verifier, family, dealId, revision, pass, evidenceHash] = decodeAbiParameters(parseAbiParameters('address, address, bytes32, uint32, bool, bytes32'), body);
    return { kind, chainId, adapter: adapter.toLowerCase(), issuedAt, verifier: verifier.toLowerCase(), family: family.toLowerCase(), dealId, revision, pass, evidenceHash };
  };

  test('writes a pass for the delivered revision, with the evidence hash, and posts the evidence', () => {
    const { ports, calls } = harness({ pending: [pendingDeal()], run: completedRun() });
    expect(collectResults(ports, config)).toEqual([{ dealKey: `${DEAL}-r1`, outcome: 'attested', decision: 'PASS' }]);
    expect(calls.written).toHaveLength(1);
    const r = decodeCheck(calls.written[0]);
    expect(r).toMatchObject({ kind: 1, chainId: 5_042_002n, adapter: ADAPTER, issuedAt: BigInt(NOW), verifier: VERIFIER, family: FAMILY, dealId: DEAL, revision: 1, pass: true });
    expect(calls.evidence).toHaveLength(1);
    expect(calls.evidence[0]).toMatchObject({ dealKey: `${DEAL}-r1`, evidenceHash: r.evidenceHash, attested: true, decision: 'PASS' });
  });

  test('writes a fail when a required item failed', () => {
    const { ports, calls } = harness({ pending: [pendingDeal()], run: completedRun([['item:i1', 'success'], ['item:i2', 'failure']]) });
    expect(collectResults(ports, config)[0]).toMatchObject({ outcome: 'attested', decision: 'FAIL' });
    expect(decodeCheck(calls.written[0]).pass).toBe(false);
  });

  test('writes nothing while the run is still going', () => {
    const { ports, calls } = harness({ pending: [pendingDeal()], run: { ...completedRun(), status: 'in_progress' } });
    expect(collectResults(ports, config)[0]).toMatchObject({ outcome: 'waiting' });
    expect(calls.written).toHaveLength(0);
    expect(calls.evidence).toHaveLength(0);
  });

  test('writes nothing when there is no result, and closes the item with Karwan', () => {
    const { ports, calls } = harness({ pending: [pendingDeal()], run: { ...completedRun(), runnerBlobSha: 'e'.repeat(40) } });
    expect(collectResults(ports, config)[0]).toMatchObject({ outcome: 'no-result', decision: 'UNAVAILABLE' });
    expect(calls.written).toHaveLength(0);
    expect(calls.evidence[0]).toMatchObject({ attested: false, decision: 'UNAVAILABLE' });
  });

  test('drops a result whose delivery was replaced', () => {
    const { ports, calls } = harness({ pending: [pendingDeal()], run: completedRun(), revision: 2 });
    expect(collectResults(ports, config)[0]).toMatchObject({ outcome: 'stale' });
    expect(calls.written).toHaveLength(0);
  });

  test('stands down when the chain already has a result for the revision', () => {
    const { ports, calls } = harness({ pending: [pendingDeal()], run: completedRun(), checkFailed: true });
    expect(collectResults(ports, config)[0]).toMatchObject({ outcome: 'already-decided' });
    expect(calls.written).toHaveLength(0);
  });

  test('never trusts the index: a reference that differs from the logged proof is refused', () => {
    const { ports, calls } = harness({ pending: [pendingDeal()], run: completedRun(), loggedProof: keccak256(toBytes('other')) });
    expect(collectResults(ports, config)[0]).toMatchObject({ outcome: 'reference-mismatch' });
    expect(calls.written).toHaveLength(0);
  });

  test('never trusts the index: a policy that differs from checkPolicy is refused', () => {
    const { ports, calls } = harness({ pending: [pendingDeal()], run: completedRun(), checkPolicy: keccak256(toBytes('other')) });
    expect(collectResults(ports, config)[0]).toMatchObject({ outcome: 'policy-mismatch' });
    expect(calls.written).toHaveLength(0);
  });

  test('in shadow mode posts the verdict and never writes', () => {
    const { ports, calls } = harness({ pending: [pendingDeal()], run: completedRun() });
    expect(collectResults(ports, { ...config, attest: false })[0]).toMatchObject({ outcome: 'shadow', decision: 'PASS' });
    expect(calls.written).toHaveLength(0);
    expect(calls.evidence[0]).toMatchObject({ attested: false, decision: 'PASS' });
  });

  test('takes at most maxItems per run', () => {
    const { ports } = harness({ pending: [pendingDeal(), pendingDeal(), pendingDeal(), pendingDeal()], run: { ...completedRun(), status: 'in_progress' } });
    expect(collectResults(ports, { ...config, maxItems: 2 })).toHaveLength(2);
  });

  const dryItem = (): PendingItem => ({ kind: 'dry', dealKey: DRY_KEY, family: FAMILY, dealId: DEAL, revision: 0, deliveredBlockHash: null, deliveredBlockNumber: null, policy, reference });

  test('a decided dry run releases its fee through the adapter, then reports off chain', () => {
    const { ports, calls } = harness({ pending: [dryItem()], run: completedRun() });
    expect(collectResults(ports, config)[0]).toMatchObject({ outcome: 'dry-run', decision: 'PASS' });
    expect(calls.written).toHaveLength(1);
    const [kind, , adapter, , , body] = decodeAbiParameters(parseAbiParameters('uint8, uint256, address, uint64, bytes32, bytes'), calls.written[0]);
    expect(kind).toBe(4);
    expect(adapter.toLowerCase()).toBe(ADAPTER);
    const [fees, runId, resultHash] = decodeAbiParameters(parseAbiParameters('address, bytes32, bytes32'), body);
    expect([fees.toLowerCase(), runId]).toEqual([FEES, RUN]);
    expect(calls.dryResults[0]).toMatchObject({ dealKey: DRY_KEY, decision: 'PASS', evidenceHash: resultHash, released: true });
  });

  test('a dry run with no result releases nothing, so the agent can take its fee back', () => {
    const late = { ...completedRun(), status: 'in_progress' as const, createdAt: NOW - 3 * 3600 };
    const { ports, calls } = harness({ pending: [dryItem()], run: late });
    expect(collectResults(ports, config)[0]).toMatchObject({ outcome: 'dry-run', decision: 'UNAVAILABLE' });
    expect(calls.written).toHaveLength(0);
    expect(calls.dryResults[0]).toMatchObject({ released: false });
  });

  test('a dry key that is not a fee run is refused', () => {
    const { ports, calls } = harness({ pending: [{ ...dryItem(), dealKey: 'dry-7f1c2a90-1b2c-4d5e-8f90-a1b2c3d4e5f6' }], run: completedRun() });
    expect(collectResults(ports, config)[0]).toMatchObject({ outcome: 'reference-mismatch' });
    expect(calls.written).toHaveLength(0);
  });
});

describe('starting a dry run (x402, HTTP trigger)', () => {
  const request = { runId: RUN, family: FAMILY, dealId: DEAL, branchSha: 'f'.repeat(40), pull: 9 };

  test('runs the agreed policy on the branch, with a dry key', () => {
    const { ports, calls } = harness();
    expect(startDryRun(ports, config, request)).toBe('dispatched');
    expect(calls.dispatched[0]).toMatchObject({ targetRepo: 'acme/billing', sha: 'f'.repeat(40), dealKey: DRY_KEY, items: policy.items });
    expect(calls.started[0]).toMatchObject({
      kind: 'dry',
      dealKey: DRY_KEY,
      reference: { repository: policy.repository, pull: 9, sha: 'f'.repeat(40) },
    });
  });

  test('refuses a malformed request and a deal that is not ours', () => {
    const { ports } = harness();
    expect(startDryRun(ports, config, { ...request, branchSha: 'main' })).toBe('bad-request');
    const other = harness({ verifier: '0x000000000000000000000000000000000000dead' });
    expect(startDryRun(other.ports, config, request)).toBe('not-ours');
  });

  test('starts only while the fee for the run is held on Arc', () => {
    for (const feeState of [0, 2, 3]) {
      const { ports, calls } = harness({ feeState });
      expect(startDryRun(ports, config, request)).toBe('not-paid');
      expect(calls.dispatched).toHaveLength(0);
    }
    const { calls } = (() => { const h = harness(); startDryRun(h.ports, config, request); return h; })();
    expect(calls.runLookups).toContainEqual({ fees: FEES, runId: RUN });
  });

  test('refuses when the policy Karwan serves is not the one on Arc', () => {
    const { ports, calls } = harness({ docs: {} });
    expect(startDryRun(ports, config, request)).toBe('policy-unavailable');
    expect(calls.dispatched).toHaveLength(0);
  });
});

describe('review fixes: the agreed repository, the agreed inputs, a stable index', () => {
  test('a delivery naming another repository is refused, even with the agreed repository id', () => {
    const forged = { ...reference, repository: { owner: 'seller', name: 'fake', id: 123456 } };
    const { ports, calls } = harness({ docs: { [policyFingerprint(policy)]: policy, [proofFingerprint(forged)]: forged } });
    expect(startReplay(ports, config, { ...delivered, proofHash: proofFingerprint(forged) })).toBe('reference-mismatch');
    expect(calls.dispatched).toHaveLength(0);
  });

  test('a pull request whose head is not the delivered commit on the agreed branch is refused', () => {
    expect(startReplay(harness({ pull: { headSha: 'f'.repeat(40), baseRef: 'main' } }).ports, config, delivered)).toBe('reference-mismatch');
    expect(startReplay(harness({ pull: { headSha: 'b'.repeat(40), baseRef: 'dev' } }).ports, config, delivered)).toBe('reference-mismatch');
    expect(startReplay(harness({ pull: null }).ports, config, delivered)).toBe('reference-unavailable');
  });

  test('a policy naming another runner repository is refused', () => {
    const { ports } = harness();
    expect(startReplay(ports, { ...config, runnerRepo: 'other/runner' }, delivered)).toBe('runner-not-pinned');
  });

  test('the run is looked up by the deal key Arc implies and the agreed inputs hash, never the index key', () => {
    const { ports, calls } = harness({ pending: [{ ...pendingDeal(), dealKey: 'dry-7f1c2a90-1b2c-4d5e-8f90-a1b2c3d4e5f6' }], run: completedRun() });
    collectResults(ports, config);
    expect(calls.runLookups).toContainEqual({ runner: 'karwan-xyz/karwan-replay', dealKey: `${DEAL}-r1`, sha: 'b'.repeat(40), inputsHash: INPUTS });
  });

  test('the index is read with a cursor from DON time, so every node reads the same page', () => {
    const { ports, calls } = harness({ pending: [] });
    collectResults(ports, config);
    expect(calls.runLookups[0]).toEqual({ cursor: Math.floor(NOW / 60) });
  });

  test('items that will never be checked are closed instead of left to repeat', () => {
    const stale = harness({ pending: [pendingDeal()], revision: 2 });
    collectResults(stale.ports, config);
    expect(stale.calls.closed).toEqual([{ dealKey: `${DEAL}-r1`, outcome: 'stale' }]);
    const decided = harness({ pending: [pendingDeal()], checkPassed: true });
    collectResults(decided.ports, config);
    expect(decided.calls.closed).toEqual([{ dealKey: `${DEAL}-r1`, outcome: 'already-decided' }]);
  });
});

describe('finding the run', () => {
  test('asks GitHub for up to 100 runs from the last seven days, not the latest 30', () => {
    const url = new URL(runsListUrl('karwan-xyz/karwan-replay', 1_800_000_000));
    expect(url.pathname).toBe('/repos/karwan-xyz/karwan-replay/actions/workflows/replay.yml/runs');
    expect(url.searchParams.get('event')).toBe('workflow_dispatch');
    expect(url.searchParams.get('per_page')).toBe('100');
    expect(url.searchParams.get('created')).toBe(`>=${new Date((1_800_000_000 - 7 * 86_400) * 1000).toISOString().slice(0, 19)}Z`);
  });
});

describe('finding the delivery log', () => {
  test('looks the Delivered log up by its block number and checks the block hash', () => {
    const { ports, calls } = harness({ pending: [pendingDeal()], run: completedRun() });
    collectResults(ports, config);
    expect(calls.runLookups).toContainEqual({ proofAt: [BLOCK, 66_719_640] });
  });

  test('an item without its block number has no proof, so no result', () => {
    const { ports, calls } = harness({ pending: [{ ...pendingDeal(), deliveredBlockNumber: null }], run: completedRun() });
    expect(collectResults(ports, config)[0]).toMatchObject({ outcome: 'reference-mismatch' });
    expect(calls.written).toHaveLength(0);
  });
});

describe('a write counts only when Arc shows it', () => {
  test('a check result the adapter refused is a failed write, not attested', () => {
    const { ports, calls } = harness({ pending: [pendingDeal()], run: completedRun(), writeTakes: false });
    expect(collectResults(ports, config)[0]).toMatchObject({ outcome: 'write-failed', decision: 'PASS' });
    expect(calls.written).toHaveLength(1);
  });

  test('a dry-run answer the adapter refused releases nothing', () => {
    const dry: PendingItem = { kind: 'dry', dealKey: DRY_KEY, family: FAMILY, dealId: DEAL, revision: 0, deliveredBlockHash: null, deliveredBlockNumber: null, policy, reference };
    const { ports, calls } = harness({ pending: [dry], run: completedRun(), writeTakes: false });
    collectResults(ports, config);
    expect(calls.dryResults[0]).toMatchObject({ released: false });
  });
});
