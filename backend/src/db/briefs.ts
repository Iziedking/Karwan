// Off-chain brief metadata keyed by on-chain jobId. The on-chain JobBoard only
// stores termsHash for integrity; this side-store carries the human-readable
// brief plus negotiation knobs (tolerance, keywords) the agents consult when
// scoring and counter-evaluating. Persisted to a flat file so brief text
// survives backend restarts (Postgres-backed in a future iteration).

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { logger } from '../logger.js';

export interface Brief {
  jobId: string;
  briefText: string;
  postedBy: string;
  negotiationMaxIncreasePct?: number;
  keywords?: string[];
  /// Per-brief milestone split (percentages summing to 100). When the buyer
  /// states one in the request ("I pay 30% then 70%") it overrides the buyer
  /// profile's default split at escrow funding. Absent means the profile
  /// default is used. The managed flow funds a two-part split, so only a
  /// length-2 value takes effect downstream.
  milestonePcts?: number[];
  createdAt: number;
  /// Set by jobExpiryWatcher when a brief passes its deadline with no
  /// accepted bid + no approved match proposal. Survives backend restarts so
  /// the buyer agent doesn't restart bid collection for an expired job.
  expiredAt?: number;
  /// Buyer opted into Trusted Match for this brief. The agent loop weights
  /// seller reputation + stake above price, and gates bids on seller free
  /// stake covering the deal's insurance reservation. For higher-value or
  /// one-shot deals where the buyer can't redo the trade if the seller is a
  /// no-show. Defaults to false (Normal mode).
  trustedMatch?: boolean;
  /// Match lane this brief belongs to. 'service' is the single-service P2P
  /// flow, open to every account type; 'finance' is the SME/B2B trade-finance
  /// flow, restricted to verified businesses on both sides. Stamped once at
  /// post time from the poster's accountType + tradeType; matching filters on
  /// this value so service and finance pools never cross. Absent reads as
  /// 'service' to preserve legacy briefs.
  tradeLane?: 'service' | 'finance';
  /// The poster's account type at post time, so a match can badge business
  /// involvement without a second profile read. Absent reads as 'person'.
  partyKind?: 'person' | 'business';
  /// SME trade-finance metadata. Snapshotted at post time so the buyer
  /// agent + downstream surfaces read the trade context without re-querying.
  /// Absent on legacy service-flow briefs.
  tradeType?: 'service' | 'goods' | 'mixed';
  incoterms?: 'EXW' | 'FCA' | 'FOB' | 'CIF' | 'DAP' | 'DDP';
  paymentTerms?: 'immediate' | 'net30' | 'net60' | 'net90';
  counterpartyCompany?: {
    name?: string;
    sector?: string;
    region?: string;
  };
  documentRefs?: Array<{
    hash: string;
    kind: 'invoice' | 'po' | 'bol' | 'coo' | 'pod' | 'other';
    label?: string;
  }>;
}

const STORE_PATH = resolve(process.cwd(), 'data', 'briefs.json');
const store = new Map<string, Brief>();
let loaded = false;

function load(): void {
  if (loaded) return;
  loaded = true;
  if (!existsSync(STORE_PATH)) return;
  try {
    const raw = readFileSync(STORE_PATH, 'utf8');
    const obj = JSON.parse(raw) as Record<string, Brief>;
    for (const [k, v] of Object.entries(obj)) store.set(k, v);
    logger.info({ count: store.size }, 'briefs loaded from disk');
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'briefs load failed, starting empty');
  }
}

function persist(): void {
  try {
    const dir = dirname(STORE_PATH);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const obj: Record<string, Brief> = {};
    for (const [k, v] of store.entries()) obj[k] = v;
    writeFileSync(STORE_PATH, JSON.stringify(obj, null, 2), 'utf8');
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'briefs persist failed');
  }
}

export function getBrief(jobId: string): Brief | null {
  load();
  return store.get(jobId.toLowerCase()) ?? null;
}

export function createBrief(input: Omit<Brief, 'createdAt'>): Brief {
  load();
  const brief: Brief = {
    ...input,
    jobId: input.jobId.toLowerCase(),
    postedBy: input.postedBy.toLowerCase(),
    createdAt: Date.now(),
  };
  store.set(brief.jobId, brief);
  persist();
  return brief;
}

export function patchBrief(jobId: string, patch: Partial<Brief>): Brief | null {
  load();
  const existing = store.get(jobId.toLowerCase());
  if (!existing) return null;
  const next = { ...existing, ...patch };
  store.set(existing.jobId, next);
  persist();
  return next;
}

/// Remove a single brief. Used when a job's on-chain postJob reverted inside a
/// successful handleOps wrapper: the brief was persisted in anticipation of the
/// post, but no job exists on chain, so the anticipatory brief must not linger
/// as a ghost market entry that no agent will ever bid on.
export function deleteBrief(jobId: string): boolean {
  load();
  const key = jobId.toLowerCase();
  if (!store.has(key)) return false;
  store.delete(key);
  persist();
  return true;
}

/// Read all stored briefs. Used by aggregators (reputation spam detector,
/// marketplace surface). The in-memory store is small (one entry per posted
/// brief), so a full scan is cheap.
export function listAllBriefs(): Brief[] {
  load();
  return Array.from(store.values());
}

/// Removes every brief posted by `addressLower`. Used by the admin
/// reset-history endpoint so an operator can clear test pollution for a
/// single wallet without wiping the whole flat-file store.
export function deleteBriefsByPoster(addressLower: string): number {
  load();
  const target = addressLower.toLowerCase();
  let removed = 0;
  for (const [k, v] of store.entries()) {
    if (v.postedBy.toLowerCase() === target) {
      store.delete(k);
      removed += 1;
    }
  }
  if (removed > 0) persist();
  return removed;
}
