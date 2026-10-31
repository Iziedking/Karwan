import type { Listing } from '../db/listings.js';
import { photoUrls } from '../listings/photos.js';
import { categoryOf, type CategoryId } from '../listings/categories.js';

/// What anyone may see of a listing in the market list. The negotiation floor
/// is agent-private steering and stays out. The matched deal's id is left out
/// because the list has no use for it; it is not a secret, since every read
/// keyed by a job id checks the signed session (jobIdReadGates.test.ts). The
/// seed key stays private too; the market only learns that the row is example
/// stock Karwan seeded, so the card can say so. Photos go out as links, so
/// the list stays small and each image caches on its own.
export function publicListing(l: Listing): Omit<Listing, 'negotiationMaxDecreasePct' | 'matchedJobId' | 'seedKey' | 'category'> & { example: boolean; photoUrls: string[]; category: CategoryId | null } {
  const { negotiationMaxDecreasePct: _floor, matchedJobId: _job, seedKey, ...rest } = l;
  return { ...rest, example: Boolean(seedKey), photoUrls: photoUrls(l), category: categoryOf(l) };
}
