import { readBrief } from '../agents/agentBrief.js';
import { liveLocationToolDeps } from '../assistant/locationTools.js';
import { sessionAddress } from '../auth/session.js';
import { getProfile, updateProfile, type UserLocale } from '../db/profiles.js';
import { extractKeywords } from '../llm/keywords.js';
import type { SetupRouteDeps } from '../routes/setup.js';

/// The live wiring behind /api/setup: the shared reader, the profile store and
/// the same private location save the Telegram interview uses.
export const liveSetupDeps: SetupRouteDeps = {
  sessionAddress,
  current: (address) => getProfile(address),
  read: (answers, current, locale) => readBrief(answers, current, { keywords: (text) => extractKeywords(text, 'setup') }, locale),
  save: (address, patch) =>
    updateProfile(address, (current) => {
      const { settings, ...rest } = patch;
      return { ...current, ...rest, settings: { ...(current.settings ?? {}), ...(settings ?? {}) } };
    }),
  saveLocation: (address, place) =>
    liveLocationToolDeps.update(address, (current) => {
      const base = current ?? { country: null, city: null, area: null, reach: {} };
      return { ...base, country: place.country, city: place.city ?? base.city };
    }),
  locale: async (address) => ((await getProfile(address))?.settings?.locale ?? 'en') as UserLocale,
  now: Date.now,
};
