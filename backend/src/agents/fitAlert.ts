import { localDay, localHour, type ProgressStore } from '../db/agentProgress.js';
import type { UserLocale } from '../db/profiles.js';
import { tg } from '../i18n/telegram.js';
import type { AgentRecord } from './agentRecord.js';
import { DEFAULT_BRIEF, DEFAULT_QUIET, type QuietHours } from './mandate.js';
import { inQuietHours, type PersonEvent } from './personAgent.js';

/// One way every open trade tells a person it fits them (view 96): a request,
/// an offer for sale, hourly or monthly work, or a contest. Each thing is told
/// to each person once. In quiet hours, past eight a day, or past three passes
/// a day, it waits for the brief instead of being dropped. Lines come from
/// templates in the person's language and money; no model writes a word.

export const FITS_PER_DAY = 8;
export const PASSES_SENT_PER_DAY = 3;
const WINDOW_MS = 36 * 3_600_000;

export type FitKind = 'request' | 'offer' | 'work' | 'contest';
export type FitWhat = 'offered' | 'fits' | 'passed' | 'reminder';
export type PassReason = 'under-lowest' | 'buyer-record' | 'needs-guarantee' | 'business-only' | 'weekly-limit' | 'agent-off';

export interface FitFacts {
  title: string;
  amountUsdc?: number;
  /// Hourly or monthly work: the rate is per hour or per month.
  per?: 'hour' | 'month';
  closesAt?: number;
  winners?: number;
}

export interface FitInput {
  to: string;
  kind: FitKind;
  ref: string;
  what: FitWhat;
  reason?: PassReason;
  facts: FitFacts;
  /// Where the note opens: a request page by its jobId, anything else by path.
  jobId?: string;
  path?: string;
}

export interface FitDeps {
  now(): number;
  progress: Pick<ProgressStore, 'claim' | 'markSent' | 'toldSince'>;
  recordFor(owner: string): Promise<AgentRecord | null>;
  locale(owner: string): Promise<UserLocale>;
  /// A USDC amount in the person's own currency.
  money(owner: string, usdc: number): Promise<string>;
  emit(e: PersonEvent & { data: PersonEvent['data'] & { path?: string } }): void;
}

export type FitResult = 'sent' | 'held' | 'told';

/// The key a thing is told under, once per person.
export function fitKey(i: Pick<FitInput, 'kind' | 'ref' | 'what'>): string {
  return `${i.kind}:${i.ref}${i.what === 'reminder' ? ':reminder' : ''}`;
}

const quietOf = (r: AgentRecord | null): QuietHours | null => (r?.quiet === undefined ? DEFAULT_QUIET : r.quiet);

export async function fitLines(i: FitInput, locale: UserLocale, money: (usdc: number) => Promise<string>, timeZone = 'UTC'): Promise<string[]> {
  const f = i.facts;
  const amount = f.amountUsdc !== undefined ? await money(f.amountUsdc) : '';
  const per = f.per ? tg(f.per === 'hour' ? 'fit.perHour' : 'fit.perMonth', locale) : '';
  const vars = { title: f.title, amount, per };
  if (i.what === 'passed') {
    return [tg('fit.passed.lead', locale, vars), tg(`fit.passed.${i.reason ?? 'agent-off'}`, locale), tg('fit.passed.tail', locale)];
  }
  if (i.kind === 'contest') {
    const date = f.closesAt ? new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : locale, { timeZone, day: 'numeric', month: 'short' }).format(f.closesAt) : '';
    if (i.what === 'reminder') return [tg('fit.reminder.contest', locale, vars)];
    return [tg('fit.fits.contest', locale, { ...vars, winners: String(f.winners ?? 1), date })];
  }
  if (i.what === 'offered') return [tg(i.kind === 'work' ? 'fit.offered.work' : 'fit.offered.request', locale, vars)];
  return [tg(i.kind === 'work' ? 'fit.fits.work' : i.kind === 'offer' ? 'fit.fits.offer' : 'fit.fits.request', locale, vars)];
}

/// Tells one person that one thing fits them, once.
export async function tellFit(deps: FitDeps, i: FitInput): Promise<FitResult> {
  const now = deps.now();
  const record = await deps.recordFor(i.to).catch(() => null);
  const timeZone = record?.brief?.timeZone ?? DEFAULT_BRIEF.timeZone;
  const day = localDay(now, timeZone);
  const key = fitKey(i);
  const told = await deps.progress.toldSince(i.to, now - WINDOW_MS);
  const today = told.filter((r) => r.kind === 'fit' && r.data.day === day && r.data.in === 'note');
  const passes = today.filter((r) => r.data.what === 'passed').length;
  const sent = today.length - passes;
  const hold = inQuietHours(localHour(now, timeZone), quietOf(record))
    || (i.what === 'passed' ? passes >= PASSES_SENT_PER_DAY : sent >= FITS_PER_DAY);
  const link = i.jobId ? { jobId: i.jobId } : i.path ? { path: i.path } : {};
  // One row per person and thing, whatever the day: inserting it is the claim.
  const claimed = await deps.progress.claim(i.to, 'once', 'fit', key, { day, in: hold ? 'brief' : 'note', what: i.what, kind: i.kind, title: i.facts.title, ...link }, now);
  if (!claimed) return 'told';
  if (hold) return 'held';
  const locale = await deps.locale(i.to);
  const lines = await fitLines(i, locale, (usdc) => deps.money(i.to, usdc), timeZone);
  deps.emit({ type: 'agent.note', user: i.to, data: { heading: tg('fit.heading', locale), lines, ...link } });
  await deps.progress.markSent(i.to, 'once', 'fit', key, now);
  return 'sent';
}

/// Fits held for the brief since a time, newest first.
export function heldFits(rows: ReadonlyArray<{ kind: string; at: number; data: Record<string, unknown> }>, since: number): Array<{ title: string; at: number }> {
  return rows
    .filter((r) => r.kind === 'fit' && r.data.in === 'brief' && r.at >= since && typeof r.data.title === 'string')
    .sort((a, b) => b.at - a.at)
    .map((r) => ({ title: r.data.title as string, at: r.at }));
}
