/// How a reviewer's decision reaches KarwanBusinessRegistry.
///
/// Registries built after the BR-01 fix bind approve and reject to the document
/// hash the reviewer actually checked, so an applicant who swaps the document
/// between review and signature is not verified on a document nobody saw.
/// Registries deployed before it (Arc testnet) take the older signatures.
/// Every Arc mainnet registry is the newer one.

export type ReviewDecision = 'approve' | 'reject';

/// On-chain registration status (KarwanBusinessRegistry.statusOf).
export const REGISTRY_STATUS = { none: 0, submitted: 1, verified: 2, rejected: 3 } as const;

export interface RegistryReviewInput {
  decision: ReviewDecision;
  applicant: string;
  /// The document hash on record for this application, the one the reviewer saw.
  docHash: string;
  /// sha256 of the human-readable rejection reason. Required to reject.
  reasonHash?: string;
  bindsDocHash: boolean;
}

export function registryReviewCall(input: RegistryReviewInput): {
  abiFunctionSignature: string;
  abiParameters: string[];
} {
  if (input.decision === 'reject' && !input.reasonHash) {
    throw new Error('a rejection needs a reason hash');
  }
  if (input.bindsDocHash) {
    return input.decision === 'approve'
      ? { abiFunctionSignature: 'approve(address,bytes32)', abiParameters: [input.applicant, input.docHash] }
      : {
          abiFunctionSignature: 'reject(address,bytes32,bytes32)',
          abiParameters: [input.applicant, input.docHash, input.reasonHash as string],
        };
  }
  return input.decision === 'approve'
    ? { abiFunctionSignature: 'approve(address)', abiParameters: [input.applicant] }
    : { abiFunctionSignature: 'reject(address,bytes32)', abiParameters: [input.applicant, input.reasonHash as string] };
}

export function statusAfter(decision: ReviewDecision): number {
  return decision === 'approve' ? REGISTRY_STATUS.verified : REGISTRY_STATUS.rejected;
}

/// Why a review cannot go ahead, judged from the registry before any gas is
/// spent. Null means the chain agrees the application is waiting on this review.
export function reviewBlocker(
  onChain: { status: number; docHash: string },
  docHashOnRecord: string,
): 'not_awaiting_review' | 'document_changed' | null {
  if (onChain.status !== REGISTRY_STATUS.submitted) return 'not_awaiting_review';
  if (onChain.docHash.toLowerCase() !== docHashOnRecord.toLowerCase()) return 'document_changed';
  return null;
}
