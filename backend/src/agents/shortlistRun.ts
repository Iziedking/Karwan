import type { Ladder } from '../verification/ladder.js';
import type { RecordCounts } from '../reputation/recordRead.js';
import { locationFit, publicLocation, type DeliveryKind, type PrivateLocation, type Where } from '../location/rules.js';
import type { PublicRating } from '../ratings/rules.js';
import { SHORTLIST_MAX, type ShortlistCandidate } from './shortlist.js';

/// Turns the buyer agent's ranked bids into shortlist candidates, every one of
/// them (view 41, decision 12): a paid record read on each of the first five,
/// in parallel, each capped by a timeout. A read that fails or is slow, and
/// every bid past the fifth, keep the free data.

const MATCH_BAND_SIZE = 25;
const DAY_S = 86_400;

export interface ShortlistDeps {
  readRecord: (
    payerAgent: string,
    subject: string,
    ref: string,
    forAccount: string,
  ) => Promise<{ counts: RecordCounts; score: number } | null>;
  level: (user: string) => Promise<Ladder>;
  engine: (user: string) => Promise<{ score: number; tier: string; counts: RecordCounts }>;
  profile: (user: string) => Promise<{ name: string | null; tag: string | null }>;
  location: (user: string) => Promise<PrivateLocation | null>;
  rating: (user: string) => Promise<PublicRating>;
  /// Whether the seller's agent is linked to its owner; absent counts as linked.
  linked?: (sellerAgent: string) => Promise<boolean>;
  timeoutMs: number;
}

export interface ShortlistBid {
  seller: string;
  sellerUserAddress?: string;
  priceUsdc: string;
  deadlineUnix: number;
  topicalMatch?: number;
  deterministicScore: number;
  title?: string;
  /// The days the seller needs when the request was due sooner (view 41, step three).
  offeredDays?: number | null;
}

function within<T>(p: Promise<T>, ms: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), ms);
  });
  return Promise.race([p.catch(() => null), timeout]).finally(() => clearTimeout(timer));
}

export async function buildCandidates(
  input: {
    jobId: string;
    buyerAgent: string;
    buyerUser: string;
    bids: readonly ShortlistBid[];
    nowUnix: number;
    where?: Where;
    deliveryKind?: DeliveryKind;
    buyerLocation?: PrivateLocation | null;
    /// The days the request gives, to measure an offer's extra days against.
    requestDays?: number;
  },
  deps: ShortlistDeps,
): Promise<ShortlistCandidate[]> {
  return Promise.all(
    input.bids.map(async (b, i) => {
      const user = b.sellerUserAddress ?? b.seller;
      const [level, engine, profile, read, location, rating, linked] = await Promise.all([
        deps.level(user),
        deps.engine(user),
        deps.profile(user),
        i < SHORTLIST_MAX ? within(deps.readRecord(input.buyerAgent, user, input.jobId, input.buyerUser), deps.timeoutMs) : null,
        deps.location(user).catch(() => null),
        deps.rating(user).catch((): PublicRating => ({ kind: 'new', count: 0 })),
        deps.linked ? deps.linked(b.seller).catch(() => false) : true,
      ]);
      return {
        seller: b.seller,
        sellerUser: user,
        name: profile.name ?? 'A Karwan seller',
        tag: profile.tag,
        level,
        matchBand: b.topicalMatch != null ? Math.floor(b.topicalMatch / MATCH_BAND_SIZE) : -1,
        deterministicScore: b.deterministicScore,
        engineScore: read ? read.score * 10 : engine.score,
        tier: engine.tier,
        counts: read?.counts ?? engine.counts,
        offer: b.title ?? '',
        deliveryDays: b.offeredDays ?? Math.max(1, Math.round((b.deadlineUnix - input.nowUnix) / DAY_S)),
        extraDays: b.offeredDays && input.requestDays !== undefined ? Math.max(0, b.offeredDays - input.requestDays) : 0,
        askedUsdc: Number(b.priceUsdc),
        recordChecked: !!read,
        locationFit: locationFit(input.where, input.buyerLocation ?? null, location, input.deliveryKind),
        country: publicLocation(location).country,
        rating,
        linked,
      };
    }),
  );
}
