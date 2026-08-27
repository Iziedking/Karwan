import { getProfile, upsertProfile } from '../db/profiles.js';

/// Per-account "agent research" activation + prepaid credit. The user pays a
/// one-time fee in USDC on Arc; it becomes a credit the agent draws down each
/// time it pays for live market research (~$0.007/call). When the credit runs
/// out the account goes inactive until topped up. UI copy calls this "agent
/// research"; "x402" only appears in developer docs.

/// One-time activation / top-up fee, in USDC. The shared market read is fronted
/// by the platform and only billed back to the matched pair at sub-cent per
/// deal, so a single activation still covers a long run of deals.
export const RESEARCH_ACTIVATION_USDC = 1.5;

function round6(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

export interface ResearchState {
  active: boolean;
  creditUsdc: number;
}

// Four Exa angles settle in parallel. Serialise credit mutations per owner so
// concurrent read receipts cannot all observe the same stale balance and
// overwrite one another.
const chargeQueues = new Map<string, Promise<void>>();

/// Whether the owner's agent may pay for research right now: activated AND
/// still in credit. Reads as inactive for an unknown profile.
export async function getResearchState(owner: string): Promise<ResearchState> {
  const p = await getProfile(owner).catch(() => null);
  const credit = p?.research?.creditUsdc ?? 0;
  return { active: !!p?.research?.active && credit > 0, creditUsdc: round6(credit) };
}

/// Add `addUsd` of credit and mark active. Used right after the activation fee
/// settles. Requires an existing profile.
export async function activateResearch(owner: string, addUsd: number): Promise<ResearchState> {
  const p = await getProfile(owner);
  if (!p) throw new Error('no profile to activate research on');
  const prev = p.research?.creditUsdc ?? 0;
  const research = {
    active: true,
    creditUsdc: round6(prev + addUsd),
    activatedAt: p.research?.activatedAt ?? Date.now(),
    lastChargedAt: p.research?.lastChargedAt,
  };
  await upsertProfile({ ...p, research });
  return { active: research.active, creditUsdc: research.creditUsdc };
}

/// Decrement the credit by a real research spend. Deactivates when it hits
/// zero. No-op for an account that never activated.
export function chargeResearch(owner: string, usd: number): Promise<void> {
  if (usd <= 0) return Promise.resolve();
  const key = owner.toLowerCase();
  const previous = chargeQueues.get(key) ?? Promise.resolve();
  const next = previous
    .catch(() => undefined)
    .then(async () => {
      const p = await getProfile(key);
      if (!p?.research) return;
      const creditUsdc = Math.max(0, round6((p.research.creditUsdc ?? 0) - usd));
      await upsertProfile({
        ...p,
        research: {
          ...p.research,
          creditUsdc,
          active: creditUsdc > 0,
          lastChargedAt: Date.now(),
        },
      });
    })
    .finally(() => {
      if (chargeQueues.get(key) === next) chargeQueues.delete(key);
    });
  chargeQueues.set(key, next);
  return next;
}
