import { config } from '../config.js';
import { legacyEscrowAddress, legacyVaultAddress } from './contracts.js';

/// Single source of truth for the 30-day legacy recovery window. Anything
/// gated by the window (home banner, /legacy page, /api/legacy/* writes)
/// consults these helpers so the cutoff flips uniformly across the product.

export interface LegacyWindow {
  /// True between today and LEGACY_WINDOW_CLOSES_AT, AND only when at least
  /// one legacy contract address is configured. Both halves of the surface
  /// can be enabled independently (stake-only or deals-only) by leaving the
  /// other env var blank.
  open: boolean;
  closesAtMs: number | null;
  /// Whole days remaining (floored). 0 on the closing day. Negative once
  /// closed — used to render "closed Nd ago" copy if the page is reached
  /// after the cutoff.
  daysRemaining: number | null;
  hasLegacyEscrow: boolean;
  hasLegacyVault: boolean;
}

export function getLegacyWindow(now: number = Date.now()): LegacyWindow {
  const closesAtIso = (config as unknown as Record<string, string | undefined>)
    .LEGACY_WINDOW_CLOSES_AT;
  const closesAtMs = closesAtIso ? new Date(closesAtIso).getTime() : null;
  const hasLegacyEscrow = legacyEscrowAddress !== null;
  const hasLegacyVault = legacyVaultAddress !== null;
  const stillOpen = closesAtMs !== null && now < closesAtMs;
  return {
    open: stillOpen && (hasLegacyEscrow || hasLegacyVault),
    closesAtMs,
    daysRemaining:
      closesAtMs === null
        ? null
        : Math.floor((closesAtMs - now) / 86_400_000),
    hasLegacyEscrow,
    hasLegacyVault,
  };
}
