import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { eq, or, desc } from 'drizzle-orm';
import { db, pgEnabled } from './client.js';
import { matchProposals as matchProposalsTable } from './schema.js';

const STORE_PATH = resolve(process.cwd(), 'data', 'match-proposals.json');

/// Agent-proposed match awaiting human approval. Lives until approved or
/// declined. Persisted now (was an in-memory Map) so a backend restart
/// mid-approval doesn't lose pending proposals: when a public campaign is
/// running this was the most embarrassing failure mode (user opens the
/// approve banner, agent crashes / deploys, banner vanishes).
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
  /// Deterministic risk classification from agents/signals.ts (honey-trap,
  /// lowball, spammy) OR a seller-side flag from adjustBidByTier when the
  /// buyer is NEW-tier (new-buyer). When set, the MatchBanner renders a
  /// plain-language warning so the seller can judge before accepting.
  /// Never causes auto-decline. the human is the gate.
  riskFlag?: 'honey-trap' | 'lowball' | 'spammy' | 'new-buyer';
  /// Short human-readable explanation paired with the riskFlag.
  riskNote?: string;
}

export async function getMatchProposal(jobId: string): Promise<MatchProposal | null> {
  const key = jobId.toLowerCase();
  if (pgEnabled) {
    const rows = await db()
      .select()
      .from(matchProposalsTable)
      .where(eq(matchProposalsTable.jobId, key));
    return rows[0]?.data ?? null;
  }
  return loadFile()[key] ?? null;
}

export async function upsertMatchProposal(proposal: MatchProposal): Promise<MatchProposal> {
  const next: MatchProposal = {
    ...proposal,
    jobId: proposal.jobId.toLowerCase(),
    buyerUser: proposal.buyerUser.toLowerCase(),
    buyerAgent: proposal.buyerAgent.toLowerCase(),
    sellerUser: proposal.sellerUser.toLowerCase(),
    sellerAgent: proposal.sellerAgent.toLowerCase(),
  };
  if (pgEnabled) {
    await db()
      .insert(matchProposalsTable)
      .values({
        jobId: next.jobId,
        buyerUser: next.buyerUser,
        sellerUser: next.sellerUser,
        proposedAt: next.proposedAt,
        data: next,
      })
      .onConflictDoUpdate({
        target: matchProposalsTable.jobId,
        set: {
          buyerUser: next.buyerUser,
          sellerUser: next.sellerUser,
          proposedAt: next.proposedAt,
          data: next,
        },
      });
    return next;
  }
  const store = loadFile();
  store[next.jobId] = next;
  saveFile(store);
  return next;
}

export async function listMatchProposalsForUser(
  userAddress: string,
): Promise<MatchProposal[]> {
  const a = userAddress.toLowerCase();
  if (pgEnabled) {
    const rows = await db()
      .select()
      .from(matchProposalsTable)
      .where(or(eq(matchProposalsTable.buyerUser, a), eq(matchProposalsTable.sellerUser, a)))
      .orderBy(desc(matchProposalsTable.proposedAt));
    return rows.map((r) => r.data);
  }
  return Object.values(loadFile())
    .filter((p) => p.buyerUser === a || p.sellerUser === a)
    .sort((x, y) => y.proposedAt - x.proposedAt);
}

export async function listAllMatchProposals(): Promise<MatchProposal[]> {
  if (pgEnabled) {
    const rows = await db()
      .select()
      .from(matchProposalsTable)
      .orderBy(desc(matchProposalsTable.proposedAt));
    return rows.map((r) => r.data);
  }
  return Object.values(loadFile()).sort((x, y) => y.proposedAt - x.proposedAt);
}

/// True when a pending (not-yet-approved-or-declined) proposal exists for
/// the job. Used by `jobExpiryWatcher` to leave human-gated jobs alone past
/// their deadline. Lightweight existence check; avoids loading the full row.
export async function hasPendingProposal(jobId: string): Promise<boolean> {
  const proposal = await getMatchProposal(jobId);
  if (!proposal) return false;
  return !proposal.approvedAt && !proposal.declinedAt;
}

/// Removes every match proposal where the address is on either side. Used by
/// the admin reset-history endpoint for test cleanup.
export async function deleteMatchProposalsInvolvingAddress(
  addressLower: string,
): Promise<number> {
  const target = addressLower.toLowerCase();
  if (pgEnabled) {
    const rows = await db()
      .select()
      .from(matchProposalsTable)
      .where(
        or(
          eq(matchProposalsTable.buyerUser, target),
          eq(matchProposalsTable.sellerUser, target),
        ),
      );
    for (const r of rows) {
      await db()
        .delete(matchProposalsTable)
        .where(eq(matchProposalsTable.jobId, r.jobId));
    }
    return rows.length;
  }
  const store = loadFile();
  let removed = 0;
  for (const [k, v] of Object.entries(store)) {
    if (
      v.buyerUser.toLowerCase() === target ||
      v.sellerUser.toLowerCase() === target
    ) {
      delete store[k];
      removed += 1;
    }
  }
  if (removed > 0) saveFile(store);
  return removed;
}

// --- flat-file fallback ---

function ensureFile() {
  const dir = dirname(STORE_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  if (!existsSync(STORE_PATH)) writeFileSync(STORE_PATH, '{}', 'utf8');
}

function loadFile(): Record<string, MatchProposal> {
  ensureFile();
  try {
    return JSON.parse(readFileSync(STORE_PATH, 'utf8')) as Record<string, MatchProposal>;
  } catch {
    return {};
  }
}

function saveFile(store: Record<string, MatchProposal>) {
  ensureFile();
  writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), 'utf8');
}
