import { isPriced, waysOf, type PricedWay } from '../agents/ways.js';
import type { UserProfile } from '../db/profiles.js';
import type { DeliveryKind } from '../location/rules.js';
import type { IndexedSeller } from '../matching/sellerIndex.js';
import type { PublicRating } from '../ratings/rules.js';
import type { Tier } from '../reputation/config.js';
import type { FindCandidate } from './rank.js';
import { beFoundOf, contactFromOf, meetOf } from './settings.js';

/// The people an agent may find (view 72): sellers who chose to be found and
/// share a word with the need. Their record comes from Karwan's own data, the
/// reads the market shortlist already uses before anyone offers, so finding
/// people pays for nothing.

/// How many word fits are read before ranking.
export const DIRECTORY_READ_MAX = 30;

export interface SellerRecord {
  verified: boolean;
  tier: Tier;
  rating: PublicRating;
  onTimeRate: number | null;
  completed: number;
  disputesLost: number;
}

export interface DirectoryDeps {
  /// Sellers sharing a meaningful word with the need, best overlap first.
  byWords(need: { keywords: string[]; text: string; kind: DeliveryKind }): Promise<IndexedSeller[]>;
  profile(user: string): Promise<UserProfile | null>;
  record(user: string): Promise<SellerRecord>;
}

function wayFor(profile: UserProfile, kind: DeliveryKind): PricedWay | null {
  const priced = waysOf(profile).sell.filter(isPriced);
  return priced.find((w) => (kind === 'goods' ? w.shape === 'goods' : w.shape !== 'goods')) ?? null;
}

export function candidateFrom(entry: IndexedSeller, profile: UserProfile, record: SellerRecord, kind: DeliveryKind): FindCandidate | null {
  if (!beFoundOf(profile) || !profile.seller) return null;
  const way = wayFor(profile, kind);
  return {
    user: entry.userAddress,
    sellerAgent: entry.sellerAddress,
    name: profile.displayName?.trim() || profile.handle || 'Karwan seller',
    tag: profile.handle ?? null,
    words: entry.words,
    meet: meetOf(profile),
    location: profile.location ?? null,
    ...record,
    // No priced way: they come up on skill and record and are asked (decision 6).
    price: way ? { min: way.priceMin, usual: way.priceUsual } : null,
    days: way ? (way.shape === 'goods' ? { min: way.arriveDaysMin, max: way.arriveDaysMax } : { min: way.daysMin, max: way.daysMax }) : null,
    contactFrom: contactFromOf(profile),
    outsideAgents: profile.settings?.acceptsOutsideAgents !== false,
  };
}

export async function directoryCandidates(need: { keywords: string[]; text: string; kind: DeliveryKind }, deps: DirectoryDeps): Promise<FindCandidate[]> {
  const fits = (await deps.byWords(need)).filter((s) => s.onMarket && !s.example).slice(0, DIRECTORY_READ_MAX);
  const rows = await Promise.all(
    fits.map(async (entry) => {
      const profile = await deps.profile(entry.userAddress).catch(() => null);
      if (!profile || !beFoundOf(profile)) return null;
      const record = await deps.record(entry.userAddress).catch(() => null);
      return record ? candidateFrom(entry, profile, record, need.kind) : null;
    }),
  );
  return rows.filter((r): r is FindCandidate => r !== null);
}
