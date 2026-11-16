import type { UserLocale } from '../db/profiles.js';
import { tg } from '../i18n/telegram.js';
import type { Zone } from './contactSweep.js';
import { nextRunAt, type StandingOrder } from './orders.js';
import type { RunOutcome, RunResult } from './orderRun.js';

/// The sweep that works standing orders when they fall due (view 87, step 4).
/// Each due order is claimed by one sweep only, run once, saved, and its
/// person told in one note when the run did something.

/// A run that finds nobody says so on this day in a row, once.
export const NOBODY_SAID_ON = 3;

export interface OrderSweepDeps {
  claim(now: number, nextAfter: (o: StandingOrder) => Promise<number>): Promise<StandingOrder[]>;
  /// Where the order's person is, in time, and their quiet hours.
  zoneOf(owner: string): Promise<Zone>;
  run(order: StandingOrder, now: number): Promise<RunResult>;
  save(order: StandingOrder): Promise<StandingOrder | null>;
  tell(order: StandingOrder, outcome: RunOutcome, now: number): Promise<void>;
}

/// What the person is told about a run, in their language; null when the run
/// has nothing worth a message.
export function orderNote(order: Pick<StandingOrder, 'need' | 'side'>, outcome: RunOutcome, locale: UserLocale): { heading: string; lines: string[] } | null {
  const need = order.need;
  const say = (...lines: string[]) => ({ heading: tg('order.heading', locale), lines });
  switch (outcome.kind) {
    case 'asked':
      return say(
        outcome.n === 1 ? tg('order.askedOne', locale, { need, names: outcome.names.join(', ') }) : tg('order.asked', locale, { n: String(outcome.n), need, names: outcome.names.join(', ') }),
        tg('order.asked.tail', locale),
      );
    case 'pitched':
      return say(outcome.n === 1 ? tg('order.pitchedOne', locale) : tg('order.pitched', locale, { n: String(outcome.n) }), tg('order.pitched.tail', locale));
    case 'nobody':
      return outcome.days === NOBODY_SAID_ON ? say(tg(order.side === 'buy' ? 'order.nobody.buy' : 'order.nobody.sell', locale, { need })) : null;
    case 'needs-location':
      return outcome.first ? say(tg('order.location', locale, { need })) : null;
    case 'short':
      return outcome.first ? say(tg('order.short', locale, { need })) : null;
    case 'ended':
      return outcome.why === 'date' ? say(tg('order.ended', locale, { need })) : null;
    default:
      return null;
  }
}

/// Runs every order due now. Returns how many ran.
export async function runOrderSweep(now: number, deps: OrderSweepDeps): Promise<number> {
  const due = await deps.claim(now, async (o) => {
    const zone = await deps.zoneOf(o.owner);
    return nextRunAt(o, now, zone.timeZone, zone.quiet);
  });
  let ran = 0;
  for (const order of due) {
    try {
      const result = await deps.run(order, now);
      // A stop made while the run worked removed the row: nothing is said for it.
      if (!(await deps.save(result.order))) continue;
      ran += 1;
      await deps.tell(result.order, result.outcome, now);
    } catch {
      // The order keeps its next run; one that failed does not hold the others.
    }
  }
  return ran;
}
