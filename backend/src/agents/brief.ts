import type { UserLocale } from '../db/profiles.js';
import { tg } from '../i18n/telegram.js';
import type { Insight } from '../intelligence/insights.js';
import { insightLine, plain } from '../intelligence/insightText.js';
import type { Goal } from './mandate.js';

/// The morning brief (view 52, step 4), built only from the person's own data.
/// At most five lines, in this order: new offers, questions waiting, deals
/// waiting, up to the insights allowed today, one line per goal. Nothing to say
/// means no brief. Templates in five languages; no model writes a word.

export const BRIEF_MAX_LINES = 5;

export type GoalLine = 'buy' | 'sell' | 'watch' | 'expired' | 'nothing';

export interface BriefFacts {
  timeZone: string;
  newOffers: Array<{ jobId: string; title: string; count: number; bestUsdc: number }>;
  questions: { count: number; firstDecideAt: number | null };
  /// Deals and match proposals waiting on the person: the "needs you" set Home
  /// and whats_pending use, counted (those lines are written for the model).
  dealsWaiting: number;
  insights: Insight[];
  /// How many more insights may go out today (three a day, shared with live notes).
  insightsAllowed: number;
  goals: Array<{ goal: Goal; line: GoalLine; numbers: Record<string, number> }>;
  /// Goal lines already told: an expired goal is said once, "nothing fits" once a week.
  told: readonly string[];
}

export interface Brief {
  heading: string;
  lines: string[];
  /// What the log keeps, so nothing is told twice.
  insightKeys: string[];
  goalKeys: string[];
}

const num = (n: number | undefined) => String(Math.round((n ?? 0) * 100) / 100);

function clock(at: number, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(at);
}

const DATE_LOCALE: Record<UserLocale, string> = { en: 'en-GB', fr: 'fr-FR', ar: 'ar', hi: 'hi-IN', sw: 'sw' };
function date(at: number, timeZone: string, locale: UserLocale): string {
  return new Intl.DateTimeFormat(DATE_LOCALE[locale] ?? 'en-GB', { timeZone, day: 'numeric', month: 'short' }).format(at);
}

function goalLine(g: BriefFacts['goals'][number], f: BriefFacts, locale: UserLocale): { line: string; key: string | null } {
  const n = g.numbers;
  const text = g.goal.text;
  switch (g.line) {
    case 'buy': {
      const due = date(n.dueAt ?? 0, f.timeZone, locale);
      const key = !n.offers ? 'brief.goalBuyNone' : n.offers === 1 ? 'brief.goalBuyOne' : 'brief.goalBuy';
      return { line: tg(key, locale, { text, offers: num(n.offers), best: num(n.bestUsdc), date: due }), key: null };
    }
    case 'sell':
      return { line: tg(n.fits === 1 ? 'brief.goalSellOne' : 'brief.goalSell', locale, { text, fits: num(n.fits), offered: num(n.offered) }), key: null };
    case 'watch':
      return { line: tg(n.count === 1 ? 'brief.goalWatchOne' : 'brief.goalWatch', locale, { text, count: num(n.count) }), key: null };
    case 'expired':
      return { line: tg('brief.goalExpired', locale, { text }), key: `goal-expired:${g.goal.id}` };
    case 'nothing':
      return { line: tg('brief.goalNothing', locale, { text }), key: `goal-nothing:${g.goal.id}` };
  }
}

const STOP = new Set(
  'a an and any are as at be buy buying by find for from get i in is it me my need of on or sell selling some that the this to under over below above less more than tell when want week weeks month months year with about please someone'.split(' '),
);

/// The words a goal is matched on: the person's own words, without the
/// common ones. Goals are matched on words in v1, no model (owner, 5 Nov 2026).
export function goalWords(text: string): string[] {
  return [...new Set(text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 3 && !STOP.has(w) && !/^\d+$/.test(w)))];
}

/// A request fits a goal when it carries one of the goal's words, plural or not.
const forms = (w: string) => [w, ...(w.length > 3 && w.endsWith('s') ? [w.slice(0, -1)] : []), ...(w.length > 4 && w.endsWith('es') ? [w.slice(0, -2)] : [])];

export function goalFits(words: readonly string[], requestText: string): boolean {
  if (!words.length) return false;
  const have = new Set(requestText.toLowerCase().split(/[^\p{L}\p{N}]+/u).flatMap(forms));
  return words.some((w) => forms(w).some((f) => have.has(f)));
}

export function composeBrief(f: BriefFacts, locale: UserLocale = 'en'): Brief | null {
  const out: Array<{ line: string; insightKey?: string; goalKey?: string }> = [];
  for (const o of f.newOffers) {
    if (o.count <= 0) continue;
    out.push({ line: tg(o.count === 1 ? 'brief.offersOne' : 'brief.offers', locale, { title: o.title, count: String(o.count), best: num(o.bestUsdc) }) });
  }
  if (f.questions.count > 0) {
    const at = f.questions.firstDecideAt;
    const key = at === null ? 'brief.questionsWaiting' : f.questions.count === 1 ? 'brief.questionsOne' : 'brief.questions';
    out.push({ line: tg(key, locale, { count: String(f.questions.count), time: at === null ? '' : clock(at, f.timeZone) }) });
  }
  if (f.dealsWaiting > 0) out.push({ line: tg(f.dealsWaiting === 1 ? 'brief.dealsWaitingOne' : 'brief.dealsWaiting', locale, { count: String(f.dealsWaiting) }) });
  for (const i of f.insights.slice(0, Math.max(0, f.insightsAllowed))) {
    const line = insightLine(i, locale);
    if (line) out.push({ line: plain(line), insightKey: i.key });
  }
  for (const g of f.goals) {
    const { line, key } = goalLine(g, f, locale);
    if (key && f.told.includes(key)) continue;
    out.push({ line, ...(key ? { goalKey: key } : {}) });
  }
  const kept = out.slice(0, BRIEF_MAX_LINES);
  if (kept.length === 0) return null;
  return {
    heading: tg('brief.heading', locale),
    lines: kept.map((k) => k.line),
    insightKeys: kept.flatMap((k) => (k.insightKey ? [k.insightKey] : [])),
    goalKeys: kept.flatMap((k) => (k.goalKey ? [k.goalKey] : [])),
  };
}
