import type { Reputation } from '@/core/api';

export type CompositeTier = NonNullable<Reputation['tier']>;

/// The one tier palette. Matched to the /stake tier ladder so a tier reads the
/// SAME color everywhere it appears: the ladder, the reputation badge on bid
/// rows and the match banner, deal/profile surfaces. Change a hue here and it
/// updates every surface at once.
export const TIER_HUE: Record<CompositeTier, string> = {
  NEW: '#9a9a9a',
  COLD: '#e0a23c',
  ESTABLISHED: 'var(--lp-accent)',
  // The upper ranks stay in Karwan's botanical family, but deepen as trust
  // increases so the ladder reads as progression rather than three copies of
  // the same state. These tones remain clear on both paper and dark surfaces.
  STRONG: '#7fa96a',
  ELITE: '#4f8f7a',
};

export const TIER_LABEL: Record<CompositeTier, string> = {
  NEW: 'New',
  COLD: 'Cold',
  ESTABLISHED: 'Established',
  STRONG: 'Strong',
  ELITE: 'Elite',
};

/// A soft, translucent fill of the tier hue for chip backgrounds.
export function tierBg(tier: CompositeTier): string {
  return `color-mix(in oklab, ${TIER_HUE[tier]} 9%, transparent)`;
}

/// A tier-hue border, stronger than the fill so the chip edge reads.
export function tierBorder(tier: CompositeTier): string {
  return `color-mix(in oklab, ${TIER_HUE[tier]} 30%, transparent)`;
}
