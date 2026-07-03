/// Security Agent stub. Every hook returns the "let it through" verdict
/// for v1 so SME routes plug through it cleanly. The real SA design
/// (docs/security-agent.md, scheduled post-SME-rail) replaces each
/// function body with engine voting + behavior-detector input + paid x402
/// signals. The call sites here freeze the contract so the swap is one
/// file change, not a hunt across the codebase.
///
/// Hooks are explicitly named per the SME design doc §14 so the SA build
/// can grep for every integration point and replace them in lockstep.
import { localScanProof, type ScanVerdict } from './localScan.js';
import { wouldExceedCap } from './spendGuard.js';

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

/// Delivery gate. Runs the local URL safety scan over the proof before the
/// buyer is shown the link. The paid engine layer (Web Risk / IPQS / Cloudflare)
/// votes alongside this once keys are configured; until then the local scan
/// gives real protection. Returns the verdict so the caller can both gate the
/// proof and record the status on the deal. `clean`/`unverifiable` => null.
export interface DeliveryScan {
  verdict: ScanVerdict;
  reasons: string[];
  hold: HoldVerdict | null;
}

export async function scanDelivery(deliveryProof: string): Promise<DeliveryScan> {
  const { verdict, reasons } = localScanProof(deliveryProof);
  if (verdict === 'clean') return { verdict, reasons, hold: null };
  const severity: HoldVerdict['severity'] = verdict === 'malicious' ? 'hard' : 'soft';
  return {
    verdict,
    reasons,
    hold: {
      reason: reasons[0] ?? 'The delivery link could not be verified.',
      severity,
      reviewerSurface: 'in-app',
      expiresAt: 0,
    },
  };
}

/// Back-compat seam kept so existing call sites compile. Prefer scanDelivery,
/// which also returns the verdict + reasons for recording on the deal.
export async function shouldHoldDelivery(
  _jobId: string,
  deliveryProof: string,
): Promise<HoldVerdict | null> {
  return (await scanDelivery(deliveryProof)).hold;
}

/// Paid signal authorisation. Denies a paid call when it would push the deal's
/// total paid-call spend over the per-deal cap (spendGuard). `invoiceId` is the
/// deal/job key; `costEstimateUsdc` is the call's price. This is the real budget
/// rail the stub always promised — a flagged-user / kill-switch layer can be
/// stacked on top later without moving the call sites.
export async function shouldDenyPaidCall(req: PaidSignalRequest): Promise<boolean> {
  const est = Number(req.costEstimateUsdc);
  if (!Number.isFinite(est) || est <= 0) return false;
  return wouldExceedCap(req.invoiceId, est);
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
