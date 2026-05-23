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
  deadlineUnix: number;
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
  cancelKind?: 'mutual' | 'platform-attributed' | 'unilateral' | 'pre-accept';
  cancelReason?: string;
  cancellationProposal?: {
    proposedBy: 'buyer' | 'seller';
    kind: 'mutual' | 'platform-attributed';
    reason: string;
    proposedAt: number;
  };
  autoReleasedAt?: number;
  settledAt?: number;
  fundTxHash?: string;
  createdAt: number;
  updatedAt: number;
  reviewWindowMs?: number;
  onChain: DirectDealOnChain | null;
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

export interface DirectDealFunding {
  dealAmountUsdc: string;
  fundedAmountUsdc: string;
  sellerNetUsdc: string;
  feeTotalUsdc: string;
}

export interface ActivationStatus {
  activated: boolean;
  agents?: { buyer: string; seller: string };
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
    const message =
      typeof parsed === 'object' && parsed && 'error' in parsed
        ? String((parsed as { error: unknown }).error)
        : String(parsed);
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
  activity: (limit = 100, jobId?: string, caller?: string) => {
    const q = new URLSearchParams();
    q.set('limit', String(limit));
    if (jobId) q.set('jobId', jobId);
    if (caller) q.set('caller', caller);
    return json<{ events: ChainEvent[] }>(`/api/activity?${q.toString()}`);
  },
  reputation: (address: string) =>
    json<Reputation>(`/api/reputation?address=${address}`),
  activationStatus: (address: string) =>
    json<ActivationStatus>(`/api/activation/status?address=${address}`),
  activate: (address: string) =>
    json<ActivationStatus>('/api/activation/activate', {
      method: 'POST',
      body: JSON.stringify({ address }),
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
      cooldownDays: number;
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
  createDirectDeal: (body: {
    buyerAddress: string;
    sellerAddress: string;
    dealAmountUsdc: number;
    deadlineDays: number;
    deadlineHours?: number;
    terms: string;
    firstReleasePct: number;
  }) =>
    json<{ deal: DirectDeal; funding: DirectDealFunding }>('/api/deals/direct', {
      method: 'POST',
      body: JSON.stringify(body),
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
    kind: 'mutual' | 'platform-attributed' = 'mutual',
  ) =>
    json<{
      accepted: boolean;
      jobId: string;
      proposal: {
        proposedBy: 'buyer' | 'seller';
        kind: 'mutual' | 'platform-attributed';
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
  /// Bridge OUT (Arc -> chain) for Circle accounts. Backend burns from the
  /// identity DCW on Arc, then relays the mint on the destination chain. The
  /// burn hash + mint land later over SSE.
  bridgeOut: (input: {
    bridgeId: string;
    address: string;
    destChainKey: BridgeChainKey;
    amountUsdc: number;
    recipient: string;
  }) =>
    json<{ accepted: true; bridgeId: string; status: string; direction: 'out' }>(
      '/api/bridge/circle-bridge-out',
      { method: 'POST', body: JSON.stringify(input) },
    ),
  /// Resume a Circle bridge stuck mid source-pipeline (approving/burning) or
  /// waiting on the mint relay. Idempotent. Used by retry + auto-recheck for
  /// Circle bridges, where re-POSTing circle-bridge would 409 on the existing id.
  bridgeCircleResume: (bridgeId: string) =>
    json<{ status: string; mintTxHash?: string | null; error?: string }>(
      `/api/bridge/circle-bridge/${bridgeId}/resume`,
      { method: 'POST', body: JSON.stringify({}) },
    ),
  /// Returns or lazy-provisions the user's source-chain DCW address so the
  /// frontend can show "send USDC here" + a faucet link for Circle users.
  bridgeCircleSourceAddress: (address: string, sourceChainKey: BridgeChainKey) =>
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
