import type { UserLocale } from '../db/profiles.js';
import { tg } from '../i18n/telegram.js';
import { RECORD_READ_PRICE_USDC } from '../x402/recordReadGate.js';
import { zoneName, type BriefPrefs, type Mandate, type MandatePatch } from './mandate.js';

/// What a mandate change does next, worked out before the person confirms it
/// (view 52, step 3). Pure: the caller gathers the requests the agent passed on
/// for price this week and the person's open requests.

export interface EffectFacts {
  now: number;
  passedForPrice: Array<{ jobId: string; budgetUsdc: number }>;
  openRequests: Array<{ jobId: string; budgetUsdc: number }>;
}

export interface Effect { line: string; numbers: Record<string, number> }

const QUARTER_MS = 15 * 60_000;
const num = (n: number) => String(Math.round(n * 100) / 100);

function localParts(at: number, timeZone: string): { day: string; hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(at);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '0';
  return { day: `${get('year')}-${get('month')}-${get('day')}`, hour: Number(get('hour')), minute: Number(get('minute')) };
}

/// The first moment after now when it is the brief hour, on the hour, in the
/// brief's time zone.
export function nextBriefAt(now: number, brief: BriefPrefs): number {
  let at = Math.ceil((now + 1) / QUARTER_MS) * QUARTER_MS;
  for (let i = 0; i < 4 * 26; i++, at += QUARTER_MS) {
    const p = localParts(at, brief.timeZone);
    if (p.hour === brief.hour && p.minute === 0) return at;
  }
  return at;
}

export function effectOf(m: Mandate, p: MandatePatch, facts: EffectFacts, locale: UserLocale = 'en'): Effect {
  switch (p.part) {
    case 'sell-price': {
      const old = m.sell.find((w) => w.shape === p.shape)?.lowestUsdc ?? Infinity;
      const reopened = new Set(facts.passedForPrice.filter((r) => r.budgetUsdc >= p.lowestUsdc && r.budgetUsdc < old).map((r) => r.jobId));
      const count = reopened.size;
      return count > 0
        ? { line: tg(count === 1 ? 'effect.reopensOne' : 'effect.reopens', locale, { lowest: num(p.lowestUsdc), count: String(count) }), numbers: { count } }
        : { line: tg('effect.newLowest', locale, { lowest: num(p.lowestUsdc) }), numbers: { count: 0 } };
    }
    case 'alone':
      return { line: tg(p.mode === 'ask' ? 'mandate.alone.ask' : p.mode === 'agree' ? 'mandate.alone.agree' : 'mandate.alone.offers', locale), numbers: {} };
    case 'weekly-limit': {
      const diff = p.usdc - m.weeklyLimitUsdc;
      const moreChecks = diff >= RECORD_READ_PRICE_USDC ? Math.floor(diff / RECORD_READ_PRICE_USDC + 1e-9) : 0;
      if (moreChecks > 0) return { line: tg('effect.limitUp', locale, { count: String(moreChecks) }), numbers: { moreChecks } };
      if (p.usdc === 0) return { line: tg('effect.limitZero', locale), numbers: { moreChecks: 0 } };
      return { line: tg('effect.limitDown', locale, { usdc: num(p.usdc) }), numbers: { moreChecks: 0 } };
    }
    case 'buy-most': {
      const above = facts.openRequests.filter((r) => r.budgetUsdc > p.usdc).length;
      const below = facts.openRequests.length - above;
      const key = above === 0 ? 'effect.buyMost' : above === 1 ? 'effect.buyMostAboveOne' : 'effect.buyMostAbove';
      const line = tg(key, locale, { most: num(p.usdc), above: String(above) });
      return { line, numbers: { above, below } };
    }
    case 'goal-add':
      return { line: tg('effect.goalAdd', locale, { text: p.text.trim() }), numbers: {} };
    case 'goal-remove':
      return { line: tg('effect.goalRemove', locale), numbers: {} };
    case 'brief': {
      const brief = { ...m.brief, ...(p.on === undefined ? {} : { on: p.on }), ...(p.hour === undefined ? {} : { hour: p.hour }), ...(p.timeZone ? { timeZone: p.timeZone } : {}) };
      if (!brief.on) return { line: tg('effect.briefOff', locale), numbers: {} };
      const nextAt = nextBriefAt(facts.now, brief);
      const today = localParts(nextAt, brief.timeZone).day === localParts(facts.now, brief.timeZone).day;
      return { line: tg(today ? 'effect.briefToday' : 'effect.briefTomorrow', locale, { hour: String(brief.hour), zone: zoneName(brief.timeZone) }), numbers: { nextAt } };
    }
    case 'quiet':
      return { line: tg('effect.quiet', locale, { from: String(p.from), to: String(p.to) }), numbers: {} };
    case 'quiet-off':
      return { line: tg('effect.quietOff', locale), numbers: {} };
    case 'power':
      return { line: tg(p.on ? 'effect.powerOn' : 'effect.powerOff', locale), numbers: {} };
  }
}
