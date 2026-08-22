import { tierProgress, type Tier, type TierProgress } from './tierProgress';

/// The one-line answer, in the reader's language.
///
/// Kept beside the model so a surface renders a string rather than deciding
/// which of four shapes to phrase.
export function tierProgressLabel(
  progress: TierProgress,
  copy: {
    pointsTemplate: string;
    dealsTemplate: string;
    dealsOneTemplate: string;
    concentrationTemplate: string;
    topTier: string;
  },
  tierLabel: (tier: Tier) => string,
): string | null {
  switch (progress.kind) {
    case 'top':
      return copy.topTier;
    case 'points':
      return copy.pointsTemplate
        .replace('{tier}', tierLabel(progress.nextTier))
        .replace('{points}', String(progress.points));
    case 'deals':
      return (progress.deals === 1 ? copy.dealsOneTemplate : copy.dealsTemplate)
        .replace('{tier}', tierLabel(progress.nextTier))
        .replace('{deals}', String(progress.deals));
    case 'concentration':
      return copy.concentrationTemplate.replace('{tier}', tierLabel(progress.nextTier));
    // Nothing honest to say.
    case 'unknown':
    default:
      return null;
  }
}

export { tierProgress };
export type { Tier, TierProgress };
