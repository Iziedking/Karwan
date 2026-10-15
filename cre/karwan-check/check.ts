import type { Address, Hex } from 'viem';
import { CHECK, DRY, checkBody, dryBody, encodeEnvelope } from '../shared/adapterReport.js';
import { buildEvidence, type EvidenceDocument } from '../shared/evidence.js';
import { parsePolicy, policyFingerprint, type AcceptancePolicy } from '../shared/policy.js';
import { proofFingerprint, referenceSchema, type DeliveryReference } from '../shared/reference.js';
import { replayInputsHash, replayVerdict, type ReplayDecision, type RunFacts } from '../shared/verdict.js';
import { canonicalJson } from '../shared/canonical.js';
import { AGREEMENT_ACCEPTED } from '../shared/suiteAbi.js';

export interface CheckConfig {
  chainId: number;
  /// Verifiers whose deals this workflow checks: V-CRE|K when attesting,
  /// plus V-K in shadow mode.
  verifiers: Address[];
  /// False while CRE_ENABLED is off: verdicts go to Karwan for comparison only.
  attest: boolean;
  adapter: Address;
  maxItems: number;
  /// The one replay runner repository this workflow trusts.
  runnerRepo: string;
  /// KarwanCreFees: holds what an agent paid for a dry run until it is answered.
  fees: Address;
}

export interface DeliveredLog {
  family: Address;
  dealId: Hex;
  revision: number;
  proofHash: Hex;
  blockHash: Hex;
}

export interface PendingItem {
  kind: 'deal' | 'dry';
  dealKey: string;
  family: Address;
  dealId: Hex;
  revision: number;
  deliveredBlockHash: Hex | null;
  policy: unknown;
  reference: unknown;
}

export interface DispatchArgs {
  runner: string;
  targetRepo: string;
  sha: string;
  dealKey: string;
  policyHash: Hex;
  items: AcceptancePolicy['items'];
  setup?: string;
  timeoutMinutes: number;
  inputsHash: string;
}

/// Everything the rules need from the outside. The workflow implements these
/// with CRE capabilities (ports.ts); every value Karwan supplies is checked
/// against Arc before it is used.
export interface CheckPorts {
  now(): number;
  readTerms(family: Address, dealId: Hex): { verifier: Address; checkPolicy: Hex; partialBps: number };
  readDeal(family: Address, dealId: Hex): { state: number; revision: number; checkPassed: boolean; checkFailed: boolean };
  /// proofHash of the Delivered log for this revision, found by block hash.
  deliveredProof(family: Address, dealId: Hex, revision: number, blockHash: Hex): Hex | null;
  fetchDoc(hash: Hex): unknown | null;
  runnerBlob(runnerRepo: string): string | null;
  dispatch(args: DispatchArgs): boolean;
  started(info: Record<string, unknown>): void;
  /// A page of the index that depends only on the cursor, so every node reads the same one.
  pending(limit: number, cursor: number): PendingItem[];
  closeItem(dealKey: string, outcome: string): void;
  /// Head commit and base branch of a pull request in the agreed repository.
  pullHead(repo: string, pull: number): { headSha: string; baseRef: string } | null;
  /// The fee run on Arc: 1 while the payment is held, unanswered and not refunded.
  feeRun(fees: Address, runId: Hex): { state: number };
  findRun(runnerRepo: string, dealKey: string, sha: string, inputsHash: string): RunFacts | null;
  writeReport(report: Hex): { ok: boolean };
  postEvidence(payload: Record<string, unknown>): void;
  postDryRun(payload: Record<string, unknown>): void;
}

export type StartOutcome =
  | 'not-ours'
  | 'stale'
  | 'policy-unavailable'
  | 'policy-mismatch'
  | 'reference-unavailable'
  | 'reference-mismatch'
  | 'runner-not-pinned'
  | 'dispatch-failed'
  | 'not-paid'
  | 'dispatched';

const sameAddress = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const repoName = (p: AcceptancePolicy) => `${p.repository.owner}/${p.repository.name}`;
const sameRepository = (r: DeliveryReference, p: AcceptancePolicy) =>
  r.repository.id === p.repository.id && r.repository.owner.toLowerCase() === p.repository.owner.toLowerCase()
  && r.repository.name.toLowerCase() === p.repository.name.toLowerCase();

function inputsHashFor(policy: AcceptancePolicy, policyHash: Hex, sha: string): string {
  return replayInputsHash({ targetRepo: repoName(policy), sha, policyHash, itemsJson: canonicalJson(policy.items), setup: policy.setup ?? '' });
}

/// The delivered commit must be in the agreed repository, and for a pull
/// request GitHub must show it as the head of a pull into the agreed branch.
function deliveryProblem(ports: CheckPorts, policy: AcceptancePolicy, reference: DeliveryReference): 'reference-mismatch' | 'reference-unavailable' | null {
  if (!sameRepository(reference, policy)) return 'reference-mismatch';
  if (policy.delivery !== 'pull') return null;
  const head = ports.pullHead(repoName(policy), reference.pull);
  if (!head) return 'reference-unavailable';
  return head.headSha === reference.sha && head.baseRef === policy.baseBranch ? null : 'reference-mismatch';
}

function loadPolicy(raw: unknown, expected: Hex, partialAllowed: boolean): AcceptancePolicy | null {
  try {
    const p = parsePolicy(raw, { partialAllowed });
    return policyFingerprint(p) === expected ? p : null;
  } catch {
    return null;
  }
}

function loadReference(raw: unknown, expected: Hex): DeliveryReference | null {
  try {
    const r = referenceSchema.parse(raw);
    return proofFingerprint(r) === expected ? r : null;
  } catch {
    return null;
  }
}

/// On a Delivered log: start the agreed replay, only when the policy and the
/// delivery Karwan serves are the ones fingerprinted on Arc.
export function startReplay(ports: CheckPorts, config: CheckConfig, log: DeliveredLog): StartOutcome {
  const terms = ports.readTerms(log.family, log.dealId);
  if (!config.verifiers.some((v) => sameAddress(v, terms.verifier))) return 'not-ours';
  const deal = ports.readDeal(log.family, log.dealId);
  if (deal.state !== AGREEMENT_ACCEPTED || deal.revision !== log.revision) return 'stale';

  const rawPolicy = ports.fetchDoc(terms.checkPolicy);
  if (rawPolicy === null) return 'policy-unavailable';
  const policy = loadPolicy(rawPolicy, terms.checkPolicy, terms.partialBps > 0);
  if (!policy) return 'policy-mismatch';
  const rawReference = ports.fetchDoc(log.proofHash);
  if (rawReference === null) return 'reference-unavailable';
  const reference = loadReference(rawReference, log.proofHash);
  if (!reference) return 'reference-mismatch';
  const problem = deliveryProblem(ports, policy, reference);
  if (problem) return problem;
  if (policy.runner.repository !== config.runnerRepo) return 'runner-not-pinned';
  if (ports.runnerBlob(policy.runner.repository) !== policy.runner.blobSha) return 'runner-not-pinned';

  const dealKey = `${log.dealId}-r${log.revision}`;
  const sent = ports.dispatch({
    runner: policy.runner.repository,
    targetRepo: repoName(policy),
    sha: reference.sha,
    dealKey,
    policyHash: terms.checkPolicy,
    items: policy.items,
    setup: policy.setup,
    timeoutMinutes: policy.timeoutMinutes,
    inputsHash: inputsHashFor(policy, terms.checkPolicy, reference.sha),
  });
  if (!sent) return 'dispatch-failed';
  ports.started({
    kind: 'deal',
    dealKey,
    family: log.family,
    dealId: log.dealId,
    revision: log.revision,
    deliveredBlockHash: log.blockHash,
    policyHash: terms.checkPolicy,
    referenceHash: log.proofHash,
  });
  return 'dispatched';
}

export interface DryRunRequest {
  /// The fee run: keccak(payer, payment nonce) in KarwanCreFees.
  runId: Hex;
  family: Address;
  dealId: Hex;
  branchSha: string;
  pull?: number;
}

const FEE_OPEN = 1;
const SHA = /^[0-9a-f]{40}$/;
const HEX32 = /^0x[0-9a-fA-F]{64}$/;
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

/// A party's agent paid to try a branch against the agreed policy before
/// delivering. Same pins as a real check. The result itself stays off Arc;
/// only the fee it paid is released there, by a signed answer.
export function startDryRun(ports: CheckPorts, config: CheckConfig, req: DryRunRequest): StartOutcome | 'bad-request' {
  if (!HEX32.test(req.runId) || !SHA.test(req.branchSha) || !HEX32.test(req.dealId) || !ADDRESS.test(req.family)) {
    return 'bad-request';
  }
  if (req.pull !== undefined && (!Number.isInteger(req.pull) || req.pull <= 0)) return 'bad-request';
  const terms = ports.readTerms(req.family, req.dealId);
  if (!config.verifiers.some((v) => sameAddress(v, terms.verifier))) return 'not-ours';
  const rawPolicy = ports.fetchDoc(terms.checkPolicy);
  if (rawPolicy === null) return 'policy-unavailable';
  const policy = loadPolicy(rawPolicy, terms.checkPolicy, terms.partialBps > 0);
  if (!policy) return 'policy-mismatch';
  if (policy.runner.repository !== config.runnerRepo) return 'runner-not-pinned';
  if (ports.runnerBlob(policy.runner.repository) !== policy.runner.blobSha) return 'runner-not-pinned';
  if (ports.feeRun(config.fees, req.runId).state !== FEE_OPEN) return 'not-paid';

  const dealKey = `dry-${req.runId.slice(2).toLowerCase()}`;
  const sent = ports.dispatch({
    runner: policy.runner.repository,
    targetRepo: repoName(policy),
    sha: req.branchSha,
    dealKey,
    policyHash: terms.checkPolicy,
    items: policy.items,
    setup: policy.setup,
    timeoutMinutes: policy.timeoutMinutes,
    inputsHash: inputsHashFor(policy, terms.checkPolicy, req.branchSha),
  });
  if (!sent) return 'dispatch-failed';
  ports.started({
    kind: 'dry',
    dealKey,
    family: req.family,
    dealId: req.dealId,
    revision: 0,
    deliveredBlockHash: null,
    policyHash: terms.checkPolicy,
    reference: { repository: policy.repository, pull: req.pull ?? 1, sha: req.branchSha },
  });
  return 'dispatched';
}

export interface CollectOutcome {
  dealKey: string;
  outcome:
    | 'waiting'
    | 'stale'
    | 'already-decided'
    | 'not-ours'
    | 'policy-mismatch'
    | 'reference-mismatch'
    | 'attested'
    | 'write-failed'
    | 'shadow'
    | 'no-result'
    | 'dry-run';
  decision?: ReplayDecision;
}

/// On the schedule: read finished replays and report pass or fail, or nothing.
/// Karwan's index only says where to look; each item is re-checked on Arc.
export function collectResults(ports: CheckPorts, config: CheckConfig): CollectOutcome[] {
  const cursor = Math.floor(ports.now() / 60);
  return ports.pending(config.maxItems, cursor).slice(0, config.maxItems).map((item) => {
    const result = collectOne(ports, config, item);
    if (CLOSE_ON.has(result.outcome)) ports.closeItem(item.dealKey, result.outcome);
    return result;
  });
}

/// Outcomes that will not change on a later run, so the item leaves the index.
const CLOSE_ON = new Set<CollectOutcome['outcome']>(['stale', 'already-decided', 'not-ours', 'policy-mismatch', 'reference-mismatch']);
const DRY_KEY = /^dry-[0-9a-f]{64}$/;

function collectOne(ports: CheckPorts, config: CheckConfig, item: PendingItem): CollectOutcome {
  const out = (outcome: CollectOutcome['outcome'], decision?: ReplayDecision): CollectOutcome =>
    decision ? { dealKey: item.dealKey, outcome, decision } : { dealKey: item.dealKey, outcome };

  const terms = ports.readTerms(item.family, item.dealId);
  if (!config.verifiers.some((v) => sameAddress(v, terms.verifier))) return out('not-ours');
  const policy = loadPolicy(item.policy, terms.checkPolicy, terms.partialBps > 0);
  if (!policy) return out('policy-mismatch');

  let reference: DeliveryReference | null;
  let dealKey: string;
  if (item.kind === 'deal') {
    dealKey = `${item.dealId}-r${item.revision}`;
    const deal = ports.readDeal(item.family, item.dealId);
    if (deal.state !== AGREEMENT_ACCEPTED || deal.revision !== item.revision) return out('stale');
    if (deal.checkPassed || deal.checkFailed) return out('already-decided');
    const proof = item.deliveredBlockHash
      ? ports.deliveredProof(item.family, item.dealId, item.revision, item.deliveredBlockHash)
      : null;
    reference = proof ? loadReference(item.reference, proof) : null;
    if (!reference || !sameRepository(reference, policy)) return out('reference-mismatch');
  } else {
    if (!DRY_KEY.test(item.dealKey)) return out('reference-mismatch');
    dealKey = item.dealKey;
    try {
      reference = referenceSchema.parse(item.reference);
    } catch {
      return out('reference-mismatch');
    }
  }

  if (policy.runner.repository !== config.runnerRepo) return out('policy-mismatch');
  const run = ports.findRun(policy.runner.repository, dealKey, reference.sha, inputsHashFor(policy, terms.checkPolicy, reference.sha));
  const verdict = replayVerdict(policy, reference, run, ports.now());
  if (verdict.decision === 'UNAVAILABLE' && (verdict.reason === 'RUN_PENDING' || verdict.reason === 'RUN_MISSING')) {
    return out('waiting');
  }
  const evidence = run
    ? buildEvidence(policy, reference, run, verdict)
    : { doc: null as EvidenceDocument | null, evidenceHash: null as Hex | null };

  if (item.kind === 'dry') {
    // A decided answer releases the fee; no answer leaves it for the agent to refund.
    let released = false;
    if (verdict.decision !== 'UNAVAILABLE' && evidence.evidenceHash) {
      const { report } = encodeEnvelope({
        kind: DRY,
        chainId: config.chainId,
        adapter: config.adapter,
        issuedAt: ports.now(),
        body: dryBody({ fees: config.fees, runId: `0x${item.dealKey.slice(4)}`, resultHash: evidence.evidenceHash }),
      });
      released = ports.writeReport(report).ok;
    }
    ports.postDryRun({ dealKey: item.dealKey, dealId: item.dealId, decision: verdict.decision, doc: evidence.doc, evidenceHash: evidence.evidenceHash, released });
    return out('dry-run', verdict.decision);
  }

  const decided = verdict.decision !== 'UNAVAILABLE';
  let attested = false;
  if (decided && config.attest && evidence.evidenceHash) {
    const { report } = encodeEnvelope({
      kind: CHECK,
      chainId: config.chainId,
      adapter: config.adapter,
      issuedAt: ports.now(),
      body: checkBody({
        verifier: terms.verifier,
        family: item.family,
        dealId: item.dealId,
        revision: item.revision,
        pass: verdict.decision === 'PASS',
        evidenceHash: evidence.evidenceHash,
      }),
    });
    attested = ports.writeReport(report).ok;
    if (!attested) return out('write-failed', verdict.decision);
  }
  ports.postEvidence({
    dealKey: item.dealKey,
    family: item.family,
    dealId: item.dealId,
    revision: item.revision,
    decision: verdict.decision,
    reason: verdict.reason,
    doc: evidence.doc,
    evidenceHash: evidence.evidenceHash,
    attested,
  });
  if (!decided) return out('no-result', verdict.decision);
  return out(attested ? 'attested' : 'shadow', verdict.decision);
}

const RUN_LOOKBACK_SEC = 7 * 86_400;

/// Runs started in the last seven days, newest first, 100 to a page: a busy
/// runner never pushes a deal's run off the only page the workflow reads.
export function runsListUrl(runner: string, nowSec: number): string {
  const since = new Date((nowSec - RUN_LOOKBACK_SEC) * 1000).toISOString().slice(0, 19);
  return `https://api.github.com/repos/${runner}/actions/workflows/replay.yml/runs?event=workflow_dispatch&per_page=100&created=${encodeURIComponent(`>=${since}Z`)}`;
}
