import { IdentityNeeded } from '../identity/suiteIdentity.js';

/// A seller sets up their Karwan record before agreeing to a deal that opens
/// on the escrow family (owner, 24 Oct 2026). The escrow notes each side's
/// record when the money goes in, so a record made after funding would not
/// count for that deal; asking at agreement means the buyer never waits.
export interface SellerRecordGateDeps {
  fundsOnSuite(deal: { jobId: string }): Promise<boolean>;
  requireIdentity(userAddress: string, role: 'seller'): Promise<void>;
}

export async function sellerRecordNeeded(
  deal: { jobId: string; seller: string },
  deps: SellerRecordGateDeps,
): Promise<{ code: 'record_setup_needed'; error: string } | null> {
  if (!(await deps.fundsOnSuite(deal))) return null;
  try {
    await deps.requireIdentity(deal.seller, 'seller');
    return null;
  } catch (err) {
    if (!(err instanceof IdentityNeeded)) throw err;
    return { code: 'record_setup_needed', error: 'Set up your Karwan record first, so this deal counts on it. It takes one confirmation.' };
  }
}
