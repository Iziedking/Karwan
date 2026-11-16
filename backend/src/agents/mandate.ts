import { z } from 'zod';
import { agentPrefsOf, type UserLocale, type UserProfile } from '../db/profiles.js';
import { tg } from '../i18n/telegram.js';
import type { MarketWatch } from '../intelligence/watches.js';
import type { LocalCurrency } from '../rates/usdcRates.js';
import { DEFAULT_LOCKS_PER_DAY, DEFAULT_LOCK_WHO, DEFAULT_WEEKLY_BUDGET_USDC, MAX_LOCKS_PER_DAY, MAX_WEEKLY_BUDGET_USDC, type AgentRecord, type LockRules, type LockWho, type SaidUsdc, type StopReason } from './agentRecord.js';
import { AGENT_SWITCHES, modeOf, switchesOf, switchesOfMode, type AgentSwitch, type Alone } from './alone.js';
import { waysOf, type SellWay } from './ways.js';

/// What a person's agent may do, read as one thing (view 52, step 3). Each part
/// is read from the store that already holds it; only goals, the brief and
/// quiet hours are new, and they live in the agent record. Pure.

export interface Goal { id: string; kind: 'buy' | 'sell' | 'watch'; text: string; until?: number; createdAt: number }
export interface BriefPrefs { on: boolean; hour: number; timeZone: string }
export interface QuietHours { from: number; to: number }

export interface MandateSellWay { shape: string; what?: string; lowestUsdc?: number; usualUsdc?: number; days?: [number, number]; hours?: number }

export interface Mandate {
  /// View 75: off stops the agent altogether. Running deals, money and the
  /// assistant go on.
  on: boolean;
  sell: MandateSellWay[];
  buy: { mostUsdc: number | null; days: [number, number] | null; split: number[] | null };
  alone: 'offers' | 'ask' | 'agree';
  /// The same choice as one switch each, with the ones a mode never covered (view 87).
  switches: Alone;
  weeklyLimitUsdc: number;
  watches: Array<{ id: string; kind: string; category: string }>;
  goals: Goal[];
  brief: BriefPrefs;
  quiet: QuietHours | null;
  /// Why the agent stopped itself, until the person turns it back on (view 87).
  stopped: { at: number; reason: StopReason } | null;
  /// The limits for locking money alone, once set.
  lock: MandateLock | null;
}

export type MandateLock = Omit<LockRules, 'locks'>;
export type SaidAmounts = { currency: LocalCurrency; amounts: { perDealUsdc?: number; perWeekUsdc?: number } };

export type MandatePatch =
  | { part: 'sell-price'; shape: string; lowestUsdc: number; usualUsdc?: number }
  | { part: 'alone'; mode: Mandate['alone'] }
  | { part: 'weekly-limit'; usdc: number }
  | { part: 'buy-most'; usdc: number }
  | { part: 'goal-add'; kind: Goal['kind']; text: string; untilDays?: number }
  | { part: 'goal-remove'; id: string }
  | { part: 'brief'; on?: boolean; hour?: number; timeZone?: string }
  | { part: 'quiet'; from: number; to: number }
  | { part: 'quiet-off' }
  | { part: 'power'; on: boolean }
  | { part: 'switch'; name: AgentSwitch; on: boolean }
  /// `on` also turns Lock money on, so the limits and the switch are one confirmed step.
  | { part: 'lock-rules'; perDealUsdc?: number; perWeekUsdc?: number; perDay?: number; who?: LockWho; on?: true; said?: SaidAmounts }
  | { part: 'resume' };

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
  z.object({ part: z.literal('power'), on: z.boolean() }),
  z.object({ part: z.literal('switch'), name: z.enum(AGENT_SWITCHES), on: z.boolean() }),
  z.object({
    part: z.literal('lock-rules'),
    perDealUsdc: usdcSchema.optional(),
    perWeekUsdc: usdcSchema.optional(),
    perDay: z.number().int().optional(),
    who: z.enum(['verified', 'record', 'anyone']).optional(),
    on: z.literal(true).optional(),
    said: z.object({ currency: z.string().min(3).max(4), amounts: z.object({ perDealUsdc: z.number().positive().optional(), perWeekUsdc: z.number().positive().optional() }) }).optional(),
  }),
  z.object({ part: z.literal('resume') }),
]) as unknown as z.ZodType<MandatePatch>;

export const DEFAULT_BRIEF: BriefPrefs = { on: true, hour: 8, timeZone: 'Africa/Lagos' };
export const DEFAULT_QUIET: QuietHours = { from: 21, to: 7 };
export const MAX_GOALS = 5;
const MAX_USDC = 1_000_000;

export type MandateRecord = Pick<AgentRecord, 'weeklyBudgetUsdc' | 'stopped' | 'lock'> & { goals?: Goal[]; brief?: BriefPrefs; quiet?: QuietHours | null };

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
    on: agentPrefsOf(profile).agentOn !== false,
    sell: ways.sell.map(sellOf),
    buy: {
      mostUsdc: b ? b.maxBudgetUsdc : wayMost.length ? Math.max(...wayMost) : null,
      days: b ? [b.minDeadlineDays, b.maxDeadlineDays] : null,
      split: b ? [...b.milestonePcts] : null,
    },
    alone: agentPrefsOf(profile).agentMode,
    switches: switchesOf(profile, record),
    weeklyLimitUsdc: record?.weeklyBudgetUsdc ?? DEFAULT_WEEKLY_BUDGET_USDC,
    watches: watches.map((w) => ({ id: w.id, kind: w.kind, category: w.category })),
    goals: record?.goals ?? [],
    brief: { ...DEFAULT_BRIEF, ...(record?.brief ?? {}) },
    quiet: record?.quiet === undefined ? { ...DEFAULT_QUIET } : record.quiet,
    stopped: record?.stopped ?? null,
    lock: record?.lock ? { perDeal: record.lock.perDeal, perWeek: record.lock.perWeek, perDay: record.lock.perDay, who: record.lock.who } : null,
  };
}

const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

function saidUsdc(usdc: number, said: SaidAmounts | undefined, key: 'perDealUsdc' | 'perWeekUsdc'): SaidUsdc {
  const amount = said?.amounts[key];
  if (!said || typeof amount !== 'number' || !(amount > 0)) return { usdc: round6(usdc) };
  return { usdc: round6(usdc), said: { currency: said.currency, amount: String(Math.round(amount * 100) / 100) } };
}

/// The lock limits as they will stand after this change, or null when the two
/// amounts are not both known yet. A figure the change does not name is kept.
export function lockAfter(m: Pick<Mandate, 'lock'>, p: Extract<MandatePatch, { part: 'lock-rules' }>): MandateLock | null {
  const perDeal = p.perDealUsdc === undefined ? m.lock?.perDeal : saidUsdc(p.perDealUsdc, p.said, 'perDealUsdc');
  const perWeek = p.perWeekUsdc === undefined ? m.lock?.perWeek : saidUsdc(p.perWeekUsdc, p.said, 'perWeekUsdc');
  if (!perDeal || !perWeek) return null;
  return { perDeal, perWeek, perDay: p.perDay ?? m.lock?.perDay ?? DEFAULT_LOCKS_PER_DAY, who: p.who ?? m.lock?.who ?? DEFAULT_LOCK_WHO };
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
    case 'power':
      return typeof p.on === 'boolean' ? null : no('mandate.refuse.mode');
    case 'switch':
      if (p.name !== 'lock' || !p.on) return null;
      if (!m.switches.agree) return no('mandate.refuse.lockNeedsAgree');
      return m.lock ? null : no('mandate.refuse.lockNeedsRules');
    case 'lock-rules': {
      const lock = lockAfter(m, p);
      if (!lock) return no('mandate.refuse.lockRules');
      const amounts = isPrice(lock.perDeal.usdc) && isPrice(lock.perWeek.usdc) && lock.perDeal.usdc <= lock.perWeek.usdc;
      const day = Number.isInteger(lock.perDay) && lock.perDay >= 1 && lock.perDay <= MAX_LOCKS_PER_DAY;
      if (!amounts || !day || !['verified', 'record', 'anyone'].includes(lock.who)) return no('mandate.refuse.lockRules');
      return p.on && !m.switches.agree ? no('mandate.refuse.lockNeedsAgree') : null;
    }
    case 'resume':
      return m.stopped ? null : no('mandate.refuse.notStopped');
  }
}

/// The mandate as it will read after the change, for the card. Pure; the route
/// writes each part to its own store.
export function previewPatch(m: Mandate, p: MandatePatch, now: number): Mandate {
  switch (p.part) {
    case 'sell-price':
      return { ...m, sell: m.sell.map((w) => (w.shape === p.shape ? { ...w, lowestUsdc: p.lowestUsdc, ...(p.usualUsdc !== undefined ? { usualUsdc: p.usualUsdc } : {}) } : w)) };
    case 'alone': {
      const { offers, bargain, agree, data } = switchesOfMode(p.mode);
      return { ...m, alone: p.mode, switches: { ...m.switches, offers, bargain, agree, data } };
    }
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
    case 'power':
      return { ...m, on: p.on };
    case 'switch': {
      const switches = { ...m.switches, [p.name]: p.on };
      if (!switches.agree) switches.lock = false;
      return { ...m, switches, alone: modeOf(switches), brief: p.name === 'brief' ? { ...m.brief, on: p.on } : m.brief };
    }
    case 'lock-rules': {
      const lock = lockAfter(m, p);
      return { ...m, lock: lock ?? m.lock, switches: p.on ? { ...m.switches, lock: true } : m.switches };
    }
    case 'resume':
      return { ...m, stopped: null, switches: { ...m.switches, lock: false } };
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

export function saidText(a: SaidUsdc): string {
  return a.said ? `${Number(a.said.amount).toLocaleString('en-US')} ${a.said.currency}` : `${num(a.usdc)} USDC`;
}

/// What it does alone and what is switched off, as one line.
function aloneLine(switches: Alone, locale: UserLocale): string {
  const names = (on: boolean) => AGENT_SWITCHES.filter((name) => switches[name] === on).map((name) => tg(`mandate.switch.${name}`, locale)).join(', ');
  const does = names(true);
  const not = names(false);
  return [does ? tg('mandate.does', locale, { list: does }) : '', not ? tg('mandate.doesNot', locale, { list: not }) : ''].filter(Boolean).join(' ');
}

/// The mandate in the person's words, one line per part. Templates only.
export function sayMandate(m: Mandate, locale: UserLocale = 'en'): string[] {
  const lines: string[] = m.on === false ? [tg('mandate.off', locale)] : [];
  if (m.stopped) lines.push(tg(`mandate.stopped.${m.stopped.reason}`, locale, { n: String(m.lock?.perDay ?? DEFAULT_LOCKS_PER_DAY) }));
  lines.push(...(m.sell.length ? m.sell.map((w) => sellLine(w, locale)) : [tg('mandate.sellNone', locale)]));
  if (m.buy.mostUsdc !== null) lines.push(tg('mandate.buy', locale, { most: num(m.buy.mostUsdc) }));
  lines.push(aloneLine(m.switches, locale));
  if (m.lock && m.switches.lock) {
    lines.push(tg('mandate.lockRules', locale, { deal: saidText(m.lock.perDeal), week: saidText(m.lock.perWeek), who: tg(`mandate.who.${m.lock.who}`, locale), day: String(m.lock.perDay) }));
  }
  lines.push(tg('mandate.weeklyLimit', locale, { usdc: num(m.weeklyLimitUsdc) }));
  if (m.watches.length) lines.push(tg(m.watches.length === 1 ? 'mandate.watchesOne' : 'mandate.watches', locale, { count: String(m.watches.length) }));
  if (m.goals.length) lines.push(tg('mandate.goals', locale, { list: m.goals.map((g) => g.text).join('; ') }));
  lines.push(m.brief.on ? tg('mandate.brief', locale, { hour: String(m.brief.hour), zone: zoneName(m.brief.timeZone) }) : tg('mandate.briefOff', locale));
  lines.push(m.quiet ? tg('mandate.quiet', locale, { from: String(m.quiet.from), to: String(m.quiet.to) }) : tg('mandate.quietOff', locale));
  return lines;
}
