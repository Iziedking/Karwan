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
