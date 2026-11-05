import { z } from 'zod';
import { agentPrefsOf, type UserLocale, type UserProfile } from '../db/profiles.js';
import { tg } from '../i18n/telegram.js';
import type { MarketWatch } from '../intelligence/watches.js';
import { DEFAULT_WEEKLY_BUDGET_USDC, MAX_WEEKLY_BUDGET_USDC, type AgentRecord } from './agentRecord.js';
import { waysOf, type SellWay } from './ways.js';

/// What a person's agent may do, read as one thing (view 52, step 3). Each part
/// is read from the store that already holds it; only goals, the brief and
/// quiet hours are new, and they live in the agent record. Pure.

export interface Goal { id: string; kind: 'buy' | 'sell' | 'watch'; text: string; until?: number; createdAt: number }
export interface BriefPrefs { on: boolean; hour: number; timeZone: string }
export interface QuietHours { from: number; to: number }

export interface MandateSellWay { shape: string; what?: string; lowestUsdc?: number; usualUsdc?: number; days?: [number, number]; hours?: number }

export interface Mandate {
  sell: MandateSellWay[];
  buy: { mostUsdc: number | null; days: [number, number] | null; split: number[] | null };
  alone: 'offers' | 'ask' | 'agree';
  weeklyLimitUsdc: number;
  watches: Array<{ id: string; kind: string; category: string }>;
  goals: Goal[];
  brief: BriefPrefs;
  quiet: QuietHours | null;
}

export type MandatePatch =
  | { part: 'sell-price'; shape: string; lowestUsdc: number; usualUsdc?: number }
  | { part: 'alone'; mode: Mandate['alone'] }
  | { part: 'weekly-limit'; usdc: number }
  | { part: 'buy-most'; usdc: number }
  | { part: 'goal-add'; kind: Goal['kind']; text: string; untilDays?: number }
  | { part: 'goal-remove'; id: string }
  | { part: 'brief'; on?: boolean; hour?: number; timeZone?: string }
  | { part: 'quiet'; from: number; to: number }
  | { part: 'quiet-off' };

const hourSchema = z.number().int().min(0).max(23);
const usdcSchema = z.number().finite();
/// The shape of one change; the numbers are checked by validatePatch, which
/// says why in the person's words.
export const mandatePatchSchema = z.discriminatedUnion('part', [
  z.object({ part: z.literal('sell-price'), shape: z.string().min(1).max(20), lowestUsdc: usdcSchema, usualUsdc: usdcSchema.optional() }),
  z.object({ part: z.literal('alone'), mode: z.enum(['offers', 'ask', 'agree']) }),
  z.object({ part: z.literal('weekly-limit'), usdc: usdcSchema }),
  z.object({ part: z.literal('buy-most'), usdc: usdcSchema }),
  z.object({ part: z.literal('goal-add'), kind: z.enum(['buy', 'sell', 'watch']), text: z.string().max(200), untilDays: z.number().int().optional() }),
  z.object({ part: z.literal('goal-remove'), id: z.string().min(1).max(80) }),
  z.object({ part: z.literal('brief'), on: z.boolean().optional(), hour: z.number().int().optional(), timeZone: z.string().max(64).optional() }),
  z.object({ part: z.literal('quiet'), from: hourSchema, to: hourSchema }),
  z.object({ part: z.literal('quiet-off') }),
]) as unknown as z.ZodType<MandatePatch>;

export const DEFAULT_BRIEF: BriefPrefs = { on: true, hour: 8, timeZone: 'Africa/Lagos' };
export const DEFAULT_QUIET: QuietHours = { from: 21, to: 7 };
export const MAX_GOALS = 5;
const MAX_USDC = 1_000_000;

export type MandateRecord = Pick<AgentRecord, 'weeklyBudgetUsdc'> & { goals?: Goal[]; brief?: BriefPrefs; quiet?: QuietHours | null };

function sellOf(w: SellWay): MandateSellWay {
  switch (w.shape) {
    case 'one_time':
    case 'milestones':
      return { shape: w.shape, lowestUsdc: w.priceMin, usualUsdc: w.priceUsual, days: [w.daysMin, w.daysMax] };
    case 'goods':
      return { shape: w.shape, what: w.what, lowestUsdc: w.priceMin, usualUsdc: w.priceUsual, days: [w.arriveDaysMin, w.arriveDaysMax] };
    case 'deposit':
      return { shape: w.shape, what: w.what, lowestUsdc: w.deposit };
    case 'hourly':
      return { shape: w.shape, lowestUsdc: w.rateMin, usualUsdc: w.rateUsual, hours: w.hoursMax };
    case 'monthly':
      return { shape: w.shape, lowestUsdc: w.priceMin, usualUsdc: w.priceUsual };
  }
}

export function mandateOf(
  profile: Pick<UserProfile, 'agentWays' | 'seller' | 'buyer' | 'agentPrefs'>,
  record: MandateRecord | null | undefined,
  watches: readonly MarketWatch[],
): Mandate {
  const ways = waysOf(profile);
  const b = profile.buyer;
  const wayMost = ways.buy.map((w) => ('maxPrice' in w ? w.maxPrice : w.maxDeposit));
  return {
    sell: ways.sell.map(sellOf),
    buy: {
      mostUsdc: b ? b.maxBudgetUsdc : wayMost.length ? Math.max(...wayMost) : null,
      days: b ? [b.minDeadlineDays, b.maxDeadlineDays] : null,
      split: b ? [...b.milestonePcts] : null,
    },
    alone: agentPrefsOf(profile).agentMode,
    weeklyLimitUsdc: record?.weeklyBudgetUsdc ?? DEFAULT_WEEKLY_BUDGET_USDC,
    watches: watches.map((w) => ({ id: w.id, kind: w.kind, category: w.category })),
    goals: record?.goals ?? [],
    brief: { ...DEFAULT_BRIEF, ...(record?.brief ?? {}) },
    quiet: record?.quiet === undefined ? { ...DEFAULT_QUIET } : record.quiet,
  };
}

export function knownTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone }).format(0);
    return true;
  } catch {
    return false;
  }
}

const isHour = (h: number) => Number.isInteger(h) && h >= 0 && h <= 23;
const isPrice = (n: number) => Number.isFinite(n) && n > 0 && n <= MAX_USDC;

/// Why this change cannot be made, in the person's words, or null when it can.
export function validatePatch(m: Mandate, p: MandatePatch, locale: UserLocale = 'en'): string | null {
  const no = (key: Parameters<typeof tg>[0]) => tg(key, locale);
  switch (p.part) {
    case 'sell-price': {
      const way = m.sell.find((w) => w.shape === p.shape);
      if (!way) return no('mandate.refuse.noWay');
      if (!isPrice(p.lowestUsdc) || (p.usualUsdc !== undefined && !isPrice(p.usualUsdc))) return no('mandate.refuse.price');
      const usual = p.usualUsdc ?? way.usualUsdc;
      if (usual !== undefined && p.lowestUsdc > usual) return no('mandate.refuse.lowestAboveUsual');
      return null;
    }
    case 'alone':
      return ['offers', 'ask', 'agree'].includes(p.mode) ? null : no('mandate.refuse.mode');
    case 'weekly-limit':
      return Number.isFinite(p.usdc) && p.usdc >= 0 && p.usdc <= MAX_WEEKLY_BUDGET_USDC ? null : no('mandate.refuse.limit');
    case 'buy-most':
      return isPrice(p.usdc) ? null : no('mandate.refuse.price');
    case 'goal-add': {
      if (m.goals.length >= MAX_GOALS) return no('mandate.refuse.goals');
      const text = p.text.trim();
      if (text.length < 3 || text.length > 200 || !['buy', 'sell', 'watch'].includes(p.kind)) return no('mandate.refuse.goalText');
      if (p.untilDays !== undefined && !(Number.isInteger(p.untilDays) && p.untilDays >= 1 && p.untilDays <= 365)) return no('mandate.refuse.goalText');
      return null;
    }
    case 'goal-remove':
      return m.goals.some((g) => g.id === p.id) ? null : no('mandate.refuse.noGoal');
    case 'brief':
      if (p.hour !== undefined && !isHour(p.hour)) return no('mandate.refuse.hour');
      if (p.timeZone !== undefined && !knownTimeZone(p.timeZone)) return no('mandate.refuse.timeZone');
      return null;
    case 'quiet':
      return isHour(p.from) && isHour(p.to) && p.from !== p.to ? null : no('mandate.refuse.hour');
    case 'quiet-off':
      return null;
  }
}

/// The mandate as it will read after the change, for the card. Pure; the route
/// writes each part to its own store.
export function previewPatch(m: Mandate, p: MandatePatch, now: number): Mandate {
  switch (p.part) {
    case 'sell-price':
      return { ...m, sell: m.sell.map((w) => (w.shape === p.shape ? { ...w, lowestUsdc: p.lowestUsdc, ...(p.usualUsdc !== undefined ? { usualUsdc: p.usualUsdc } : {}) } : w)) };
    case 'alone':
      return { ...m, alone: p.mode };
    case 'weekly-limit':
      return { ...m, weeklyLimitUsdc: p.usdc };
    case 'buy-most':
      return { ...m, buy: { ...m.buy, mostUsdc: p.usdc } };
    case 'goal-add':
      return { ...m, goals: [...m.goals, { id: 'new', kind: p.kind, text: p.text.trim(), ...(p.untilDays ? { until: now + p.untilDays * 86_400_000 } : {}), createdAt: now }] };
    case 'goal-remove':
      return { ...m, goals: m.goals.filter((g) => g.id !== p.id) };
    case 'brief':
      return { ...m, brief: { ...m.brief, ...(p.on === undefined ? {} : { on: p.on }), ...(p.hour === undefined ? {} : { hour: p.hour }), ...(p.timeZone ? { timeZone: p.timeZone } : {}) } };
    case 'quiet':
      return { ...m, quiet: { from: p.from, to: p.to } };
    case 'quiet-off':
      return { ...m, quiet: null };
  }
}

const num = (n: number) => String(Math.round(n * 100) / 100);
export const zoneName = (timeZone: string) => (timeZone.split('/').pop() ?? timeZone).replace(/_/g, ' ');

function sellLine(w: MandateSellWay, locale: UserLocale): string {
  const v = { lowest: num(w.lowestUsdc ?? 0), usual: num(w.usualUsdc ?? w.lowestUsdc ?? 0), what: w.what ?? '' };
  switch (w.shape) {
    case 'goods':
      return tg('mandate.sellGoods', locale, v);
    case 'deposit':
      return tg('mandate.sellDeposit', locale, v);
    case 'hourly':
      return tg('mandate.sellHourly', locale, { ...v, hours: num(w.hours ?? 0) });
    case 'monthly':
      return tg('mandate.sellMonthly', locale, v);
    default:
      return tg('mandate.sellWork', locale, { ...v, min: num(w.days?.[0] ?? 0), max: num(w.days?.[1] ?? 0) });
  }
}

/// The mandate in the person's words, one line per part. Templates only.
export function sayMandate(m: Mandate, locale: UserLocale = 'en'): string[] {
  const lines: string[] = m.sell.length ? m.sell.map((w) => sellLine(w, locale)) : [tg('mandate.sellNone', locale)];
  if (m.buy.mostUsdc !== null) lines.push(tg('mandate.buy', locale, { most: num(m.buy.mostUsdc) }));
  lines.push(tg(m.alone === 'ask' ? 'mandate.alone.ask' : m.alone === 'agree' ? 'mandate.alone.agree' : 'mandate.alone.offers', locale));
  lines.push(tg('mandate.weeklyLimit', locale, { usdc: num(m.weeklyLimitUsdc) }));
  if (m.watches.length) lines.push(tg(m.watches.length === 1 ? 'mandate.watchesOne' : 'mandate.watches', locale, { count: String(m.watches.length) }));
  if (m.goals.length) lines.push(tg('mandate.goals', locale, { list: m.goals.map((g) => g.text).join('; ') }));
  lines.push(m.brief.on ? tg('mandate.brief', locale, { hour: String(m.brief.hour), zone: zoneName(m.brief.timeZone) }) : tg('mandate.briefOff', locale));
  lines.push(m.quiet ? tg('mandate.quiet', locale, { from: String(m.quiet.from), to: String(m.quiet.to) }) : tg('mandate.quietOff', locale));
  return lines;
}
