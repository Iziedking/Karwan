import { formatUnits } from 'viem';
import { readEscrow } from '../chain/contracts.js';
import { logger } from '../logger.js';

const USDC_DECIMALS = 6;

/// What a financier can still be repaid out of an escrow.
///
/// NOT the invoice face value. Face includes the platform fee and every tranche
/// already released to the seller, and the assignment can only ever pay out of
/// what is left on the seller side. Pricing an advance against face on a
/// part-released invoice is how a financier ends up paying 430 against an
/// escrow that can only return 250.
///
/// This is the number every factoring surface should quote, validate and settle
/// against: the desk listing, the offer, and the accept.
export async function claimableUsdc(jobId: string): Promise<string | null> {
  try {
    const account = await readEscrow(jobId);
    const remaining = account.sellerNet - account.released;
    return formatUnits(remaining > 0n ? remaining : 0n, USDC_DECIMALS);
  } catch (err) {
    // Null means "unknown", never "zero" and never "fine". Every caller must
    // treat it as a refusal rather than pricing against a guess.
    logger.warn({ jobId, err: (err as Error).message }, 'claimable read failed');
    return null;
  }
}

/// Batch the read for a list of deals, bounded so the financier desk cannot
/// fan out into an unbounded burst of RPC calls. Deals whose escrow could not
/// be read are omitted from the map, and callers drop them from the listing
/// rather than showing a price they cannot stand behind.
export async function claimableForDeals(
  jobIds: string[],
  concurrency = 5,
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (let i = 0; i < jobIds.length; i += concurrency) {
    const batch = jobIds.slice(i, i + concurrency);
    const results = await Promise.all(
      batch.map(async (id) => [id, await claimableUsdc(id)] as const),
    );
    for (const [id, value] of results) {
      if (value !== null) out.set(id, value);
    }
  }
  return out;
}
