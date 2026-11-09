import type { QuietHours } from '../agents/mandate.js';
import { claimDue, type Claimed, type Contact } from './contacts.js';
import { nextReminderAt } from './reminders.js';

/// Delivers held deal alerts and sends reminders when they fall due (view 72).
/// Each due row is claimed by one sweep only, so nothing goes out twice.

export interface Zone {
  timeZone: string;
  quiet: QuietHours | null;
}

export interface SweepDeps {
  claim: typeof claimDue;
  /// Where the person contacted is, in time, and their quiet hours.
  zoneOf(person: string): Promise<Zone>;
  /// Tells the person: the alert itself, or a reminder of it.
  send(claimed: Claimed): Promise<void>;
}

/// When a contact is next due, in the contacted person's own time.
export async function nextDue(c: Pick<Contact, 'kind' | 'sentAt' | 'reminders' | 'to'>, zoneOf: SweepDeps['zoneOf']): Promise<number | null> {
  const zone = await zoneOf(c.to);
  return nextReminderAt(c, zone.timeZone, zone.quiet);
}

export async function runContactSweep(now: number, deps: SweepDeps): Promise<number> {
  const claimed = await deps.claim(now, (c) => nextDue(c, deps.zoneOf));
  let sent = 0;
  for (const c of claimed) {
    await deps.send(c).then(() => (sent += 1), () => undefined);
  }
  return sent;
}
