import { agentPrefsOf, getProfile, type UserProfile } from '../db/profiles.js';
import { getAgentWallets, listAllAgentWallets, type AgentWallets } from '../db/agentWallets.js';
import { topicalOverlap } from '../llm/keywords.js';
import { MATCH_CANDIDATE_LIMIT } from '../marketplace/matchCandidates.js';
import { waysOf, type SellShape } from '../agents/ways.js';

/// Who sells what, in memory (view 41): built from the agent wallets and
/// profiles when the seller agents start, refreshed when a person saves their
/// profile, a way or an offer. A new request is matched against it instead of
/// reading every profile: everyone who shares a meaningful word with the
/// request is a fit, and at most MATCH_CANDIDATE_LIMIT sellers without a
/// shared word go to the model relevance judge. The same index answers the
/// other way: which open requests fit a seller who just saved.

export interface IndexedSeller {
  userAddress: string;
  sellerAddress: string;
  /// Keywords and skills, the words matching runs on.
  words: string[];
  sector: string | null;
  shapes: SellShape[];
  country: string | null;
  /// Seeded stock, never a seller (decision 7).
  example: boolean;
  /// False when the person keeps their selling agent off the market.
  onMarket: boolean;
  updatedAt: number;
}

export interface RequestForIndex {
  jobId: string;
  keywords?: string[];
  briefText?: string;
  sourcingSector?: string | null;
  tradeType?: 'service' | 'goods' | 'mixed' | null;
  where?: { scope: 'near' | 'country' | 'anywhere'; country?: string } | null;
}

export interface Candidates {
  /// Sellers sharing a meaningful word with the request, best overlap first.
  byWords: IndexedSeller[];
  /// Sellers with no shared word worth one model call, best hints first.
  toJudge: IndexedSeller[];
  /// Sellers on the market who were not worth a call this time.
  skipped: number;
}

const uniq = (words: readonly string[]) => Array.from(new Set(words.map((w) => w.trim().toLowerCase()).filter(Boolean)));

export function indexEntry(agents: Pick<AgentWallets, 'userAddress' | 'sellerAddress'>, profile: UserProfile, now = Date.now()): IndexedSeller | null {
  const s = profile.seller;
  if (!s) return null;
  return {
    userAddress: agents.userAddress.toLowerCase(),
    sellerAddress: agents.sellerAddress.toLowerCase(),
    words: uniq([...(s.keywords ?? []), ...(s.skills ?? [])]),
    sector: profile.smeProfile?.sector ?? null,
    shapes: waysOf(profile).sell.map((w) => w.shape),
    country: profile.location?.country ?? null,
    example: Boolean((profile as { seedKey?: string }).seedKey),
    onMarket: agentPrefsOf(profile).findClients !== false,
    updatedAt: now,
  };
}

const requestTags = (r: RequestForIndex): string[] => (r.keywords?.length ? r.keywords : r.briefText ? [r.briefText] : []);

/// How a seller fits a request apart from words: the same sector, a way of the
/// request's kind, the same country for goods and in-person work.
export function hintScore(s: IndexedSeller, r: RequestForIndex): number {
  let score = 0;
  if (r.sourcingSector && s.sector && s.sector.toLowerCase() === r.sourcingSector.toLowerCase()) score += 4;
  const wantsGoods = r.tradeType === 'goods' || r.tradeType === 'mixed';
  if (s.shapes.length === 0 || (wantsGoods ? s.shapes.includes('goods') : s.shapes.includes('one_time') || s.shapes.includes('milestones'))) score += 2;
  if (r.where?.scope === 'country' && r.where.country && s.country && s.country.toUpperCase() === r.where.country.toUpperCase()) score += 1;
  return score;
}

export function rankSellers(index: readonly IndexedSeller[], request: RequestForIndex, limit = MATCH_CANDIDATE_LIMIT): Candidates {
  const tags = requestTags(request);
  const scored = index
    .filter((s) => s.onMarket && !s.example)
    .map((s) => ({ s, overlap: tags.length && s.words.length ? topicalOverlap(tags, s.words) : 0, hint: hintScore(s, request) }));
  const byWords = scored
    .filter((x) => x.overlap > 0)
    .sort((a, b) => b.overlap - a.overlap || b.hint - a.hint)
    .map((x) => x.s);
  const rest = scored.filter((x) => x.overlap === 0).sort((a, b) => b.hint - a.hint || b.s.updatedAt - a.s.updatedAt);
  const toJudge = rest.slice(0, Math.max(0, limit)).map((x) => x.s);
  return { byWords, toJudge, skipped: rest.length - toJudge.length };
}

/// The open requests a seller fits, by shared words or sector, best first.
export function requestsForSeller<R extends RequestForIndex>(entry: IndexedSeller, requests: readonly R[], limit = MATCH_CANDIDATE_LIMIT): R[] {
  if (!entry.onMarket || entry.example) return [];
  return requests
    .map((r) => {
      const tags = requestTags(r);
      const overlap = tags.length && entry.words.length ? topicalOverlap(tags, entry.words) : 0;
      const sector = r.sourcingSector && entry.sector && entry.sector.toLowerCase() === r.sourcingSector.toLowerCase() ? 1 : 0;
      return { r, score: overlap * 10 + sector * 5 + (overlap || sector ? hintScore(entry, r) : 0) };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.r);
}

export interface IndexDeps {
  listWallets: () => Promise<Pick<AgentWallets, 'userAddress' | 'sellerAddress'>[]>;
  wallets: (userAddress: string) => Promise<Pick<AgentWallets, 'userAddress' | 'sellerAddress'> | null>;
  profile: (userAddress: string) => Promise<UserProfile | null>;
}

const liveDeps: IndexDeps = {
  listWallets: () => listAllAgentWallets(),
  wallets: (a) => getAgentWallets(a),
  profile: (a) => getProfile(a),
};

const entries = new Map<string, IndexedSeller>();
let built = false;
let building: Promise<number> | null = null;

export const sellerIndex = {
  isBuilt: () => built,
  entries: (): IndexedSeller[] => [...entries.values()],
  get: (userAddress: string) => entries.get(userAddress.toLowerCase()) ?? null,
  /// Reads every profile once. Concurrent callers share one build.
  rebuild(deps: IndexDeps = liveDeps): Promise<number> {
    if (building) return building;
    building = (async () => {
      const all = await deps.listWallets();
      const next = new Map<string, IndexedSeller>();
      for (const agents of all) {
        const profile = await deps.profile(agents.userAddress).catch(() => null);
        const entry = profile ? indexEntry(agents, profile) : null;
        if (entry) next.set(entry.userAddress, entry);
      }
      entries.clear();
      for (const [k, v] of next) entries.set(k, v);
      built = true;
      return entries.size;
    })().finally(() => {
      building = null;
    });
    return building;
  },
  /// One person saved: their entry is read again, or dropped.
  async refresh(userAddress: string, deps: IndexDeps = liveDeps): Promise<IndexedSeller | null> {
    const key = userAddress.toLowerCase();
    const [agents, profile] = await Promise.all([deps.wallets(key).catch(() => null), deps.profile(key).catch(() => null)]);
    const entry = agents && profile ? indexEntry(agents, profile) : null;
    if (entry) entries.set(key, entry);
    else entries.delete(key);
    return entry;
  },
  /// Tests only.
  reset(): void {
    entries.clear();
    built = false;
  },
};
