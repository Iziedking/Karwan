import { logger } from '../logger.js';
import { leased } from '../ops/leasedLoop.js';
import { caseStore, type CaseStore } from './cases.js';
import { overdueAlert, overdueCases } from './teamAlerts.js';
import { teamRoomStore, type TeamRoomStore } from './teamRoom.js';

/// Every five minutes: an open case past its first-reply time with no reply
/// is raised once, in the team room and in the team's Telegram chat (view 78).

const EVERY_MS = 5 * 60 * 1000;

export async function raiseOverdue(deps: {
  cases: CaseStore;
  room: TeamRoomStore;
  telegram: (text: string) => Promise<void>;
  now: number;
}): Promise<string[]> {
  const late = overdueCases(await deps.cases.queue({}), deps.now);
  for (const c of late) {
    const text = overdueAlert(c, deps.now);
    await deps.cases.update(c.id, { overdueSentAt: deps.now });
    await deps.room.post({ caseId: c.id, text, at: deps.now });
    await deps.telegram(text).catch((err: unknown) => logger.warn({ err: (err as Error).message, ref: c.ref }, 'support: overdue alert failed'));
  }
  return late.map((c) => c.ref);
}

export function startOverdueTick(telegram: (text: string) => Promise<void>): () => void {
  const run = leased('supportOverdue', EVERY_MS, () =>
    raiseOverdue({ cases: caseStore(), room: teamRoomStore(), telegram, now: Date.now() }).catch((err: unknown) =>
      logger.warn({ err: (err as Error).message }, 'support: overdue tick failed'),
    ),
  );
  const timer = setInterval(() => void run(), EVERY_MS);
  return () => clearInterval(timer);
}
