import { localDay, localHour, type ProgressRow, type ProgressStore } from '../db/agentProgress.js';
import type { UserLocale } from '../db/profiles.js';
import { tg } from '../i18n/telegram.js';
import type { Insight } from '../intelligence/insights.js';
import { insightLine, plain } from '../intelligence/insightText.js';
import { logger } from '../logger.js';
import type { AgentRecord } from './agentRecord.js';
import { composeBrief, type BriefFacts } from './brief.js';
import { DEFAULT_BRIEF, DEFAULT_QUIET, type QuietHours } from './mandate.js';

/// The agent that wakes for the person (view 52, step 4). One loop for
/// everyone, keyed by person, with no model: an hourly tick sends each person
/// their brief once their brief hour has come where they are, and an offer on
/// their request may send one live note. Every message is written to the
/// progress log before it goes out and marked sent after, so a restart or a
/// second server never sends it twice.

export const INSIGHTS_PER_DAY = 3;
const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;

export type BriefGathered = Omit<BriefFacts, 'insightsAllowed' | 'told' | 'timeZone'>;

export interface PersonEvent {
  type: 'agent.brief' | 'agent.note';
  user: string;
  data: { heading: string; lines: string[]; jobId?: string; openLabel?: string };
}

export interface PersonAgentDeps {
  now(): number;
  people(): Promise<AgentRecord[]>;
  recordFor(owner: string): Promise<AgentRecord | null>;
  locale(owner: string): Promise<UserLocale>;
  progress: ProgressStore;
  /// The person's facts since their last brief, insights already filtered by
  /// the week's repeat rule.
  gather(owner: string, ctx: { since: number; now: number; record: AgentRecord; timeZone: string }): Promise<BriefGathered>;
  ownerOfRequest(jobId: string): Promise<string | null>;
  /// The cheaper-sellers insight on this request now, or null.
  insightForOffer(owner: string, jobId: string, now: number): Promise<Insight | null>;
  emit(e: PersonEvent): void;
  closeGoals(owner: string, ids: string[]): Promise<void>;
  markInsightsSent(owner: string, insights: Insight[], now: number): Promise<void>;
}

export function inQuietHours(hour: number, quiet: QuietHours | null): boolean {
  if (!quiet) return false;
  return quiet.from > quiet.to ? hour >= quiet.from || hour < quiet.to : hour >= quiet.from && hour < quiet.to;
}

const briefOf = (r: AgentRecord) => ({ ...DEFAULT_BRIEF, ...(r.brief ?? {}) });
const quietOf = (r: AgentRecord): QuietHours | null => (r.quiet === undefined ? DEFAULT_QUIET : r.quiet);

async function briefFor(deps: PersonAgentDeps, record: AgentRecord, now: number): Promise<void> {
  const owner = record.owner;
  const brief = briefOf(record);
  if (!brief.on || localHour(now, brief.timeZone) < brief.hour) return;
  const day = localDay(now, brief.timeZone);
  const week: ProgressRow[] = await deps.progress.toldSince(owner, now - WEEK_MS);
  if (week.some((r) => r.kind === 'brief' && r.day === day)) return;

  const lastBrief = week.find((r) => r.kind === 'brief');
  const since = lastBrief ? lastBrief.at : now - DAY_MS;
  const gathered = await deps.gather(owner, { since, now, record, timeZone: brief.timeZone });
  const sentToday = week.filter((r) => r.kind === 'insight' && r.day === day).length;
  const told = week.flatMap((r) => (Array.isArray(r.data.goalKeys) ? (r.data.goalKeys as string[]) : []));
  const locale = await deps.locale(owner);
  const composed = composeBrief({ ...gathered, timeZone: brief.timeZone, insightsAllowed: INSIGHTS_PER_DAY - sentToday, told }, locale);

  const lines = composed?.lines ?? [];
  if (!(await deps.progress.claim(owner, day, 'brief', 'day', composed ? { lines, goalKeys: composed.goalKeys } : { lines }, now))) return;
  if (!composed) {
    // Nothing to say today; logged so the next ticks do not gather again.
    await deps.progress.markSent(owner, day, 'brief', 'day', now);
    return;
  }
  const insights = gathered.insights.filter((i) => composed.insightKeys.includes(i.key));
  for (const i of insights) await deps.progress.claim(owner, day, 'insight', i.key, { in: 'brief' }, now);
  deps.emit({ type: 'agent.brief', user: owner, data: { heading: composed.heading, lines, openLabel: tg('brief.open', locale) } });
  await deps.progress.markSent(owner, day, 'brief', 'day', now);
  for (const i of insights) await deps.progress.markSent(owner, day, 'insight', i.key, now);
  if (insights.length) await deps.markInsightsSent(owner, insights, now);
  const expired = composed.goalKeys.filter((k) => k.startsWith('goal-expired:')).map((k) => k.slice('goal-expired:'.length));
  if (expired.length) await deps.closeGoals(owner, expired);
}

/// The hourly tick. One person's failure is logged and the others go on.
export async function briefTick(deps: PersonAgentDeps): Promise<number> {
  const now = deps.now();
  let failed = 0;
  for (const record of await deps.people()) {
    try {
      await briefFor(deps, record, now);
    } catch (err) {
      failed += 1;
      logger.warn({ owner: record.owner, err: (err as Error).message }, 'person agent brief failed');
    }
  }
  return failed;
}

export type NoteResult = 'sent' | 'none' | 'quiet' | 'cap' | 'told' | 'off';

/// A new offer on the person's open request: when cheaper sellers with as good
/// a record are now there, the agent says so, inside the day's insight cap and
/// outside quiet hours. In quiet hours the note waits for the brief.
export async function onOfferOnRequest(deps: PersonAgentDeps, jobId: string): Promise<NoteResult> {
  const now = deps.now();
  const owner = await deps.ownerOfRequest(jobId);
  if (!owner) return 'none';
  const record = await deps.recordFor(owner);
  if (!record) return 'off';
  const insight = await deps.insightForOffer(owner, jobId, now);
  if (!insight) return 'none';
  const { timeZone } = briefOf(record);
  if (inQuietHours(localHour(now, timeZone), quietOf(record))) return 'quiet';
  const day = localDay(now, timeZone);
  const week = await deps.progress.toldSince(owner, now - WEEK_MS);
  if (week.some((r) => r.kind === 'insight' && r.key === insight.key)) return 'told';
  if ((await deps.progress.insightsToday(owner, day)) >= INSIGHTS_PER_DAY) return 'cap';
  const locale = await deps.locale(owner);
  const line = insightLine(insight, locale);
  if (!line) return 'none';
  if (!(await deps.progress.claim(owner, day, 'insight', insight.key, { in: 'note', lines: [plain(line)], jobId }, now))) return 'told';
  deps.emit({ type: 'agent.note', user: owner, data: { heading: tg('note.heading', locale), lines: [plain(line)], jobId } });
  await deps.progress.markSent(owner, day, 'insight', insight.key, now);
  await deps.markInsightsSent(owner, [insight], now);
  return 'sent';
}
