import { tool } from 'ai';
import { z } from 'zod';
import { updateProfile } from '../db/profiles.js';
import { normalizeLocation, publicLocation, type PrivateLocation } from '../location/rules.js';

/// Where a person is and where they deliver, told to their agent in plain
/// words. Only the country is ever shown to anyone; city, area and delivery
/// answers are used by matching alone.

export interface LocationToolDeps {
  now: () => number;
  /// Applies a change to the latest stored location under the profile lock,
  /// so two answers given at once both land.
  update: (address: string, change: (current: PrivateLocation | null) => PrivateLocation) => Promise<void>;
}

const empty = (): PrivateLocation => ({ country: null, city: null, area: null, reach: {} });

export function locationTools(address: string, deps: LocationToolDeps) {
  return {
    set_location: tool({
      description:
        "Save where the user is: country (two-letter code, e.g. NG, GH, KE), and city and area if they give them. Use when they say where they are based. Tell them only their country is ever shown; city and area are used by agents to match them with people near them and are never shown to anyone. Then say what can be checked (the 'checkable' line).",
      inputSchema: z.object({
        country: z.string().min(1).max(60),
        city: z.string().max(200).optional(),
        area: z.string().max(200).optional(),
      }),
      execute: async ({ country, city, area }) => {
        const next = normalizeLocation({ country, city, area });
        if (!next.country) return { saved: false, error: 'Use the two-letter country code, for example NG for Nigeria or GH for Ghana.' };
        await deps.update(address, (current) => ({ ...(current ?? empty()), ...next }));
        return {
          saved: true,
          public: publicLocation(next as PrivateLocation),
          checkable:
            next.country === 'NG'
              ? 'Your country can be checked with your CAC registration. Your city and area stay private.'
              : 'Your country stays self-stated for now. Your city and area stay private.',
        };
      },
    }),

    answer_delivery: tool({
      description:
        "Save the user's answer to 'do you ship or travel there?' for one country (two-letter code), with rough days when they ship. Use when they answer that question, or when they say where they can or cannot deliver. Agents then offer them work from that country, or stop asking for 30 days.",
      inputSchema: z.object({
        country: z.string().length(2),
        ships: z.boolean(),
        days: z.number().int().min(1).max(120).optional(),
      }),
      execute: async ({ country, ships, days }) => {
        const code = country.toUpperCase();
        const answeredAt = deps.now();
        await deps.update(address, (current) => {
          const base = current ?? empty();
          return { ...base, reach: { ...base.reach, [code]: { ships, days: days ?? null, answeredAt } } };
        });
        return { saved: true };
      },
    }),
  };
}

export const liveLocationToolDeps: LocationToolDeps = {
  now: Date.now,
  update: async (address, change) => {
    await updateProfile(address, (current) => ({ ...current, location: change(current.location ?? null) }));
  },
};
