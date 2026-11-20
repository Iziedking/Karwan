import type { Contest } from '../db/contests.js';
import type { Engagement } from '../db/engagements.js';
import type { WorkRequest } from '../db/workRequests.js';

/// Contests and hourly or monthly work in "what do I have open?" (view 96), so
/// the assistant answers with every kind Your trades counts.

const usdc = (micros: string) => Number(BigInt(micros)) / 1e6;
const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const UNDER_WAY = new Set(['offering', 'offered', 'active', 'ending']);
const DECIDED = new Set(['awarded', 'cancelled', 'returned']);

export function contestLines(posted: readonly Contest[], entered: readonly Contest[]) {
  const line = (c: Contest) => ({
    id: c.id,
    title: c.title,
    prizeUsdc: usdc(c.prizeMicros),
    status: c.status,
    entriesClose: day(c.entriesBy),
    link: `/contests/${c.id}`,
  });
  return {
    posted: posted.filter((c) => c.status === 'open' || c.status === 'awarding').map(line),
    entered: entered.map((c) => ({ ...line(c), decided: DECIDED.has(c.status) })),
  };
}

export function workLines(posted: readonly WorkRequest[], offered: readonly WorkRequest[], engagements: readonly Engagement[], me: string) {
  const line = (r: WorkRequest) => ({
    id: r.id,
    kind: r.kind,
    title: r.title,
    mostUsdc: usdc(r.maxRateMicros),
    starts: day(r.startsAt),
    link: `/work/requests/${r.id}`,
  });
  const lower = me.toLowerCase();
  return {
    posted: posted.filter((r) => r.status === 'open').map(line),
    offered: offered.map(line),
    underWay: engagements
      .filter((e) => UNDER_WAY.has(e.status))
      .map((e) => ({
        id: e.id,
        kind: e.kind,
        title: e.title,
        rateUsdc: usdc(e.rateMicros),
        youAre: e.hirer.toLowerCase() === lower ? 'hirer' : 'worker',
        status: e.status,
        link: `/work/${e.id}`,
      })),
  };
}
