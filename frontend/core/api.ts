import type {
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
} from '@simplewebauthn/browser';

const BASE = process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:8787';

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
  /// renders read-only when set — the auction is over.
  expiredAt?: number;
  bids: BuyerBid[];
  lastCounterPriceBySeller: Record<string, string>;
  counterRoundsBySeller: Record<string, number>;
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

export interface UserProfile {
  address: string;
  role: UserRole;
  displayName: string;
  createdAt: number;
  updatedAt: number;
  xHandle?: string;
  xUserId?: string;
  xProfileImageUrl?: string;
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

export interface Listing {
  id: string;
  sellerUser: string;
  sellerAgent: string;
  title: string;
  description: string;
  askingPriceUsdc: number;
  negotiationMaxDecreasePct?: number;
  postedAt: number;
  matchedAt?: number;
  matchedJobId?: string;
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
  riskFlag?: 'honey-trap' | 'lowball' | 'spammy';
  riskNote?: string;
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
  scoreBps: number;
  successCount: number;
  disputedCount: number;
  failedCount: number;
  totalDeals: number;
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
  job: (id: string) => json<BuyerJob>(`/api/jobs/${id}`),
  matchProposal: (jobId: string) =>
    json<{ proposal: MatchProposal | null }>(`/api/jobs/${jobId}/match`),
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
  listings: () => json<{ listings: Listing[] }>('/api/listings'),
  listingsForSeller: (address: string) =>
    json<{ listings: Listing[] }>(`/api/listings/mine?address=${address}`),
  getListing: (id: string, caller?: string) => {
    const q = caller ? `?caller=${caller}` : '';
    return json<{ listing: Listing; floor?: number; viewerIsOwner?: boolean }>(
      `/api/listings/${id}${q}`,
    );
  },
  marketplaceBriefs: () =>
    json<{ briefs: MarketplaceBrief[] }>(`/api/jobs/marketplace`),
  postListing: (body: {
    sellerUser: string;
    title: string;
    description: string;
    askingPriceUsdc: number;
    negotiationMaxDecreasePct?: number;
  }) =>
    json<{ listing: Listing }>('/api/listings', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  dealsFeed: () => json<{ deals: DirectDeal[] }>('/api/deals/feed'),
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
      } | null;
    }>('/api/auth/me'),
  authLogout: () => json<{ ok: boolean }>('/api/auth/logout', { method: 'POST' }),
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
  createDirectDeal: (body: {
    buyerAddress: string;
    sellerAddress: string;
    dealAmountUsdc: number;
    deadlineDays: number;
    terms: string;
    firstReleasePct: number;
  }) =>
    json<{ deal: DirectDeal; funding: DirectDealFunding }>('/api/deals/direct', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  directDeals: (address: string) =>
    json<{ deals: DirectDeal[] }>(`/api/deals/direct?address=${address}`),
  directDeal: (jobId: string) =>
    json<{ deal: DirectDeal }>(`/api/deals/direct/${jobId}`),
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
