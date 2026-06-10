/// Security Agent stub. Every hook returns the "let it through" verdict
/// for v1 so SME routes plug through it cleanly. The real SA design
/// (docs/security-agent.md, scheduled post-SME-rail) replaces each
/// function body with engine voting + behavior-detector input + paid x402
/// signals. The call sites here freeze the contract so the swap is one
/// file change, not a hunt across the codebase.
///
/// Hooks are explicitly named per the SME design doc §14 so the SA build
/// can grep for every integration point and replace them in lockstep.

export interface HoldVerdict {
  reason: string;
  severity: 'soft' | 'hard';
  reviewerSurface: 'telegram' | 'in-app' | 'both';
  expiresAt: number;
}

export interface PaidSignalRequest {
  invoiceId: string;
  signal: string;
  costEstimateUsdc: string;
  callerRole: 'buyer-agent' | 'seller-agent' | 'security-agent';
}

// Stub surface

/// Document anchor gate. v1 lets every anchor through; real SA filters
/// spam/malicious hashes via behavioral fingerprint + known-bad list.
export async function shouldRejectAnchor(
  _invoiceId: string,
  _hash: string,
  _kind: string,
  _anchorer: string,
): Promise<boolean> {
  return false;
}

/// Factoring acceptance gate. v1 lets every acceptance through; real SA
/// runs wash-trade fingerprint + financier behavioral profile + paid
/// wallet-risk check before allowing the setPayee redirect.
export async function shouldHoldFactoring(_offerId: string): Promise<HoldVerdict | null> {
  return null;
}

/// PO funding gate. v1 lets every fund through; real SA verifies the
/// financier passes the same behavioral checks as factoring + the deal's
/// concentrationFlag isn't tripped.
export async function shouldHoldPOFunding(_invoiceId: string): Promise<HoldVerdict | null> {
  return null;
}

/// Delivery gate. v1 lets every mark-delivered through; real SA runs the
/// URL + file scanners and a content-match check against the brief's
/// requirements before letting the buyer see the proof.
export async function shouldHoldDelivery(
  _jobId: string,
  _deliveryProof: string,
): Promise<HoldVerdict | null> {
  return null;
}

/// Paid signal authorisation. v1 lets every call through under the
/// per-deal budget cap; real SA can deny specific signal kinds for
/// flagged users or under a global kill switch.
export async function shouldDenyPaidCall(_req: PaidSignalRequest): Promise<boolean> {
  return false;
}

/// Bid scoring gate. v1 lets every bid through; real SA filters bids
/// from sellers with active risk tags into the human-review queue
/// instead of auto-accepting.
export async function shouldHoldBid(_bidId: string): Promise<HoldVerdict | null> {
  return null;
}

/// Match-propose gate. v1 lets every match through; real SA cross-checks
/// the buyer + seller behavioral fingerprints before letting the agent
/// auto-propose.
export async function shouldHoldMatch(_jobId: string): Promise<HoldVerdict | null> {
  return null;
}

/// Settlement gate. v1 lets every settlement through; real SA blocks the
/// final release on dispute hold or escrow-disputed-but-not-resolved.
export async function shouldHoldSettlement(_invoiceId: string): Promise<HoldVerdict | null> {
  return null;
}
