import type {
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
} from '@simplewebauthn/browser';

const BASE = process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:8787';

// The signed-in user's address, mirrored here by the auth layer. Web3 users have
// no backend session cookie, so private reads pass this as a `caller` hint and
// the backend uses it when no session is present. Circle users' session always
// takes precedence server-side. Replaced by real web3 sessions (SIWE) later.
let currentCaller: string | null = null;
export function setApiCaller(addr: string | null): void {
  currentCaller = addr ? addr.toLowerCase() : null;
}
function withCaller(path: string, caller?: string | null): string {
  const c = caller ?? currentCaller;
  if (!c) return path;
  return `${path}${path.includes('?') ? '&' : '?'}caller=${c.toLowerCase()}`;
}

/// CCTP chain keys Karwan bridges with (mirrors features/bridge/config.ts and
/// backend chain/cctpChains.ts). Kept local so core/api has no feature import.
export type BridgeChainKey =
  | 'sepolia'
  | 'optimismSepolia'
  | 'arbitrumSepolia'
  | 'baseSepolia'
  | 'polygonAmoy';

/// Source chains supported via the App Kit bridge path on top of the hand-rolled
/// EVM set. Solana is App-Kit-only because the frontend has no wagmi connector
/// for it; the burn signs on a backend Circle DCW and the App Kit forwarder
/// broadcasts the Arc mint. Mirrors backend/src/circle/bridge-kit.ts.
export type AppKitBridgeChainKey = BridgeChainKey | 'solanaDevnet';

export interface ApiStatus {
  chain: { id: number; rpc: string; explorer: string };
  contracts: {
    jobBoard?: string;
    escrow?: string;
    reputation?: string;
    usdc?: string;
    identityRegistry?: string;
  };
  agents: {
    buyer: { configured: boolean; address?: string };
    seller: { configured: boolean; address?: string };
  };
}

export interface BuyerBid {
  seller: string;
  priceUsdc: string;
  deadlineUnix: number;
  score: number | null;
  suggestedCounterPrice: string | null;
  suggestedCounterDeadlineDays: number | null;
  /// Composite-engine tier of the seller at bid time. Null when the bid
  /// landed before the tier was wired (legacy bids on old jobs).
  sellerTier: 'new' | 'cold' | 'established' | 'strong' | 'elite' | null;
  /// Owner address behind the seller agent — used by the compact peek so
  /// `api.getProfile` resolves the right profile (profiles are keyed by
  /// user address, not agent). Null on legacy bids.
  sellerUserAddress: string | null;
  /// Seller's display name from their profile. Surfaced inline on the bid
  /// card. Null when unset or on legacy bids.
  sellerDisplayName: string | null;
}

export interface BuyerJob {
  jobId: string;
  buyer: string;
  budgetUsdc: string;
  deadlineUnix: number;
  termsHash: string;
  finalized: boolean;
  escrowFunded: boolean;
  /// When the resulting deal was cancelled (epoch ms). Surfaced for a brief
  /// grace window so the user sees the terminal state before the row drops.
  cancelledAt?: number;
  /// When the brief passed its deadline without a match (epoch ms). The page
  /// renders read-only when set. the auction is over.
  expiredAt?: number;
  /// Human-readable brief text from the off-chain store. Null when the brief
  /// record was lost (eg flat-file wiped) but the on-chain job still exists.
  briefText?: string | null;
  keywords?: string[] | null;
  negotiationMaxIncreasePct?: number | null;
  /// Buyer opted into Trusted Match for this brief. The job-detail page
  /// surfaces a badge so both parties know the agent loop is weighting
  /// reputation + stake over price.
  trustedMatch?: boolean;
  bids: BuyerBid[];
  lastCounterPriceBySeller: Record<string, string>;
  counterRoundsBySeller: Record<string, number>;
  /// Privacy gate. The backend returns the full job only to the buyer who
  /// posted it (and, once matched, the matched seller). For everyone else it
  /// returns a status-only stub with `isParty: false` and no bids/amounts.
  isParty?: boolean;
  /// Set on the status-only stub so the page can say "collecting bids" /
  /// "in negotiation" without leaking the auction.
  status?: 'open' | 'negotiating' | 'cancelled' | 'expired';
}

export interface BuyerAgentProfile {
  address: string;
  displayName: string;
  maxBudgetUsdc: number;
  minDeadlineDays: number;
  maxDeadlineDays: number;
  bidCollectionSeconds: number;
  maxCounterRounds: number;
  confidenceThreshold: number;
  milestonePcts: number[];
}

export interface SellerAgentProfile {
  address: string;
  displayName: string;
  skills: string[];
  bio: string;
  minBudgetUsdc: number;
  maxBudgetUsdc: number;
  minDeadlineDays: number;
  maxDeadlineDays: number;
  confidenceThreshold: number;
}

export interface SellerActiveBid {
  jobId: string;
  seller?: string;
  jobBuyer: string;
  budgetUsdc: string;
  deadlineUnix: number;
  lastBidPrice: string;
  counterRounds: number;
  finalized: boolean;
}

export type UserRole = 'buyer' | 'seller' | 'both';
export type UserLocale = 'en' | 'ar' | 'fr' | 'hi' | 'sw';
export type ThemePreference = 'light' | 'dark' | 'system';

export interface UserSettings {
  locale?: UserLocale;
  theme?: ThemePreference;
  soundEnabled?: boolean;
  notificationsMuted?: boolean;
  publicPassport?: boolean;
}

export interface UserProfile {
  address: string;
  role: UserRole;
  displayName: string;
  createdAt: number;
  updatedAt: number;
  xHandle?: string;
  xUserId?: string;
  xProfileImageUrl?: string;
  settings?: UserSettings;
  seller?: {
    skills: string[];
    bio: string;
    minBudgetUsdc: number;
    maxBudgetUsdc: number;
    minDeadlineDays: number;
    maxDeadlineDays: number;
  };
  buyer?: {
    maxBudgetUsdc: number;
    minDeadlineDays: number;
    maxDeadlineDays: number;
    bidCollectionSeconds: number;
    milestonePcts: number[];
  };
}

// KarwanEscrow.EscrowState: None=0, Funded=1, Settled=2, Disputed=3, Refunded=4.
export interface DirectDealOnChain {
  state: number;
  milestonesReleased: number;
  dealAmountWei: string;
  sellerNetWei: string;
  feeTotalWei: string;
  releasedWei: string;
}

export interface DirectDeal {
  jobId: string;
  buyer: string;
  seller: string;
  dealAmountUsdc: string;
  firstReleasePct: number;
  /// Optional delivery deadline (unix seconds). When unset, the deal is
  /// open-ended: seller has no time pressure and the buyer can't unilateral
  /// cancel; only mutual cancel or appeal.
  deadlineUnix?: number;
  terms: string;
  acceptedAt?: number;
  delivered: boolean;
  deliveredAt?: number;
  deliveryProof?: string;
  reviewWindowStartedAt?: number;
  reviewExtensionMs?: number;
  reviewExtensionCount?: number;
  firstAutoReleased?: boolean;
  disputed?: boolean;
  disputedAt?: number;
  cancelledAt?: number;
  cancelKind?:
    | 'mutual'
    | 'platform-attributed'
    | 'refund-from-dispute'
    | 'release-from-dispute'
    | 'unilateral'
    | 'pre-accept';
  cancelReason?: string;
  /// When set, the loser of a Disputed-state resolution. 'seller' is set on a
  /// refund acceptance (seller conceded); 'buyer' is set on a release
  /// acceptance (buyer conceded). Drives the off-chain reputation penalty.
  disputeLoser?: 'buyer' | 'seller';
  cancellationProposal?: {
    proposedBy: 'buyer' | 'seller';
    kind:
      | 'mutual'
      | 'platform-attributed'
      | 'refund-from-dispute'
      | 'release-from-dispute';
    reason: string;
    proposedAt: number;
  };
  autoReleasedAt?: number;
  /// Acceptance window cutoff (unix seconds). When the seller hasn't accepted
  /// by this point, the watcher auto-cancels with cancelKind 'pre-accept' and
  /// no reputation hit. UI shows a countdown on the awaiting-acceptance stage.
  acceptanceDeadlineUnix?: number;
  /// Counterparty was invited by email and hasn't claimed the link yet. While
  /// this is set, the deal's seller (or buyer for inbound) is a sentinel and
  /// no on-chain funding has moved. The inviter sees a "share invite" CTA.
  pendingCounterparty?: {
    email: string;
    role: 'buyer' | 'seller';
    inviteToken: string;
  };
  /// Seller raised a delay appeal. If `delayAppealRespondedAt` is older, the
  /// appeal is OPEN and the buyer must respond before
  /// delayAppealRaisedAt + delayAppealResponseWindowMs or the final 50%
  /// auto-releases. Once responded, the seller can re-raise later.
  delayAppealRaisedAt?: number;
  delayAppealRespondedAt?: number;
  delayAppealResponse?: string;
  delayAppealCount?: number;
  /// Response window in ms surfaced by the backend so the UI can render the
  /// countdown without hard-coding the env value.
  delayAppealResponseWindowMs?: number;
  /// Grace ms until the seller becomes eligible to raise a delay appeal after
  /// the first milestone is released. Surfaced by the backend.
  delayAppealGraceMs?: number;
  settledAt?: number;
  fundTxHash?: string;
  createdAt: number;
  updatedAt: number;
  reviewWindowMs?: number;
  onChain: DirectDealOnChain | null;
  /// True when the funds are still on a previous escrow contract. The deal
  /// detail page renders a banner pointing at /legacy so actions don't fail
  /// silently on the new escrow.
  legacyEscrow?: boolean;
  legacyState?: number;
  /// Buyer marked this as a trusted-match deal at create time. Surfaces stake
  /// requirement copy on the seller's accept panel. Chain-side enforcement
  /// arrives with the next escrow redeploy; flag is captured today so old
  /// deals already carry it when on-chain gating lands.
  requireStake?: boolean;
  /// Stake percentage chosen by the buyer for this deal (50..100). Only
  /// meaningful when requireStake is true.
  requireStakePct?: number;
  /// Pending delivery-deadline extension request from the seller. Buyer sees
  /// a banner with Approve / Decline; the request clears either way.
  extensionRequest?: {
    requestedBy: 'seller';
    requestedAt: number;
    additionalSeconds: number;
    reason?: string;
  };
  /// Settled extension activity. Each entry is a finalized request the buyer
  /// either approved (deadlineUnix bumped) or declined.
  extensionHistory?: {
    requestedBy: 'seller';
    requestedAt: number;
    additionalSeconds: number;
    reason?: string;
    decidedAt: number;
    decision: 'approved' | 'declined';
    newDeadlineUnix?: number;
  }[];
}

export interface MarketplaceBrief {
  jobId: string;
  /// Pre-masked by the backend (0xabcd…wxyz) so the marketplace surface
  /// doesn't leak full wallet addresses to anyone who hits the endpoint.
  buyer: string;
  budgetUsdc: string;
  deadlineUnix: number;
  briefText: string;
  bidsCount: number;
  postedAt: number;
}

export type ListingStatus = 'open' | 'matched' | 'cancelled' | 'expired';

export interface Listing {
  id: string;
  sellerUser: string;
  sellerAgent: string;
  title: string;
  description: string;
  askingPriceUsdc: number;
  negotiationMaxDecreasePct?: number;
  postedAt: number;
  /// Unix-ms when the listing window closes. Past this, listingStatus is
  /// 'expired' and the backend drops it from match scanners.
  expiresAt: number;
  matchedAt?: number;
  matchedJobId?: string;
  /// Set when the seller cancels their own listing pre-match.
  cancelledAt?: number;
}

export interface MatchProposal {
  jobId: string;
  buyerUser: string;
  buyerAgent: string;
  sellerUser: string;
  sellerAgent: string;
  agreedPriceUsdc: string;
  deadlineUnix: number;
  termsHash: string;
  proposedAt: number;
  approvedAt?: number;
  declinedAt?: number;
  /// Deterministic risk signal computed when the proposal was created.
  /// Surfaced in MatchBanner so the human sees why the agent flagged it.
  /// 'new-buyer' is set by the seller agent's tier adjustment for NEW-tier
  /// buyers (docs/reputation-model.md §6) and trumps the buyer-side pattern.
  riskFlag?: 'honey-trap' | 'lowball' | 'spammy' | 'new-buyer';
  riskNote?: string;
  /// Balance awareness from the buyer agent at propose time. fundable=false
  /// means the agent agreed within the buyer's authorized cap but its wallet is
  /// short by topUpNeededUsdc, so the buyer must top up before the seller's
  /// accept can fund escrow. undefined on legacy proposals (treat as unknown).
  fundable?: boolean;
  agentBalanceUsdc?: string;
  fundedAmountUsdc?: string;
  topUpNeededUsdc?: string;
}

/// Agents found a topical match, but the best achievable price lands just
/// outside one party's range. Instead of skipping, the agent asks that party
/// to proceed at the agreed price (anchored at the other side's boundary, so a
/// single yes closes the deal). Valid until expiresAt; lapses to nothing.
export interface NearMissApproval {
  jobId: string;
  buyerUser: string;
  buyerAgent: string;
  sellerUser: string;
  sellerAgent: string;
  askedSide: 'buyer' | 'seller';
  askedUser: string;
  proceedPriceUsdc: string;
  limitUsdc: string;
  gapUsdc: string;
  buyerCeilingUsdc: string;
  sellerFloorUsdc: string;
  createdAt: number;
  expiresAt: number;
  proceededAt?: number;
  declinedAt?: number;
  buyerAsked?: boolean;
}

export interface DirectDealFunding {
  dealAmountUsdc: string;
  fundedAmountUsdc: string;
  sellerNetUsdc: string;
  feeTotalUsdc: string;
}

export interface ActivationStatus {
  activated: boolean;
  agents?: { buyer: string; seller: string; buyerName?: string; sellerName?: string };
}

export interface NetworkOnchainDayPoint {
  ts: number;
  funded: number;
  settled: number;
  disputed: number;
  refunded: number;
}

export interface NetworkOnchainStats {
  fromBlock: string;
  toBlock: string;
  contracts: {
    escrow: string;
    vault: string;
    treasury: string;
    reputation: string;
    jobBoard: string;
  };
  totals: {
    jobsPosted: number;
    escrowsFunded: number;
    escrowsSettled: number;
    escrowsDisputed: number;
    escrowsRefunded: number;
    milestoneReleases: number;
    vaultDeposits: number;
    vaultClaims: number;
    vaultSlashes: number;
    reputationRecords: number;
  };
  volumes: {
    fundedUsdc: string;
    releasedUsdc: string;
    refundedUsdc: string;
    slashedUsdc: string;
    feesCollectedUsdc: string;
    vaultDepositsUsdc: string;
  };
  series: NetworkOnchainDayPoint[];
  scannedAt: number;
}

/// Optional custom names for the agent pair. Blank/omitted means the UI shows
/// the default "Buyer agent" / "Seller agent".
export interface AgentNames {
  buyerName?: string;
  sellerName?: string;
}

export interface Reputation {
  address: string;
  /// Legacy bps score (0..10000). Kept for backward-compatible badge UI.
  scoreBps: number;
  successCount: number;
  disputedCount: number;
  failedCount: number;
  totalDeals: number;
  /// New composite engine output (docs/reputation-model.md). Optional so
  /// older API responses don't break the type.
  score?: number;
  tier?: 'NEW' | 'COLD' | 'ESTABLISHED' | 'STRONG' | 'ELITE';
  /// Composite engine v2 factor breakdown (docs/reputation-model.md). All [0,1].
  terms?: {
    stake?: number;
    completion?: number;
    volume?: number;
    tenure?: number;
    activity?: number;
    referral?: number;
    base?: number;
    penalty?: number;
    decay?: number;
  };
  /// Present + within the 48h window when the user just crossed into a higher
  /// tier. Drives the profile congrats card.
  tierCelebration?: { tier: 'NEW' | 'COLD' | 'ESTABLISHED' | 'STRONG' | 'ELITE'; until: number } | null;
  modelVersion?: number;
  /// Raw inputs the engine fed into the formula. Used by the credit passport
  /// to display tenure days, the chain-vs-DB settlement gap, lifetime volume,
  /// etc. without re-fetching every source. Shape mirrors the backend's
  /// ReputationInputs interface; only the fields the UI actually consumes
  /// are listed here.
  inputs?: {
    registeredAt?: number;
    stakeUsdc?: number;
    stakeDays?: number;
    activeDays?: number;
    lifetimeVolumeUsdc?: number;
    completedDeals?: number;
  };
}

export interface BalanceRow {
  label: string;
  address: string | null;
  balanceUsdc: string | null;
  balanceWei?: string;
  error?: string;
}

export interface ChainEvent {
  type: string;
  jobId?: string;
  actor: 'buyer' | 'seller' | 'platform';
  ts: number;
  payload: Record<string, unknown>;
}

export type FeedbackCategory = 'bug' | 'improvement' | 'other' | 'praise';
export type FeedbackStatus = 'new' | 'triaged' | 'resolved';

export interface FeedbackItem {
  id: string;
  category: FeedbackCategory;
  title: string;
  message: string;
  contact: string | null;
  context: { url?: string; wallet?: string; userAgent?: string } | null;
  status: FeedbackStatus;
  createdAt: number;
  /// Absolute when PUBLIC_API_BASE_URL is set on the backend, otherwise a
  /// path relative to the API origin. The viewer prefixes with api.baseUrl.
  screenshotUrls: string[];
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public detail?: unknown,
    public code?: string,
  ) {
    super(message);
  }
}

async function json<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
    cache: 'no-store',
    // Session cookie travels on every API call so the backend can resolve
    // the current user without a token header dance. Backend CORS echoes the
    // Origin and sets Access-Control-Allow-Credentials.
    credentials: 'include',
    ...init,
  });
  if (!res.ok) {
    let parsed: unknown = res.statusText;
    try {
      parsed = await res.json();
    } catch {
      parsed = await res.text().catch(() => res.statusText);
    }
    // Extract a usable message from the response shape. The backend's various
    // routes use slightly different keys for the human line: `error`, `detail`,
    // `message`, `reason`, sometimes a `status` enum. Before this rewrite we
    // only looked at `error`, so a body like `{ status: 'relaying', detail:
    // 'a relay is already in progress' }` fell into `String(parsed)` and
    // surfaced the famous "[object Object]". Iterate the common fields in
    // priority order; fall back to JSON.stringify before resorting to a raw
    // String() coercion.
    let message: string;
    if (typeof parsed === 'string') {
      message = parsed;
    } else if (parsed && typeof parsed === 'object') {
      const o = parsed as Record<string, unknown>;
      const candidates = [o.error, o.detail, o.message, o.reason, o.status];
      const found = candidates.find(
        (c): c is string => typeof c === 'string' && c.trim().length > 0,
      );
      if (found) {
        message = found;
      } else {
        try {
          message = JSON.stringify(parsed);
        } catch {
          message = res.statusText || `HTTP ${res.status}`;
        }
      }
    } else {
      message = res.statusText || `HTTP ${res.status}`;
    }
    const detail =
      typeof parsed === 'object' && parsed && 'detail' in parsed
        ? (parsed as { detail: unknown }).detail
        : undefined;
    const code =
      typeof parsed === 'object' && parsed && 'code' in parsed
        ? String((parsed as { code: unknown }).code)
        : undefined;
    throw new ApiError(res.status, message, detail, code);
  }
  return res.json() as Promise<T>;
}

// Operator-only admin token for the feedback viewer. Held in sessionStorage so
// it survives navigation within the tab but never persists to disk, and sent as
// the X-Admin-Token header on admin-gated calls. The backend fail-closes when
// ADMIN_API_TOKEN is unset (503) and 401s on a mismatch.
const ADMIN_TOKEN_KEY = 'karwan.adminToken';

export function getAdminToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.sessionStorage.getItem(ADMIN_TOKEN_KEY);
}

export function setAdminToken(token: string | null): void {
  if (typeof window === 'undefined') return;
  if (token) window.sessionStorage.setItem(ADMIN_TOKEN_KEY, token);
  else window.sessionStorage.removeItem(ADMIN_TOKEN_KEY);
}

function adminHeaders(): Record<string, string> {
  const t = getAdminToken();
  return t ? { 'x-admin-token': t } : {};
}

export const api = {
  baseUrl: BASE,
  eventsUrl: () => `${BASE}/api/events`,
  status: () => json<ApiStatus>('/api/agents/status'),
  buyer: (address?: string) =>
    json<{ profile: BuyerAgentProfile | null; jobs: BuyerJob[] }>(
      `/api/agents/buyer${address ? `?address=${address}` : ''}`,
    ),
  seller: (address?: string) =>
    json<{ profile: SellerAgentProfile | null; activeBids: SellerActiveBid[] }>(
      `/api/agents/seller${address ? `?address=${address}` : ''}`,
    ),
  job: (id: string, caller?: string | null) =>
    json<BuyerJob>(withCaller(`/api/jobs/${id}`, caller)),
  matchProposal: (jobId: string, caller?: string | null) =>
    json<{ proposal: MatchProposal | null }>(withCaller(`/api/jobs/${jobId}/match`, caller)),
  matchesFor: (address: string) =>
    json<{ proposals: MatchProposal[] }>(`/api/jobs/matches/for?caller=${address}`),
  approveMatch: (jobId: string, caller: string) =>
    json<{ accepted: boolean; jobId: string; txHash: string }>(
      `/api/jobs/${jobId}/approve-match`,
      { method: 'POST', body: JSON.stringify({ caller }) },
    ),
  declineMatch: (jobId: string, caller: string, reason?: string) =>
    json<{ accepted: boolean; jobId: string }>(
      `/api/jobs/${jobId}/decline-match`,
      { method: 'POST', body: JSON.stringify({ caller, ...(reason ? { reason } : {}) }) },
    ),
  cancelBrief: (jobId: string, caller: string) =>
    json<{ accepted: boolean; jobId: string }>(
      `/api/jobs/${jobId}/cancel`,
      { method: 'POST', body: JSON.stringify({ caller }) },
    ),
  editBrief: (jobId: string, caller: string, briefText: string) =>
    json<{ brief: { jobId: string; briefText: string; postedBy: string } }>(
      `/api/jobs/${jobId}/edit`,
      { method: 'POST', body: JSON.stringify({ caller, briefText }) },
    ),
  nearMiss: (jobId: string, caller?: string | null) =>
    json<{ nearMiss: NearMissApproval | null }>(
      withCaller(`/api/jobs/${jobId}/near-miss`, caller),
    ),
  proceedNearMiss: (jobId: string, caller: string) =>
    json<{ proceeded: boolean; jobId: string; txHash: string }>(
      `/api/jobs/${jobId}/near-miss`,
      { method: 'POST', body: JSON.stringify({ caller, action: 'proceed' }) },
    ),
  declineNearMiss: (jobId: string, caller: string) =>
    json<{ declined: boolean; flipped: boolean; jobId: string }>(
      `/api/jobs/${jobId}/near-miss`,
      { method: 'POST', body: JSON.stringify({ caller, action: 'decline' }) },
    ),
  listings: () => json<{ listings: Listing[] }>('/api/listings'),
  listingsForSeller: (address: string) =>
    json<{ listings: Listing[] }>(`/api/listings/mine?address=${address}`),
  getListing: (id: string, caller?: string) => {
    const q = caller ? `?caller=${caller}` : '';
    return json<{
      listing: Listing;
      floor?: number;
      viewerIsOwner?: boolean;
      status: ListingStatus;
    }>(`/api/listings/${id}${q}`);
  },
  cancelListing: (id: string, caller: string) =>
    json<{ listing: Listing }>(`/api/listings/${id}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ caller }),
    }),
  editListing: (
    id: string,
    caller: string,
    patch: { title?: string; description?: string; askingPriceUsdc?: number },
  ) =>
    json<{ listing: Listing }>(`/api/listings/${id}/edit`, {
      method: 'POST',
      body: JSON.stringify({ caller, ...patch }),
    }),
  marketplaceBriefs: () =>
    json<{ briefs: MarketplaceBrief[] }>(`/api/jobs/marketplace`),
  postListing: (body: {
    sellerUser: string;
    title: string;
    description: string;
    askingPriceUsdc: number;
    negotiationMaxDecreasePct?: number;
    ttlDays?: number;
  }) =>
    json<{ listing: Listing }>('/api/listings', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  dealsFeed: () => json<{ deals: DirectDeal[] }>('/api/deals/feed'),
  /// Aggregate network numbers only (no per-deal data). Use this for stat
  /// counters; the feed itself is settled-only and private-safe.
  dealsStats: () =>
    json<{ total: number; direct: number; agent: number; settled: number; volumeUsdc: number }>(
      '/api/deals/stats',
    ),
  /// Provable on-chain stats scanned from current contract events. Counts,
  /// USDC volumes, and a 30-day daily series of funded/settled/disputed/refunded.
  networkOnchain: () => json<NetworkOnchainStats>('/api/network/onchain'),
  submitFeedback: (body: {
    category: 'bug' | 'improvement' | 'other' | 'praise';
    title: string;
    message: string;
    contact?: string;
    context?: { url?: string; wallet?: string; userAgent?: string };
    screenshots?: { dataUrl: string }[];
  }) =>
    json<{ ok: true; id: string }>('/api/feedback', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  listFeedback: () =>
    json<{ feedback: FeedbackItem[] }>('/api/feedback', { headers: adminHeaders() }),
  setFeedbackStatus: (id: string, status: FeedbackStatus) =>
    json<{ ok: true; status: FeedbackStatus }>(`/api/feedback/${id}/status`, {
      method: 'POST',
      headers: adminHeaders(),
      body: JSON.stringify({ status }),
    }),
  postJob: (
    body: {
      posterAddress: string;
      brief: string;
      budgetUsdc: number;
      negotiationMaxIncreasePct?: number;
      trustedMatch?: boolean;
    } & ({ deadlineSeconds: number } | { deadlineDays: number }),
  ) =>
    json<{ jobId: string; deadlineUnix: number; txHash: string; explorerUrl: string }>(
      '/api/jobs',
      { method: 'POST', body: JSON.stringify(body) },
    ),
  releaseMilestones: (jobId: string, totalMilestones = 2) =>
    json<{ accepted: boolean; jobId: string; totalMilestones: number }>(
      '/api/milestones/release',
      { method: 'POST', body: JSON.stringify({ jobId, totalMilestones }) },
    ),
  balances: () => json<{ wallets: BalanceRow[]; fetchedAt: number }>('/api/balances'),
  getProfile: (address: string) =>
    json<{ profile: UserProfile | null }>(`/api/profile?address=${address}`),
  saveProfile: (input: Omit<UserProfile, 'createdAt' | 'updatedAt'>) =>
    json<{ profile: UserProfile }>('/api/profile', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  setXHandle: (address: string, handle: string | null) =>
    json<{ profile: UserProfile }>('/api/profile/x-handle', {
      method: 'POST',
      body: JSON.stringify({ address, handle }),
    }),
  /// Delete the account: purges off-chain profile + Telegram link + Circle auth
  /// row. If agent wallets still hold USDC, throws ApiError with code
  /// 'agent-funds' (a confirmable warning); re-call with force=true to proceed.
  deleteAccount: (address: string, force = false) =>
    json<{ ok: boolean }>(
      `/api/profile?address=${address}${force ? '&force=true' : ''}`,
      { method: 'DELETE' },
    ),
  getSettings: (address: string) =>
    json<{ settings: UserSettings }>(`/api/settings?address=${address}`),
  saveSettings: (address: string, settings: UserSettings) =>
    json<{ settings: UserSettings }>('/api/settings', {
      method: 'POST',
      body: JSON.stringify({ address, settings }),
    }),
  xStatus: () => json<{ configured: boolean }>('/api/x/status'),
  xOauthStart: (address: string, returnTo?: string) =>
    json<{ url: string }>('/api/x/oauth/start', {
      method: 'POST',
      body: JSON.stringify({ address, returnTo }),
    }),

  // ── Email + passkey (Circle login) ────────────────────────────────────────
  authStatus: () => json<{ configured: boolean }>('/api/auth/status'),
  authMe: () =>
    json<{
      user: {
        address: string;
        method: 'web3' | 'circle';
        email?: string;
        hasPasskey?: boolean;
      } | null;
    }>('/api/auth/me'),
  authLogout: () => json<{ ok: boolean }>('/api/auth/logout', { method: 'POST' }),
  authLookup: (email: string) =>
    json<{ exists: boolean; hasPasskey: boolean }>('/api/auth/lookup', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),
  authPasskeyAddOptions: () =>
    json<{ options: PublicKeyCredentialCreationOptionsJSON }>(
      '/api/auth/passkey/add/options',
      { method: 'POST', body: JSON.stringify({}) },
    ),
  authPasskeyAddVerify: (email: string, response: RegistrationResponseJSON) =>
    json<{ ok: boolean }>(
      '/api/auth/passkey/add/verify',
      { method: 'POST', body: JSON.stringify({ email, response }) },
    ),
  authRegisterOptions: (email: string) =>
    json<{ options: PublicKeyCredentialCreationOptionsJSON }>(
      '/api/auth/register/options',
      { method: 'POST', body: JSON.stringify({ email }) },
    ),
  authRegisterVerify: (email: string, response: RegistrationResponseJSON) =>
    json<{ user: { address: string; email: string; method: 'circle' } }>(
      '/api/auth/register/verify',
      { method: 'POST', body: JSON.stringify({ email, response }) },
    ),
  authLoginOptions: (email: string) =>
    json<{ options: PublicKeyCredentialRequestOptionsJSON }>(
      '/api/auth/login/options',
      { method: 'POST', body: JSON.stringify({ email }) },
    ),
  authLoginVerify: (email: string, response: AuthenticationResponseJSON) =>
    json<{ user: { address: string; email: string; method: 'circle' } }>(
      '/api/auth/login/verify',
      { method: 'POST', body: JSON.stringify({ email, response }) },
    ),
  authOtpRequest: (email: string) =>
    json<{ sent: boolean; delivered?: boolean; devCode?: string }>(
      '/api/auth/otp/request',
      {
        method: 'POST',
        body: JSON.stringify({ email }),
      },
    ),
  authOtpVerify: (email: string, code: string) =>
    json<{ user: { address: string; email: string; method: 'circle' } }>(
      '/api/auth/otp/verify',
      { method: 'POST', body: JSON.stringify({ email, code }) },
    ),

  // ── SIWE (Sign-In With Ethereum) for web3 wallet users ────────────────────
  siweNonce: (address: string, chainId?: number) =>
    json<{ nonce: string; message: string }>('/api/siwe/nonce', {
      method: 'POST',
      body: JSON.stringify({ address, chainId }),
    }),
  siweVerify: (address: string, signature: string) =>
    json<{ user: { address: string; method: 'web3' } }>('/api/siwe/verify', {
      method: 'POST',
      body: JSON.stringify({ address, signature }),
    }),
  activity: (limit = 100, jobId?: string, caller?: string) => {
    const q = new URLSearchParams();
    q.set('limit', String(limit));
    if (jobId) q.set('jobId', jobId);
    if (caller) q.set('caller', caller);
    return json<{ events: ChainEvent[] }>(`/api/activity?${q.toString()}`);
  },
  reputation: (address: string, fresh = false) =>
    json<Reputation>(`/api/reputation?address=${address}${fresh ? '&fresh=1' : ''}`),
  activationStatus: (address: string) =>
    json<ActivationStatus>(`/api/activation/status?address=${address}`),
  activate: (address: string, names?: AgentNames) =>
    json<ActivationStatus>('/api/activation/activate', {
      method: 'POST',
      body: JSON.stringify({ address, ...names }),
    }),
  setAgentNames: (address: string, names: AgentNames) =>
    json<ActivationStatus>('/api/activation/agent-names', {
      method: 'POST',
      body: JSON.stringify({ address, ...names }),
    }),
  withdrawFromAgent: (body: {
    address: string;
    agent: 'buyer' | 'seller';
    toAddress: string;
    amountUsdc: number;
  }) =>
    json<{ accepted: boolean; txHash: string }>('/api/activation/withdraw', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  /// Circle-only: top up an agent wallet directly from the user's Circle
  /// identity DCW. The backend signs the USDC.transfer on the user's behalf,
  /// no wallet popup or chain switch needed. Web3 users use the wagmi path.
  fundAgent: (body: {
    address: string;
    agent: 'buyer' | 'seller';
    amountUsdc: number;
  }) =>
    json<{ accepted: boolean; txHash: string; agentAddress: string }>(
      '/api/activation/fund-agent',
      {
        method: 'POST',
        body: JSON.stringify(body),
      },
    ),
  /// One call for the Wallets panel: the logged-in wallet's Arc USDC (identity
  /// hub) plus each agent's Arc USDC. `agents` is null before activation.
  walletOverview: (address: string) =>
    json<{
      identity: { address: string; usdcBalance: string | null };
      agents: {
        buyer: { address: string; usdcBalance: string | null };
        seller: { address: string; usdcBalance: string | null };
      } | null;
      bridgeWallets: Record<string, { walletId: string; address: string }>;
    }>(`/api/activation/wallets?address=${address}`),
  /// Arc-USDC faucet for one of the user's own wallets (identity hub or an
  /// agent). Testnet only.
  faucet: (address: string, target: 'identity' | 'buyer' | 'seller') =>
    json<{ ok: boolean; target: string; address: string }>('/api/activation/faucet', {
      method: 'POST',
      body: JSON.stringify({ address, target }),
    }),
  /// Auto-pool native gas + USDC from Circle's faucet to any address on a CCTP
  /// source chain. Funds a web3 user's own wallet (or any address) in-app instead
  /// of sending them to faucet.circle.com. Testnet only.
  fundSource: (address: string, chain: BridgeChainKey) =>
    json<{ ok: boolean; chain: string }>('/api/activation/fund-source', {
      method: 'POST',
      body: JSON.stringify({ address, chain }),
    }),
  /// Refuel a bridge wallet with native gas + USDC from the faucet so a CCTP
  /// bridge can pay its source-chain gas. Provisions the bridge wallet for that
  /// chain if missing. Defaults to Base Sepolia. Testnet only.
  dripBridgeGas: (address: string, chain: BridgeChainKey = 'baseSepolia') =>
    json<{ ok: boolean; address: string; blockchain: string }>(
      '/api/activation/drip-bridge',
      { method: 'POST', body: JSON.stringify({ address, chain }) },
    ),
  /// KarwanVault: list every staking position for an address with state +
  /// tenure. Used by /profile StakeCard to render the position list.
  vaultPositions: (address: string) =>
    json<{
      vaultAddress: string | null;
      positions: Array<{
        positionId: string;
        principalUsdc: string;
        principalWei: string;
        depositedAt: number;
        cooldownStartedAt: number;
        claimableAt: number;
        state: 'active' | 'cooling' | 'claimed';
        tenureDays: number;
      }>;
      totalActiveUsdc: string;
      totalCoolingUsdc: string;
      /// v2.D: Sum of open insurance reservations against the owner's
      /// active positions. The free side of the Free / Reserved / Cooling
      /// split shown on /profile and /stake. Absent on pre-v2.D deployments
      /// where the vault doesn't have a reservation system; treat as '0'.
      reservedUsdc?: string;
      /// v2.D: totalActiveUsdc minus reservedUsdc, floored at zero. The
      /// portion of stake that can backstop a new deal. Same back-compat
      /// fallback — treat absent as equal to totalActiveUsdc.
      freeStakeUsdc?: string;
      cooldownDays: number;
      /// False while the backend is still scanning the vault's event log for
      /// this owner — older positions may be missing from the served set
      /// until the scan reaches head. The UI should render a syncing
      /// indicator and refetch shortly. Absent on older deploys; treat as
      /// `true` for back-compat.
      synced?: boolean;
    }>(`/api/vault/positions?address=${address}`),
  /// Circle-only vault writes. Web3 users sign deposit/withdraw/claim
  /// directly from the wallet via wagmi `writeContract`.
  vaultDeposit: (body: { address: string; amountUsdc: number }) =>
    json<{ ok: true; approveTxHash: string; depositTxHash: string }>(
      '/api/vault/deposit',
      { method: 'POST', body: JSON.stringify(body) },
    ),
  vaultRequestWithdraw: (body: { address: string; positionId: string }) =>
    json<{ ok: true; txHash: string }>('/api/vault/request-withdraw', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  vaultCancelWithdraw: (body: { address: string; positionId: string }) =>
    json<{ ok: true; txHash: string }>('/api/vault/cancel-withdraw', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  vaultClaim: (body: { address: string; positionId: string }) =>
    json<{ ok: true; txHash: string }>('/api/vault/claim', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  /// 30-day legacy recovery surface. Reads the window status (open / closing-
  /// in / closed) so the home banner and /legacy page can branch off it.
  legacyWindow: () =>
    json<{
      open: boolean;
      closesAtMs: number | null;
      daysRemaining: number | null;
      hasLegacyEscrow: boolean;
      hasLegacyVault: boolean;
      legacyEscrowAddress: string | null;
      legacyVaultAddress: string | null;
    }>('/api/legacy/window'),
  legacyDeals: (address: string) =>
    json<{
      legacyEscrowAddress: string | null;
      generations: Array<{ index: 1 | 2; legacyEscrowAddress: string }>;
      deals: Array<{
        jobId: string;
        role: 'buyer' | 'seller' | 'both';
        buyer: string;
        seller: string;
        dealAmountUsdc: string;
        state: number;
        stateLabel: 'funded' | 'settled' | 'disputed' | 'refunded' | 'unknown';
        deadlineUnix: number;
        pastDeadline: boolean;
        delivered: boolean;
        hasCancellationProposal: boolean;
        cancellationProposal?: {
          proposedBy: 'buyer' | 'seller';
          kind: string;
          reason: string;
          proposedAt: number;
        };
        createdAt: number;
        releasedUsdc: string;
        generation: 1 | 2;
      }>;
    }>(`/api/legacy/deals?address=${address}`),
  legacyDealRefund: (body: { jobId: string; address: string; role: 'buyer' }) =>
    json<{ ok: true; txHash: string }>(`/api/legacy/deals/${body.jobId}/refund`, {
      method: 'POST',
      body: JSON.stringify({ address: body.address, role: body.role }),
    }),
  legacyDealReleaseFinal: (body: { jobId: string; address: string; role: 'buyer' }) =>
    json<{ ok: true; txHash: string }>(`/api/legacy/deals/${body.jobId}/release-final`, {
      method: 'POST',
      body: JSON.stringify({ address: body.address, role: body.role }),
    }),
  legacyDealCancelPropose: (body: {
    jobId: string;
    address: string;
    role: 'buyer' | 'seller';
    reason: string;
  }) =>
    json<{ ok: true; txHash: string }>(`/api/legacy/deals/${body.jobId}/cancel-propose`, {
      method: 'POST',
      body: JSON.stringify({ address: body.address, role: body.role, reason: body.reason }),
    }),
  legacyDealCancelAccept: (body: { jobId: string; address: string; role: 'buyer' | 'seller' }) =>
    json<{ ok: true; txHash: string }>(`/api/legacy/deals/${body.jobId}/cancel-accept`, {
      method: 'POST',
      body: JSON.stringify({ address: body.address, role: body.role }),
    }),
  legacyVaultPositions: (address: string) =>
    json<{
      vaultAddress: string | null;
      positions: Array<{
        positionId: string;
        principalUsdc: string;
        depositedAt: number;
        cooldownStartedAt: number;
        claimableAt: number;
        state: 'active' | 'cooling' | 'claimed';
        generation: 1 | 2;
      }>;
      totalActiveUsdc: string;
      totalCoolingUsdc: string;
      cooldownDays: number;
      generations: Array<{
        index: 1 | 2;
        vaultAddress: string;
        cooldownDays: number;
        positionCount: number;
      }>;
    }>(`/api/legacy/vault/positions?address=${address}`),
  legacyVaultRequestWithdraw: (body: { address: string; positionId: string; generation: 1 | 2 | 3 }) =>
    json<{ ok: true; txHash: string }>('/api/legacy/vault/request-withdraw', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  legacyVaultCancelWithdraw: (body: { address: string; positionId: string; generation: 1 | 2 | 3 }) =>
    json<{ ok: true; txHash: string }>('/api/legacy/vault/cancel-withdraw', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  legacyVaultClaim: (body: { address: string; positionId: string; generation: 1 | 2 | 3 }) =>
    json<{ ok: true; txHash: string }>('/api/legacy/vault/claim', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  createDirectDeal: (body: {
    buyerAddress: string;
    /// Exactly one of sellerAddress (wallet mode) or sellerEmail (share-link
    /// mode). Email mode mints a one-shot invite token, returns { invite: { url } }
    /// in the response, and leaves the deal's seller as a sentinel until claim.
    sellerAddress?: string;
    sellerEmail?: string;
    dealAmountUsdc: number;
    deadlineDays: number;
    deadlineHours?: number;
    acceptanceWindowHours?: number;
    terms: string;
    firstReleasePct: number;
    /// Trusted-match opt-in. When true, the seller's accept panel surfaces a
    /// stake requirement and they are expected to back the deal with insurance.
    /// Default false (casual deal, no stake messaging).
    requireStake?: boolean;
    /// Stake percentage when requireStake is true. 50-100 in 5% steps.
    /// Translates to on-chain reservationBps = pct * 100.
    requireStakePct?: number;
  }) =>
    json<{
      deal: DirectDeal;
      funding: DirectDealFunding;
      invite?: { url: string; email: string };
    }>('/api/deals/direct', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  getDealInvite: (token: string) =>
    json<{
      invite: {
        token: string;
        jobId: string;
        role: 'buyer' | 'seller';
        email: string;
        expiresAt: number;
      };
      deal: {
        jobId: string;
        dealAmountUsdc: string;
        firstReleasePct: number;
        terms: string;
        deadlineUnix?: number;
        acceptanceDeadlineUnix?: number;
        inviterMasked: string;
      };
    }>(`/api/deals/invite/${token}`),
  claimDealInvite: (token: string) =>
    json<{ ok: true; jobId: string; redirectTo: string }>(
      `/api/deals/invite/${token}/claim`,
      { method: 'POST', body: JSON.stringify({}) },
    ),
  termsStatus: (address?: string | null) =>
    json<{ currentVersion: number; acceptedVersion: number | null }>(
      `/api/terms/status${address ? `?address=${address}` : ''}`,
    ),
  acceptTerms: (version: number) =>
    json<{ ok: true; version: number }>(`/api/terms/accept`, {
      method: 'POST',
      body: JSON.stringify({ version }),
    }),
  directDeals: (address: string) =>
    json<{ deals: DirectDeal[] }>(`/api/deals/direct?address=${address}`),
  directDeal: (jobId: string, caller?: string | null) =>
    json<{ deal: DirectDeal }>(withCaller(`/api/deals/direct/${jobId}`, caller)),
  acceptDirectDeal: (jobId: string, caller: string) =>
    json<{ accepted: boolean; jobId: string }>(
      `/api/deals/direct/${jobId}/accept`,
      { method: 'POST', body: JSON.stringify({ caller }) },
    ),
  markDelivered: (jobId: string, caller: string, deliveryProof?: string) =>
    json<{ accepted: boolean; jobId: string }>(
      `/api/deals/direct/${jobId}/delivered`,
      {
        method: 'POST',
        body: JSON.stringify({ caller, ...(deliveryProof ? { deliveryProof } : {}) }),
      },
    ),
  releaseDirectDeal: (jobId: string, caller: string) =>
    json<{ accepted: boolean; jobId: string; txHash: string; settled: boolean }>(
      `/api/deals/direct/${jobId}/release`,
      { method: 'POST', body: JSON.stringify({ caller }) },
    ),
  /// Seller asks the buyer for more delivery time. Off-chain handshake; stored
  /// as deal.extensionRequest until the buyer responds via respondExtension.
  requestExtension: (input: {
    jobId: string;
    caller: string;
    additionalSeconds: number;
    reason?: string;
  }) =>
    json<{ accepted: true; jobId: string; requestedAt: number }>(
      `/api/deals/direct/${input.jobId}/extension/request`,
      {
        method: 'POST',
        body: JSON.stringify({
          caller: input.caller,
          additionalSeconds: input.additionalSeconds,
          ...(input.reason ? { reason: input.reason } : {}),
        }),
      },
    ),
  /// Buyer approves or declines a pending extension request. Approve bumps
  /// deal.deadlineUnix by the requested seconds.
  respondExtension: (input: {
    jobId: string;
    caller: string;
    decision: 'approved' | 'declined';
  }) =>
    json<{
      accepted: true;
      jobId: string;
      decision: 'approved' | 'declined';
      newDeadlineUnix?: number;
    }>(`/api/deals/direct/${input.jobId}/extension/respond`, {
      method: 'POST',
      body: JSON.stringify({ caller: input.caller, decision: input.decision }),
    }),
  raiseDelayAppeal: (jobId: string, caller: string) =>
    json<{ accepted: boolean; jobId: string; raisedAt: number; responseWindowMs: number }>(
      `/api/deals/direct/${jobId}/delay-appeal`,
      { method: 'POST', body: JSON.stringify({ caller }) },
    ),
  respondToDelayAppeal: (jobId: string, caller: string, reason: string) =>
    json<{ accepted: boolean; jobId: string; respondedAt: number }>(
      `/api/deals/direct/${jobId}/delay-appeal-respond`,
      { method: 'POST', body: JSON.stringify({ caller, reason }) },
    ),
  /// Post-settlement cashout: read the per-deal context.
  cashoutInfo: (jobId: string) =>
    json<{
      jobId: string;
      sellerAddress: string;
      dealAmountUsdc: string;
      settledAt: number | null;
      legacyEscrow: boolean;
      accountKind: 'circle' | 'wallet';
      identityWallet: {
        address: string;
        arcBalanceUsdc: string | null;
        available: boolean;
      };
      sellerAgentWallet: {
        address: string | null;
        arcBalanceUsdc: string | null;
        available: boolean;
      };
    }>(`/api/cashout/${jobId}`),
  /// Direct USDC.transfer on Arc from the chosen Karwan wallet (identity
  /// or the deal's seller-agent). Use api.bridgeOut for non-Arc.
  cashoutArc: (input: {
    jobId: string;
    recipient: string;
    amountUsdc: number;
    walletKind: 'identity' | 'sellerAgent';
  }) =>
    json<{ ok: true; txHash: string; explorerUrl: string }>(
      '/api/cashout/arc-withdraw',
      { method: 'POST', body: JSON.stringify(input) },
    ),
  stillReviewing: (jobId: string, caller: string) =>
    json<{ accepted: boolean; jobId: string }>(
      `/api/deals/direct/${jobId}/still-reviewing`,
      { method: 'POST', body: JSON.stringify({ caller }) },
    ),
  appealDeal: (jobId: string, caller: string, reason?: string) =>
    json<{ accepted: boolean; jobId: string; txHash: string }>(
      `/api/deals/direct/${jobId}/appeal`,
      { method: 'POST', body: JSON.stringify({ caller, ...(reason ? { reason } : {}) }) },
    ),
  cancelDirectDeal: (jobId: string, caller: string) =>
    json<{ accepted: boolean; jobId: string; txHash: string }>(
      `/api/deals/direct/${jobId}/cancel`,
      { method: 'POST', body: JSON.stringify({ caller }) },
    ),
  proposeCancelDirectDeal: (
    jobId: string,
    caller: string,
    reason: string,
    kind:
      | 'mutual'
      | 'platform-attributed'
      | 'refund-from-dispute'
      | 'release-from-dispute' = 'mutual',
  ) =>
    json<{
      accepted: boolean;
      jobId: string;
      proposal: {
        proposedBy: 'buyer' | 'seller';
        kind:
          | 'mutual'
          | 'platform-attributed'
          | 'refund-from-dispute'
          | 'release-from-dispute';
        reason: string;
        proposedAt: number;
      };
    }>(`/api/deals/direct/${jobId}/cancel/propose`, {
      method: 'POST',
      body: JSON.stringify({ caller, reason, kind }),
    }),
  acceptCancelDirectDeal: (jobId: string, caller: string) =>
    json<{ accepted: boolean; jobId: string; txHash?: string }>(
      `/api/deals/direct/${jobId}/cancel/accept`,
      { method: 'POST', body: JSON.stringify({ caller }) },
    ),
  declineCancelDirectDeal: (jobId: string, caller: string) =>
    json<{ accepted: boolean; jobId: string }>(
      `/api/deals/direct/${jobId}/cancel/decline`,
      { method: 'POST', body: JSON.stringify({ caller }) },
    ),
  bridgeRelay: (input: {
    bridgeId: string;
    sourceDomain: number;
    sourceTxHash: string;
    amountUsdc: string;
    mintRecipient: string;
  }) =>
    json<{ accepted: boolean; bridgeId: string }>('/api/bridge/relay', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  bridgeRecheck: (bridgeId: string) =>
    json<{ status: string; mintTxHash?: string; detail?: string; error?: string }>(
      `/api/bridge/${bridgeId}/recheck`,
      { method: 'POST', body: JSON.stringify({}) },
    ),
  /// Circle-only: backend signs the CCTP burn from the user's source-chain
  /// DCW (lazy-provisioning if missing), then queues the standard relay loop
  /// for the Arc mint. Web3 users still use the wagmi-signed path in useBridge.
  bridgeCircle: (input: {
    bridgeId: string;
    address: string;
    sourceChainKey: BridgeChainKey;
    amountUsdc: number;
    mintRecipient: string;
  }) =>
    json<{
      accepted: true;
      bridgeId: string;
      // Async source pipeline: the route returns once the bridge is queued, in
      // the 'approving' stage. The burn hash arrives later over SSE, so these
      // are no longer part of the immediate response.
      status?: string;
      approveTxHash?: string | null;
      burnTxHash?: string;
      sourceAddress: string;
      sourceDomain: number;
    }>('/api/bridge/circle-bridge', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  /// App Kit bridge path. Routes through Circle's bundled SDK
  /// (@circle-fin/app-kit) instead of the hand-rolled CCTP V2 pipeline, so
  /// Solana Devnet (and any future non-EVM source) can bridge to Arc via
  /// the same UI. The forwarder broadcasts the Arc mint, no per-destination
  /// relay DCW needed. Status events flow over the same SSE channel as the
  /// hand-rolled bridges.
  bridgeCircleAppKit: (input: {
    bridgeId: string;
    address: string;
    sourceChainKey: AppKitBridgeChainKey;
    amountUsdc: number;
    mintRecipient: string;
  }) =>
    json<{
      accepted: true;
      bridgeId: string;
      sourceAddress: string;
      sourceChainKey: AppKitBridgeChainKey;
    }>('/api/bridge/circle-bridge-app-kit', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  /// Bridge OUT (Arc -> chain) for Circle accounts. Backend burns from the
  /// identity DCW on Arc, then relays the mint on the destination chain. The
  /// burn hash + mint land later over SSE.
  bridgeOut: (input: {
    bridgeId: string;
    address: string;
    destChainKey: BridgeChainKey;
    amountUsdc: number;
    recipient: string;
    /// Source wallet on Arc that will burn. Defaults to 'identity' on the
    /// backend if absent. Cashout pages pass 'sellerAgent' + sourceJobId to
    /// burn from the deal's seller-agent wallet (where released USDC lives).
    sourceKind?: 'identity' | 'sellerAgent';
    sourceJobId?: string;
  }) =>
    json<{ accepted: true; bridgeId: string; status: string; direction: 'out' }>(
      '/api/bridge/circle-bridge-out',
      { method: 'POST', body: JSON.stringify(input) },
    ),
  /// Resume a Circle bridge stuck mid source-pipeline (approving/burning) or
  /// waiting on the mint relay. Idempotent. Used by retry + auto-recheck for
  /// Circle bridges, where re-POSTing circle-bridge would 409 on the existing id.
  /// Polled by the cashout page's inline bridge progress card. Returns the
  /// current status of a bridge by id.
  bridgeStatus: (bridgeId: string) =>
    json<{
      bridgeId: string;
      direction: 'in' | 'out';
      status: string;
      amountUsdc: string;
      sourceChainKey: string | null;
      destChainKey: string | null;
      sourceTxHash: string | null;
      mintTxHash: string | null;
      approveTxId: string | null;
      burnTxId: string | null;
      error: string | null;
      createdAt: number;
      updatedAt: number;
    }>(`/api/bridge/${bridgeId}`),
  bridgeCircleResume: (bridgeId: string) =>
    json<{ status: string; mintTxHash?: string | null; error?: string }>(
      `/api/bridge/circle-bridge/${bridgeId}/resume`,
      { method: 'POST', body: JSON.stringify({}) },
    ),
  /// Returns or lazy-provisions the user's source-chain DCW address so the
  /// frontend can show "send USDC here" + a faucet link for Circle users.
  /// Accepts both the hand-rolled CCTP chains and App Kit chains (Solana
  /// Devnet today). The backend provisions on read for any supported key.
  bridgeCircleSourceAddress: (address: string, sourceChainKey: AppKitBridgeChainKey) =>
    json<{ address: string; blockchain: string }>(
      `/api/bridge/circle-source-address?address=${address}&sourceChainKey=${sourceChainKey}`,
    ),
  /// Richer than bridgeCircleSourceAddress: returns the source-chain DCW
  /// address plus its live USDC and native-gas balances so the bridge card can
  /// show a funded/empty state. usdcBalance/gasBalance are null when the
  /// on-chain balance read failed (transient RPC); the address still returns.
  bridgeWalletStatus: (address: string, sourceChainKey: BridgeChainKey) =>
    json<{
      bridgeWalletAddress: string;
      sourceChainKey: BridgeChainKey;
      usdcBalance: string | null;
      gasBalance: string | null;
    }>(
      `/api/bridge/circle-bridge/wallet?address=${address}&sourceChainKey=${sourceChainKey}`,
    ),
  listMessages: (jobId: string, caller: string) =>
    json<{ messages: ChatMessage[] }>(`/api/chat/${jobId}?caller=${caller}`),
  sendMessage: (jobId: string, caller: string, body: string) =>
    json<{ message: ChatMessage }>(`/api/chat/${jobId}`, {
      method: 'POST',
      body: JSON.stringify({ caller, body }),
    }),
  telegramStatus: (address: string) =>
    json<TelegramStatus>(`/api/telegram/status?address=${address}`),
  telegramLinkStart: (address: string) =>
    json<{ token: string; deepLink: string | null; botUsername: string | null }>(
      '/api/telegram/link/start',
      { method: 'POST', body: JSON.stringify({ address }) },
    ),
  telegramLinkRemove: (address: string) =>
    json<{ ok: true }>('/api/telegram/link/remove', {
      method: 'POST',
      body: JSON.stringify({ address }),
    }),
};

export interface ChatMessage {
  id: string;
  jobId: string;
  sender: string;
  body: string;
  ts: number;
}

export interface TelegramStatus {
  enabled: boolean;
  botUsername: string | null;
  linked: boolean;
  chatId: number | null;
  username: string | null;
  linkedAt: number | null;
}
