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
  jobBuyer: string;
  budgetUsdc: string;
  deadlineUnix: number;
  lastBidPrice: string;
  counterRounds: number;
  finalized: boolean;
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
  ) {
    super(message);
  }
}

async function json<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
    cache: 'no-store',
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
    throw new ApiError(res.status, message, detail);
  }
  return res.json() as Promise<T>;
}

export const api = {
  baseUrl: BASE,
  eventsUrl: () => `${BASE}/api/events`,
  status: () => json<ApiStatus>('/api/agents/status'),
  buyer: () =>
    json<{ profile: BuyerAgentProfile; jobs: BuyerJob[] }>('/api/agents/buyer'),
  seller: () =>
    json<{ profile: SellerAgentProfile; activeBids: SellerActiveBid[] }>('/api/agents/seller'),
  job: (id: string) => json<BuyerJob>(`/api/jobs/${id}`),
  postJob: (body: { brief: string; budgetUsdc: number; deadlineDays: number }) =>
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
  activity: (limit = 100, jobId?: string) => {
    const q = new URLSearchParams();
    q.set('limit', String(limit));
    if (jobId) q.set('jobId', jobId);
    return json<{ events: ChainEvent[] }>(`/api/activity?${q.toString()}`);
  },
};
