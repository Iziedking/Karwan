import { config } from '../config.js';
import { legacyGenerations } from './contracts.js';

/// Single source of truth for the 30-day legacy recovery windows. Each
/// generation runs its own clock; the composite `getLegacyWindow()` returns
/// the union (open if any gen is open, closesAtMs = the earliest still-open
/// deadline so the banner pushes toward the soonest cutoff).

export interface LegacyGenerationWindow {
  index: 1 | 2;
  /// True between today and this generation's CLOSES_AT, AND only when at
  /// least one of its contracts (vault or escrow) is configured.
  open: boolean;
  closesAtMs: number | null;
  daysRemaining: number | null;
  hasLegacyEscrow: boolean;
  hasLegacyVault: boolean;
}

export interface LegacyWindow {
  /// True when ANY generation is open. Drives the home banner.
  open: boolean;
  /// Earliest still-open closes-at across all generations. Renders the most
  /// urgent countdown on the banner.
  closesAtMs: number | null;
  daysRemaining: number | null;
  /// Aggregated flags for backward compat with the existing /window response.
  hasLegacyEscrow: boolean;
  hasLegacyVault: boolean;
  /// Per-generation detail for the /legacy page renderer.
  generations: LegacyGenerationWindow[];
}

function envAsRecord(): Record<string, string | undefined> {
  return config as unknown as Record<string, string | undefined>;
}

function closesAtForGeneration(index: 1 | 2): number | null {
  const env = envAsRecord();
  const iso = index === 1 ? env.LEGACY_WINDOW_CLOSES_AT : env.LEGACY_WINDOW_CLOSES_AT_2;
  return iso ? new Date(iso).getTime() : null;
}

export function getLegacyGenerations(now: number = Date.now()): LegacyGenerationWindow[] {
  return legacyGenerations.map((gen) => {
    const closesAtMs = closesAtForGeneration(gen.index);
    const hasLegacyEscrow = gen.escrowAddress !== null;
    const hasLegacyVault = gen.vaultAddress !== null;
    const stillOpen = closesAtMs !== null && now < closesAtMs;
    return {
      index: gen.index,
      open: stillOpen && (hasLegacyEscrow || hasLegacyVault),
      closesAtMs,
      daysRemaining:
        closesAtMs === null ? null : Math.floor((closesAtMs - now) / 86_400_000),
      hasLegacyEscrow,
      hasLegacyVault,
    };
  });
}

export function getLegacyWindow(now: number = Date.now()): LegacyWindow {
  const generations = getLegacyGenerations(now);
  const open = generations.some((g) => g.open);
  const openDeadlines = generations
    .filter((g) => g.open && g.closesAtMs !== null)
    .map((g) => g.closesAtMs as number);
  const closesAtMs = openDeadlines.length > 0 ? Math.min(...openDeadlines) : null;
  return {
    open,
    closesAtMs,
    daysRemaining:
      closesAtMs === null ? null : Math.floor((closesAtMs - now) / 86_400_000),
    hasLegacyEscrow: generations.some((g) => g.hasLegacyEscrow),
    hasLegacyVault: generations.some((g) => g.hasLegacyVault),
    generations,
  };
}
