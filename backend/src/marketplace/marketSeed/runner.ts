import { interleave, SEED_PREFIX, type AccountPlan, type SeedOffer, type SeedRequest } from './plan.js';

/// What the runner needs from the rest of the backend. Injected so the ordering,
/// resume and failure rules are tested without Circle or the chain.
export interface SeedDeps {
  resolveAccount(email: string): Promise<SeedAccount | { missing: string }>;
  offerExists(seedKey: string): boolean;
  createOffer(account: SeedAccount, offer: SeedOffer): void;
  requestExists(seedKey: string): boolean;
  postRequest(account: SeedAccount, request: SeedRequest): Promise<{ ok: true } | { ok: false; reason: string }>;
  sleep(ms: number): Promise<void>;
}

export interface SeedAccount {
  address: string;
  sellerAgent: string;
  buyerReady: boolean;
  sellerReady: boolean;
}

export interface SeedStatus {
  state: 'idle' | 'running' | 'done' | 'stopped';
  startedAt?: number;
  finishedAt?: number;
  total: number;
  created: number;
  alreadyPresent: number;
  failed: number;
  failures: Array<{ seedKey: string; reason: string }>;
}

/// Pause between on-chain request posts so Circle's rate limits never trip.
export const REQUEST_GAP_MS = 1_500;
/// An account whose requests keep failing (usually an empty buyer agent) stops
/// posting requests for the rest of the run; its offers still go up.
export const MAX_REQUEST_FAILURES_PER_ACCOUNT = 3;
const MAX_FAILURES_KEPT = 50;

let status: SeedStatus = { state: 'idle', total: 0, created: 0, alreadyPresent: 0, failed: 0, failures: [] };
let stopRequested = false;

export function seedStatus(): SeedStatus {
  return { ...status, failures: [...status.failures] };
}

export function requestStop(): void {
  stopRequested = true;
}

export function isSeedKey(seedKey: string | undefined): boolean {
  return !!seedKey && seedKey.startsWith(SEED_PREFIX);
}

function fail(seedKey: string, reason: string): void {
  status.failed += 1;
  if (status.failures.length < MAX_FAILURES_KEPT) status.failures.push({ seedKey, reason });
}

/// Posts the plan in its mixed order. Safe to run again: anything already
/// present is skipped, so a restart or a stop simply resumes.
export async function runSeed(plan: readonly AccountPlan[], deps: SeedDeps): Promise<SeedStatus> {
  if (status.state === 'running') throw new Error('a seeding run is already in progress');
  stopRequested = false;
  const items = interleave(plan);
  status = { state: 'running', startedAt: Date.now(), total: items.length, created: 0, alreadyPresent: 0, failed: 0, failures: [] };

  const accounts = new Map<number, SeedAccount | null>();
  const requestFailures = new Map<number, number>();
  for (const a of plan) {
    const resolved = await deps.resolveAccount(a.email);
    accounts.set(a.account, 'missing' in resolved ? null : resolved);
  }

  try {
    for (const item of items) {
      if (stopRequested) {
        status.state = 'stopped';
        return seedStatus();
      }
      const account = accounts.get(item.account);
      if (!account) {
        fail(item.seedKey, 'account not ready');
        continue;
      }
      if (item.kind === 'offer') {
        if (deps.offerExists(item.seedKey)) {
          status.alreadyPresent += 1;
          continue;
        }
        if (!account.sellerReady) {
          fail(item.seedKey, 'seller agent not ready');
          continue;
        }
        deps.createOffer(account, item);
        status.created += 1;
        continue;
      }
      if (deps.requestExists(item.seedKey)) {
        status.alreadyPresent += 1;
        continue;
      }
      if (!account.buyerReady || (requestFailures.get(item.account) ?? 0) >= MAX_REQUEST_FAILURES_PER_ACCOUNT) {
        fail(item.seedKey, account.buyerReady ? 'requests paused after repeated failures' : 'buyer agent not ready');
        continue;
      }
      const result = await deps.postRequest(account, item);
      if (result.ok) {
        status.created += 1;
        requestFailures.set(item.account, 0);
      } else {
        fail(item.seedKey, result.reason);
        requestFailures.set(item.account, (requestFailures.get(item.account) ?? 0) + 1);
      }
      await deps.sleep(REQUEST_GAP_MS);
    }
    status.state = 'done';
  } finally {
    if (status.state === 'running') status.state = 'stopped';
    status.finishedAt = Date.now();
  }
  return seedStatus();
}

export const __test = {
  reset(): void {
    status = { state: 'idle', total: 0, created: 0, alreadyPresent: 0, failed: 0, failures: [] };
    stopRequested = false;
  },
};
