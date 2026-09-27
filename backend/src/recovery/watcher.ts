import { getModularAccountByAddress } from '../db/modularAccounts.js';
import { listRequestsNeedingWork, setRequestState } from '../db/recovery.js';
import { sendRecoveryEmail } from '../emails/recovery.js';
import { logger } from '../logger.js';
import { needsReminder, shouldExpire, type RecoveryRequest } from './rules.js';

/// Sends the one-hour reminder before a recovery can finish, and closes
/// released requests that were never completed.
type Deps = {
  list: () => Promise<RecoveryRequest[]>;
  patch: (id: string, p: Partial<RecoveryRequest>) => Promise<void>;
  emailFor: (wallet: string) => Promise<string | null>;
  send: (to: string, kind: 'reminder', opts: { releasableAt: number }) => Promise<unknown>;
};

const live: Deps = {
  list: listRequestsNeedingWork,
  patch: setRequestState,
  emailFor: async (w) => (await getModularAccountByAddress(w))?.email ?? null,
  send: (to, kind, opts) => sendRecoveryEmail(to, kind, opts),
};

export async function recoveryTick(now: number, deps: Deps = live): Promise<void> {
  for (const r of await deps.list()) {
    if (shouldExpire(r, now)) {
      await deps.patch(r.id, { state: 'expired' });
      continue;
    }
    if (needsReminder(r, now)) {
      const to = await deps.emailFor(r.walletAddress);
      if (to) await deps.send(to, 'reminder', { releasableAt: r.releasableAt });
      await deps.patch(r.id, { reminderSentAt: now });
    }
  }
}

export function startRecoveryWatcher(): () => void {
  const id = setInterval(() => {
    recoveryTick(Date.now()).catch((err: unknown) =>
      logger.error({ err: err instanceof Error ? err.message : String(err) }, 'recovery watcher tick failed'),
    );
  }, 60_000);
  logger.info('recovery watcher started');
  return () => clearInterval(id);
}
