// Copied from cre/shared by scripts/cre-shared-sync.mjs. Edit cre/shared, then run the script.
import type { Hex } from 'viem';
import { fingerprint } from './canonical.js';
import { policyFingerprint, type AcceptancePolicy } from './policy.js';
import { proofFingerprint, type DeliveryReference } from './reference.js';
import type { ReplayVerdict, RunFacts } from './verdict.js';

export const EVIDENCE_VERSION = 'karwan.replay.evidence.v1';

/// The record behind a check result. Its hash goes on Arc with the result; the
/// document itself names only pins and per-item outcomes, so anyone with
/// access to the run can recompute it and nothing private is in it.
export function buildEvidence(
  policy: AcceptancePolicy,
  reference: DeliveryReference,
  run: RunFacts,
  verdict: ReplayVerdict,
): { doc: EvidenceDocument; evidenceHash: Hex } {
  const doc: EvidenceDocument = {
    version: EVIDENCE_VERSION,
    policyHash: policyFingerprint(policy),
    referenceHash: proofFingerprint(reference),
    run: { id: run.runId, headSha: run.headSha, runnerBlobSha: run.runnerBlobSha },
    items: verdict.items,
    passed: verdict.passed,
    required: verdict.required,
    decision: verdict.decision,
    reason: verdict.reason,
  };
  return { doc, evidenceHash: fingerprint(doc) };
}

export interface EvidenceDocument {
  version: typeof EVIDENCE_VERSION;
  policyHash: Hex;
  referenceHash: Hex;
  run: { id: number; headSha: string; runnerBlobSha: string };
  items: { id: string; passed: boolean }[];
  passed: number;
  required: number;
  decision: ReplayVerdict['decision'];
  reason: string;
}
