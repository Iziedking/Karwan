import { keywordsOf } from '../find/keywords.js';
import type { PublicRating } from './rules.js';

/// The free rating read (view 93): what a person sees on a profile, plus the
/// rating for the work asked about. Never the record: no score, on-time rate,
/// completed count or disputes lost. One answer for the assistant, Telegram
/// and outside agents.

export interface ReadRatingDeps {
  byTag: (tag: string) => Promise<string | null>;
  load: (address: string, request: string[]) => Promise<PublicRating>;
}

export type RatingRead =
  | {
      ok: true;
      tag: string;
      rating:
        | { kind: 'new'; count: number }
        | { kind: 'rated'; stars: number; count: number; disputed: number; likeThis: { stars: number; count: number } | null };
    }
  | { ok: false; error: 'not_found' };

export async function readRating(handle: string, forWork: string | undefined, deps: ReadRatingDeps): Promise<RatingRead> {
  const tag = handle.trim().replace(/^@/, '').toLowerCase();
  const address = tag ? await deps.byTag(tag) : null;
  if (!address) return { ok: false, error: 'not_found' };
  const r = await deps.load(address, forWork ? keywordsOf(forWork) : []);
  if (r.kind === 'new') return { ok: true, tag, rating: { kind: 'new', count: r.count } };
  const likeThis = r.forWork && r.forWork.count >= 1 ? { stars: r.forWork.value, count: r.forWork.count } : null;
  return { ok: true, tag, rating: { kind: 'rated', stars: r.value, count: r.count, disputed: r.disputed, likeThis } };
}
