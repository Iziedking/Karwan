/// Home "Updates" cards: what an admin can publish, which ones are live, and the
/// live "Trending on Karwan" figures. Pure, so it is tested without storage.

import { z } from 'zod';

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

export interface TrendingBrief {
  keywords?: string[];
  createdAt: number;
  seedKey?: string;
}

export const TRENDING_WINDOW_MS = 7 * 86_400_000;

/// The most requested kinds of work this week, counted once per request. Seeded
/// demo requests are left out so the card only reflects real people.
export function trendingCategories(briefs: TrendingBrief[], now: number, limit = 3): Array<{ name: string; requests: number }> {
  const counts = new Map<string, number>();
  for (const b of briefs) {
    if (b.seedKey || now - b.createdAt > TRENDING_WINDOW_MS || b.createdAt > now) continue;
    const seen = new Set((b.keywords ?? []).map((k) => k.trim().toLowerCase()).filter((k) => k.length > 1));
    for (const k of seen) counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([name, requests]) => ({ name, requests }));
}
