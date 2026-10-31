import type { RecordRead } from '@/features/profile/ownRecord';

type Rating = NonNullable<RecordRead['rating']>;

export interface PublicRecord {
  name: string | null;
  tag: string | null;
  verifiedPerson: boolean;
  tier: string;
  rating: Rating;
  reasons: RecordRead['reasons'];
}

/// What others see on /r/<tag> (view 44, P10): the name, the tag, the
/// verified mark, the tier, the rating in words and up to three reasons.
/// Never a score or a count, even on the owner's own preview (UI law principle 3).
export function publicRecord(data: RecordRead): PublicRecord {
  return {
    name: data.displayName,
    tag: data.tag,
    verifiedPerson: data.level !== 'registered',
    tier: data.tier,
    rating: data.rating ?? { kind: 'new', count: 0 },
    reasons: data.reasons.slice(0, 3),
  };
}
