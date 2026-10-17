import type { Tier } from '../reputation/config.js';
import type { Ladder } from '../verification/ladder.js';

/// The asker's agent turns a full record into one of three plain answers, so
/// a lookup can say how far to trust someone without showing a number.
export type VetAdvice = 'good' | 'start_small' | 'new';

export function vetAdvice(input: { tier: Tier; level: Ladder }): VetAdvice {
  if (input.tier === 'ELITE' || input.tier === 'STRONG') return 'good';
  if (input.tier === 'ESTABLISHED') return 'start_small';
  if (input.tier === 'COLD' && (input.level === 'work_verified' || input.level === 'id_verified')) return 'start_small';
  return 'new';
}
