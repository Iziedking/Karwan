import type { UserSettings } from '../db/profiles.js';

/// Which channels a notification goes out on, from "How should we reach you"
/// (view 19). No answer means both. Telegram without a linked chat falls back
/// to email, so nobody is ever left with no channel.
export function channelsFor(settings: Pick<UserSettings, 'notifyVia'> | undefined, hasTelegram: boolean): { email: boolean; telegram: boolean } {
  const via = settings?.notifyVia ?? 'both';
  if (via === 'email') return { email: true, telegram: false };
  if (via === 'telegram') return hasTelegram ? { email: false, telegram: true } : { email: true, telegram: false };
  return { email: true, telegram: true };
}

/// An agent question and its one reminder go out on one channel (view 52,
/// step 2): the one the person chose, and when they chose both, Telegram if
/// linked (agentic first), else email. The bell and the assistant always show it.
export function questionChannelFor(settings: Pick<UserSettings, 'notifyVia'> | undefined, hasTelegram: boolean): { email: boolean; telegram: boolean } {
  const via = channelsFor(settings, hasTelegram);
  if (via.email && via.telegram) return hasTelegram ? { email: false, telegram: true } : { email: true, telegram: false };
  return via;
}

/// The morning brief and the agent's live notes go out on one channel (view
/// 52, step 4): Telegram when linked and allowed; else nothing beyond the bell
/// and the assistant for someone who visited in the last 7 days; else email.
/// Karwan keeps no record of visits yet, so callers pass false and a person
/// without Telegram gets the brief by email.
export function briefChannelFor(settings: Pick<UserSettings, 'notifyVia'> | undefined, hasTelegram: boolean, visitedIn7Days = false): { email: boolean; telegram: boolean } {
  const via = channelsFor(settings, hasTelegram);
  if (hasTelegram && via.telegram) return { email: false, telegram: true };
  if (visitedIn7Days) return { email: false, telegram: false };
  return { email: via.email, telegram: false };
}

/// The one reminder of an agent question (view 41) goes to the first channel,
/// Telegram then email, that the first notice did not use and that the person
/// has. When the first notice already used both, the reminder stays in the app
/// and the assistant.
export function reminderChannelsFor(settings: Pick<UserSettings, 'notifyVia'> | undefined, hasTelegram: boolean): { email: boolean; telegram: boolean } {
  const first = channelsFor(settings, hasTelegram);
  if (!first.telegram && hasTelegram) return { email: false, telegram: true };
  if (!first.email) return { email: true, telegram: false };
  return { email: false, telegram: false };
}
