import type { LockWho } from './agentRecord.js';
import { lockAfter, type Mandate, type MandatePatch } from './mandate.js';

/// Whether a change lets the agent lock money where it could not before, or
/// lock more (view 87). Such a change is confirmed with the passkey; lowering,
/// narrowing and turning off never are. Pure.

const WHO_RANK: Record<LockWho, number> = { verified: 0, record: 1, anyone: 2 };
const micros = (usdc: number) => Math.round(usdc * 1e6);

export function widens(before: Pick<Mandate, 'lock'>, patch: MandatePatch): boolean {
  if (patch.part === 'switch') return patch.name === 'lock' && patch.on;
  if (patch.part !== 'lock-rules') return false;
  if (patch.on) return true;
  const after = lockAfter(before, patch);
  const was = before.lock;
  if (!after) return false;
  // Limits set for the first time are confirmed when they are set, not when used.
  if (!was) return true;
  return (
    micros(after.perDeal.usdc) > micros(was.perDeal.usdc) ||
    micros(after.perWeek.usdc) > micros(was.perWeek.usdc) ||
    after.perDay > was.perDay ||
    WHO_RANK[after.who] > WHO_RANK[was.who]
  );
}
