import type { UserSettings } from '../db/profiles.js';

export { startAtSchema } from './startAt.js';

export type PublishRefusal = 'not switched on' | 'opted out' | 'before switch-on';

/// Whether one party's statement about one settled deal may be published. Each
/// party decides their own: off stops new statements, and deals settled before
/// switch-on day are published only for people who asked (agentic market spec,
/// O3 and O9). No switch-on date means nothing is published, so turning the
/// issuer on never backfills history by accident.
export function partyMayPublish(input: {
  settledAt: number;
  startAt: number | undefined;
  settings: Pick<UserSettings, 'publishDeals' | 'publishHistory'> | undefined;
}): { ok: true } | { ok: false; reason: PublishRefusal } {
  if (input.settings?.publishDeals === false) return { ok: false, reason: 'opted out' };
  if (input.startAt === undefined) return { ok: false, reason: 'not switched on' };
  if (input.settledAt < input.startAt && input.settings?.publishHistory !== true) return { ok: false, reason: 'before switch-on' };
  return { ok: true };
}
