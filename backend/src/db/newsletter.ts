import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { desc, eq } from 'drizzle-orm';
import { db, pgEnabled } from './client.js';
import { newsletterIssues } from './schema.js';

/// Newsletter issues, from draft to sent.
///
/// The state machine is deliberately small. A draft is written, a human either
/// approves it or rejects it with a note, and only an approved issue can be
/// sent. Nothing here sends anything: that is a later phase, and keeping the
/// store ignorant of it means a bug in the send path cannot silently mark an
/// issue as delivered.
///
/// A rejection is not a delete. The note is the most useful thing in the table,
/// because it is the only record of what was wrong with a draft, and the next
/// draft is written with it in hand.

export type IssueStatus = 'draft' | 'approved' | 'rejected' | 'sent';

export interface IssueSection {
  /// 'shipped' | 'ecosystem' | 'learned', in render order.
  key: SectionKey;
  heading: string;
  /// Rendered markdown-ish body for this section.
  body: string;
  /// Signal ids this section was written from. The trace back to sources, and
  /// what the fact pass checks a claim against.
  signalIds: string[];
}

export type SectionKey = 'shipped' | 'ecosystem' | 'learned';

export interface IssueSource {
  signalId: string;
  title: string;
  url: string;
  source: string;
  publishedAt: number;
}

export interface NewsletterIssue {
  id: string;
  status: IssueStatus;
  /// Subject line. Editable before approval.
  subject: string;
  preheader: string;
  sections: IssueSection[];
  sources: IssueSource[];
  /// Everything collected for this issue, whether or not it made the draft.
  /// Kept so a rejected draft can be rewritten without re-collecting.
  signalIds: string[];
  /// The window this issue covers. `from` is the previous issue's `to`, so
  /// nothing is collected twice and nothing falls between two issues.
  from: number;
  to: number;
  /// True when the monthly floor produced this rather than real news.
  monthInReview: boolean;
  createdAt: number;
  updatedAt: number;
  approvedAt?: number;
  sentAt?: number;
  rejectedAt?: number;
  /// Why it was rejected, in the reviewer's words. Feeds the next draft.
  rejectionNote?: string;
  /// Which model wrote it, so a bad run can be traced to a provider.
  draftedBy?: string;
}

const STORE_PATH = process.env.NEWSLETTER_STORE_PATH
  ? resolve(process.env.NEWSLETTER_STORE_PATH)
  : resolve(process.cwd(), 'data', 'newsletter-issues.json');

export interface NewIssue {
  subject: string;
  preheader: string;
  sections: IssueSection[];
  sources: IssueSource[];
  signalIds: string[];
  from: number;
  to: number;
  monthInReview: boolean;
  draftedBy?: string;
}

export async function createIssue(input: NewIssue): Promise<NewsletterIssue> {
  const now = Date.now();
  const issue: NewsletterIssue = {
    id: randomUUID(),
    status: 'draft',
    ...input,
    createdAt: now,
    updatedAt: now,
  };

  if (pgEnabled) {
    await db().insert(newsletterIssues).values({
      id: issue.id,
      status: issue.status,
      createdAt: issue.createdAt,
      sentAt: null,
      data: issue,
    });
  } else {
    const store = loadFile();
    store[issue.id] = issue;
    saveFile(store);
  }
  return issue;
}

export async function listIssues(limit = 50): Promise<NewsletterIssue[]> {
  const all = pgEnabled
    ? (await db().select().from(newsletterIssues).orderBy(desc(newsletterIssues.createdAt))).map(
        (r) => r.data,
      )
    : Object.values(loadFile());
  return all.sort((a, b) => b.createdAt - a.createdAt).slice(0, limit);
}

export async function getIssue(id: string): Promise<NewsletterIssue | null> {
  if (pgEnabled) {
    const rows = await db().select().from(newsletterIssues).where(eq(newsletterIssues.id, id));
    return rows[0]?.data ?? null;
  }
  return loadFile()[id] ?? null;
}

/// The end of the last window we covered.
///
/// Reads the newest issue of ANY status, not just sent ones. A draft that exists
/// has already claimed its signals, and collecting them again would produce a
/// second draft saying the same things.
export async function lastCoveredAt(): Promise<number | null> {
  const issues = await listIssues(1);
  return issues[0]?.to ?? null;
}

export async function lastSentAt(): Promise<number | null> {
  const all = await listIssues(200);
  const sent = all.filter((i) => i.sentAt).sort((a, b) => (b.sentAt ?? 0) - (a.sentAt ?? 0));
  return sent[0]?.sentAt ?? null;
}

/// Issues sent within a calendar month, in UTC. Used by the monthly cap and by
/// the monthly floor, which are the same question asked in opposite directions.
export async function sentInMonth(when: Date): Promise<NewsletterIssue[]> {
  const all = await listIssues(200);
  const year = when.getUTCFullYear();
  const month = when.getUTCMonth();
  return all.filter((i) => {
    if (!i.sentAt) return false;
    const at = new Date(i.sentAt);
    return at.getUTCFullYear() === year && at.getUTCMonth() === month;
  });
}

export interface IssueEdit {
  subject?: string;
  preheader?: string;
  sections?: IssueSection[];
}

/// Edit a draft in place.
///
/// Only a draft. Editing an approved issue would mean the thing approved is not
/// the thing that goes out, which makes the approval meaningless.
export async function editIssue(id: string, edit: IssueEdit): Promise<NewsletterIssue | null> {
  const issue = await getIssue(id);
  if (!issue) return null;
  if (issue.status !== 'draft') {
    throw new Error(`this issue is ${issue.status}, and only a draft can be edited`);
  }

  const next: NewsletterIssue = {
    ...issue,
    subject: edit.subject ?? issue.subject,
    preheader: edit.preheader ?? issue.preheader,
    sections: edit.sections ?? issue.sections,
    updatedAt: Date.now(),
  };
  await persist(next);
  return next;
}

export async function approveIssue(id: string): Promise<NewsletterIssue | null> {
  const issue = await getIssue(id);
  if (!issue) return null;
  if (issue.status === 'approved') return issue;
  if (issue.status !== 'draft') {
    throw new Error(`this issue is ${issue.status} and cannot be approved`);
  }

  const next: NewsletterIssue = {
    ...issue,
    status: 'approved',
    approvedAt: Date.now(),
    updatedAt: Date.now(),
  };
  await persist(next);
  return next;
}

export async function rejectIssue(id: string, note: string): Promise<NewsletterIssue | null> {
  const issue = await getIssue(id);
  if (!issue) return null;
  if (issue.status === 'sent') throw new Error('this issue has already gone out');

  const next: NewsletterIssue = {
    ...issue,
    status: 'rejected',
    rejectedAt: Date.now(),
    updatedAt: Date.now(),
    rejectionNote: note.trim(),
  };
  await persist(next);
  return next;
}

/// The most recent rejection note, for the next draft's prompt. A reviewer who
/// says "too long, and stop calling it a platform" should not have to say it
/// twice.
export async function latestRejectionNote(): Promise<string | null> {
  const all = await listIssues(20);
  const rejected = all
    .filter((i) => i.rejectionNote)
    .sort((a, b) => (b.rejectedAt ?? 0) - (a.rejectedAt ?? 0));
  return rejected[0]?.rejectionNote ?? null;
}

/// Mark an approved issue as sent. The send itself lives elsewhere; this only
/// records that it happened, and refuses on anything not approved so a draft
/// can never be marked delivered.
export async function markSent(id: string): Promise<NewsletterIssue | null> {
  const issue = await getIssue(id);
  if (!issue) return null;
  if (issue.status !== 'approved') {
    throw new Error(`this issue is ${issue.status}, and only an approved issue can be sent`);
  }

  const next: NewsletterIssue = {
    ...issue,
    status: 'sent',
    sentAt: Date.now(),
    updatedAt: Date.now(),
  };
  await persist(next);
  return next;
}

async function persist(issue: NewsletterIssue): Promise<void> {
  if (pgEnabled) {
    await db()
      .update(newsletterIssues)
      .set({ status: issue.status, sentAt: issue.sentAt ?? null, data: issue })
      .where(eq(newsletterIssues.id, issue.id));
    return;
  }
  const store = loadFile();
  store[issue.id] = issue;
  saveFile(store);
}

function ensureFile() {
  const dir = dirname(STORE_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  if (!existsSync(STORE_PATH)) writeFileSync(STORE_PATH, '{}', 'utf8');
}

function loadFile(): Record<string, NewsletterIssue> {
  ensureFile();
  try {
    return JSON.parse(readFileSync(STORE_PATH, 'utf8')) as Record<string, NewsletterIssue>;
  } catch {
    return {};
  }
}

function saveFile(store: Record<string, NewsletterIssue>) {
  ensureFile();
  writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), 'utf8');
}
