import { findAgentWalletByAgentAddress } from '../db/agentWallets.js';
import { getBrief } from '../db/briefs.js';
import { getProfile } from '../db/profiles.js';
import type { DeliveryKind, PrivateLocation, Where } from './rules.js';

/// Loads private locations for matching. What these return stays inside
/// Karwan's ranking; callers pass hits on, which carry the country only.

export async function locationOf(address: string): Promise<PrivateLocation | null> {
  return (await getProfile(address).catch(() => null))?.location ?? null;
}

export async function withSellerLocations<T extends { sellerUser: string }>(offers: T[]): Promise<Array<T & { sellerLocation: PrivateLocation | null }>> {
  const cache = new Map<string, Promise<PrivateLocation | null>>();
  const of = (a: string) => {
    const key = a.toLowerCase();
    if (!cache.has(key)) cache.set(key, locationOf(key));
    return cache.get(key)!;
  };
  return Promise.all(offers.map(async (o) => ({ ...o, sellerLocation: await of(o.sellerUser) })));
}

/// Requests are posted by a buyer agent; the location is its owner's.
export async function withBuyerLocations<T extends { buyer: string; jobId: string }>(
  requests: T[],
): Promise<Array<T & { buyerLocation: PrivateLocation | null; deliveryKind?: DeliveryKind; tradeType?: string; where?: Where }>> {
  return Promise.all(
    requests.map(async (r) => {
      const owner = await findAgentWalletByAgentAddress(r.buyer).catch(() => null);
      const brief = getBrief(r.jobId);
      return {
        ...r,
        buyerLocation: owner ? await locationOf(owner.userAddress) : null,
        deliveryKind: brief?.deliveryKind,
        tradeType: brief?.tradeType,
        where: brief?.where,
      };
    }),
  );
}
