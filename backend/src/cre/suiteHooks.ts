import type { Hex } from 'viem';
import { verifierForFunding } from './decisions.js';
import { parsePolicy } from './shared/policy.js';
import type { CreStore } from './store.js';

export { policyFingerprint, parsePolicy } from './shared/policy.js';
export { proofFingerprint, referenceSchema } from './shared/reference.js';

const START_ON_CHECK = 2;

/// What the suite's funding route (plan 8) puts into AgreementTerms for a deal
/// with an agreed check: the policy's fingerprint as checkPolicy, the verifier
/// CRE_ENABLED picks, and review starting on the check. The policy is stored
/// first, so the workflow can always fetch what the fingerprint names.
export async function prepareCheckedDeal(
  store: CreStore,
  settings: { creEnabled: boolean; verifierK?: string; verifierCK?: string },
  rawPolicy: unknown,
  terms: { partialBps: number },
): Promise<{ checkPolicy: Hex; verifier: string; reviewStarts: number }> {
  const policy = parsePolicy(rawPolicy, { partialAllowed: terms.partialBps > 0 });
  const verifier = verifierForFunding(settings);
  if (!verifier) throw new Error('CRE_VERIFIER_UNSET');
  const checkPolicy = await store.putDocument('policy', policy);
  return { checkPolicy, verifier, reviewStarts: START_ON_CHECK };
}
