/// Home "Updates" cards: what an admin can publish, which ones are live, and the
/// live "Trending on Karwan" figures. Pure, so it is tested without storage.

import { z } from 'zod';
import { weeklyDemand, type DemandRequest } from '../intelligence/marketStore.js';
import type { CategoryId } from '../listings/categories.js';

export const GROUNDS = ['mist', 'sage', 'blush', 'lilac', 'paper'] as const;
export const KINDS = ['post', 'video', 'trending'] as const;

/// A link is either a page inside Karwan or an https address. Nothing else, so a
/// card can never carry a javascript: or protocol-relative url.
const href = z
  .string()
  .trim()
  .max(500)
  .refine((v) => /^\/(?!\/)[\w\-./?=&%#~]*$/.test(v) || /^https:\/\/[^\s]+$/.test(v), 'Use a Karwan path like /how-it-works or an https link.');

export const updateInputSchema = z.object({
  kind: z.enum(KINDS).default('post'),
  tag: z.string().trim().min(1).max(40),
  title: z.string().trim().min(1).max(60),
  body: z.string().trim().max(160).default(''),
  ctaLabel: z.string().trim().min(1).max(24),
  href,
  /// A picture for the top of the tile: a Karwan path or an https address, the
  /// same rule as the link, or empty for none. A video card without one shows
  /// its own frame.
  image: z.union([href, z.literal('')]).optional(),
  ground: z.enum(GROUNDS).default('mist'),
  art: z.number().int().min(0).max(2).default(0),
  active: z.boolean().default(true),
  /// Optional window; outside it the card is hidden.
  startsAt: z.number().int().positive().optional(),
  endsAt: z.number().int().positive().optional(),
});

export type UpdateInput = z.infer<typeof updateInputSchema>;

export interface UpdateCard extends UpdateInput {
  id: string;
  order: number;
  createdAt: number;
  updatedAt: number;
}

export function liveUpdates(cards: UpdateCard[], now: number): UpdateCard[] {
  return cards
    .filter((c) => c.active && (!c.startsAt || c.startsAt <= now) && (!c.endsAt || c.endsAt > now))
    .sort((a, b) => a.order - b.order);
}

export type TrendingBrief = DemandRequest;

/// The market categories requested most this week, counted once per request,
/// from the one market store (view 48, step 4). Seeded demo requests are left
/// out so the card only reflects real people.
export function trendingCategories(
  briefs: readonly TrendingBrief[],
  now: number,
  limit = 3,
): Array<{ id: CategoryId; name: string; requests: number; rising: boolean }> {
  return weeklyDemand(briefs, [], now)
    .filter((r) => r.thisWeek > 0)
    .slice(0, limit)
    .map((r) => ({ id: r.id, name: r.name, requests: r.thisWeek, rising: r.rising }));
}
