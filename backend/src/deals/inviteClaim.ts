export type InviteClaimState = {
  usedAt?: number;
  usedByAddress?: string;
  claimingAt?: number;
  claimingByAddress?: string;
  claimLeaseUntil?: number;
};

export type ReserveInviteClaimResult =
  | { ok: true; next: InviteClaimState }
  | { ok: false; code: 'CLAIMED' | 'IN_PROGRESS' };

const DEFAULT_LEASE_MS = 2 * 60_000;

export function reserveInviteClaim(
  current: InviteClaimState,
  address: string,
  now = Date.now(),
  leaseMs = DEFAULT_LEASE_MS,
): ReserveInviteClaimResult {
  if (current.usedAt) return { ok: false, code: 'CLAIMED' };
  if (current.claimingByAddress && (current.claimLeaseUntil ?? 0) > now) {
    return { ok: false, code: 'IN_PROGRESS' };
  }
  return {
    ok: true,
    next: {
      ...current,
      claimingAt: now,
      claimingByAddress: address.toLowerCase(),
      claimLeaseUntil: now + leaseMs,
    },
  };
}

export function completeInviteClaim(
  current: InviteClaimState,
  address: string,
  now = Date.now(),
): InviteClaimState | null {
  if (current.usedAt) return current.usedByAddress?.toLowerCase() === address.toLowerCase() ? current : null;
  if (current.claimingByAddress?.toLowerCase() !== address.toLowerCase()) return null;
  return {
    ...current,
    usedAt: now,
    usedByAddress: address.toLowerCase(),
    claimingAt: undefined,
    claimingByAddress: undefined,
    claimLeaseUntil: undefined,
  };
}

export function releaseInviteClaim(current: InviteClaimState, address: string): InviteClaimState | null {
  if (current.claimingByAddress?.toLowerCase() !== address.toLowerCase()) return null;
  return {
    ...current,
    claimingAt: undefined,
    claimingByAddress: undefined,
    claimLeaseUntil: undefined,
  };
}
