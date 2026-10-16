import { ApiError, type WorldCheckReason } from '@/core/api';

const REASONS: readonly WorldCheckReason[] = ['first_deal', 'large_deal', 'fast_new_account', 'flagged_link_before'];

/// Reads the server's "confirm with World ID first" answer to a choose, or null
/// for any other failure.
export function worldStepFrom(err: unknown): { reason: WorldCheckReason | null; skipAllowed: boolean } | null {
  if (!(err instanceof ApiError) || err.code !== 'WORLD_ID_REQUIRED') return null;
  const body = (err.body ?? {}) as { reason?: unknown; skipAllowed?: unknown };
  const reason = REASONS.find((r) => r === body.reason) ?? null;
  return { reason, skipAllowed: body.skipAllowed === true };
}
