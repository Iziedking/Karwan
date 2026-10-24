import { tool } from 'ai';
import { z } from 'zod';
import type { RateResult } from '../ratings/service.js';

/// Rating a settled deal out of 5, from any chat. Ratings show once both
/// people rated, or 14 days after the deal settled.

export interface RatingToolDeps {
  rateDeal: (caller: string, dealId: string, stars: number, note?: string) => Promise<RateResult>;
  waiting: (caller: string) => Promise<Array<{ dealId: string; withTag: string | null; settledAt: number }>>;
  hasRated: (caller: string, dealId: string) => Promise<boolean>;
}

export function ratingTools(address: string, deps: RatingToolDeps) {
  return {
    rate_deal: tool({
      description:
        "Rate a settled deal from 1 to 5, with an optional short note, for the other person in it. Use when the user rates a deal or answers 'how did your deal go?'. Ask for the number if they did not give one. Each side rates once; ratings stay hidden until both rated or 14 days pass. A note with a phone number, an email or a link is kept private.",
      inputSchema: z.object({
        dealId: z.string().min(1).max(100),
        stars: z.number().int().min(1).max(5),
        note: z.string().max(280).optional(),
      }),
      execute: async ({ dealId, stars, note }) => {
        const r = await deps.rateDeal(address, dealId, stars, note);
        return r.ok ? { saved: true, revealed: r.revealed, message: r.message } : { saved: false, error: r.message };
      },
    }),

    my_ratings_to_give: tool({
      description:
        "List the user's settled deals they have not rated yet, with the other person's tag and the day it settled. Use when they ask what to rate, or before rate_deal when they did not say which deal. Name each deal by the person and that day (\"@lawful, 20 Oct\"), never by its id; keep the id only to pass to rate_deal.",
      inputSchema: z.object({}),
      execute: async () => ({
        waiting: (await deps.waiting(address)).map((w) => ({
          dealId: w.dealId,
          with: w.withTag ? `@${w.withTag}` : 'A Karwan member',
          settled: new Date(w.settledAt).toISOString().slice(0, 10),
        })),
      }),
    }),
  };
}
