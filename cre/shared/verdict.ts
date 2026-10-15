import { sha256, toBytes } from 'viem';
import type { AcceptancePolicy } from './policy.js';
import type { DeliveryReference } from './reference.js';

/// What the replay runner's run shows, read from GitHub. `inputsSha` is the
/// commit the runner checked out; `runnerBlobSha` is the runner workflow file
/// the run used.
export interface RunFacts {
  runId: number;
  status: 'queued' | 'in_progress' | 'completed';
  createdAt: number;
  headSha: string;
  runnerBlobSha: string;
  inputsSha: string;
  jobs: { name: string; conclusion: string | null }[];
}

export type ReplayDecision = 'PASS' | 'FAIL' | 'UNAVAILABLE';

export interface ReplayVerdict {
  decision: ReplayDecision;
  reason: string;
  items: { id: string; passed: boolean }[];
  passed: number;
  required: number;
}

const sameRepository = (a: DeliveryReference['repository'], b: AcceptancePolicy['repository']) =>
  a.id === b.id && a.owner.toLowerCase() === b.owner.toLowerCase() && a.name.toLowerCase() === b.name.toLowerCase();

/// What the runner is asked to run, bound into the run's name and re-derived
/// by its guard job: sha256 of the five inputs, one per line, as
/// `printf '%s\n%s\n%s\n%s\n%s' ... | sha256sum` prints it.
export function replayInputsHash(i: { targetRepo: string; sha: string; policyHash: string; itemsJson: string; setup: string }): string {
  return sha256(toBytes(`${i.targetRepo}\n${i.sha}\n${i.policyHash}\n${i.itemsJson}\n${i.setup}`)).slice(2);
}

/// Fixed rules, no judgement: the delivery passes when every required item
/// the parties agreed succeeded on the delivered commit, in a run of the
/// pinned runner. No result is never a fail; the deal's clocks decide then.
export function replayVerdict(
  policy: AcceptancePolicy,
  reference: DeliveryReference,
  run: RunFacts | null,
  nowSec: number,
): ReplayVerdict {
  const required = policy.items.filter((i) => i.required).length;
  const conclusion = new Map((run?.jobs ?? []).map((j) => [j.name, j.conclusion]));
  const items = [...policy.items]
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((i) => ({ id: i.id, passed: conclusion.get(`item:${i.id}`) === 'success' }));
  const passed = policy.items.filter((i) => i.required && conclusion.get(`item:${i.id}`) === 'success').length;
  const result = (decision: ReplayDecision, reason: string): ReplayVerdict => ({ decision, reason, items, passed, required });

  if (!run) return result('UNAVAILABLE', 'RUN_MISSING');
  if (run.status !== 'completed') {
    return result('UNAVAILABLE', nowSec > run.createdAt + policy.timeoutMinutes * 60 ? 'RUN_TIMED_OUT' : 'RUN_PENDING');
  }
  if (run.runnerBlobSha !== policy.runner.blobSha) return result('UNAVAILABLE', 'RUNNER_NOT_PINNED');
  // The runner's first job re-derives the inputs hash from what it was given;
  // a run anyone dispatched with other items or another repo never passes it.
  if (conclusion.get('guard') !== 'success') return result('UNAVAILABLE', 'RUN_INPUTS_UNCONFIRMED');
  if (!sameRepository(reference.repository, policy.repository)) return result('FAIL', 'REPOSITORY_MISMATCH');
  if (run.inputsSha !== reference.sha) return result('FAIL', 'SHA_MISMATCH');
  if (passed < required) return result('FAIL', 'ITEM_FAILED');
  return result('PASS', 'ALL_REQUIRED_PASSED');
}
