import { randomUUID } from 'node:crypto';
import { and, desc, eq, gt, isNull, lte } from 'drizzle-orm';
import { db, pgEnabled } from './client.js';
import { agentQuestions } from './schema.js';

/// What an agent asks its person instead of going quiet (view 41): a request
/// that fits but sits outside their limits, or a counter past their floor.
/// One open question per person and request; a newer one updates the facts
/// and keeps the id, so the card the person already has stays the same card.
/// The state names follow the Agent2Agent task states (input-required).

export type QuestionSide = 'seller' | 'buyer';
export type QuestionKind =
  | 'price-below-floor'
  | 'price-above-cap'
  | 'price-above-usual'
  | 'time'
  | 'place'
  | 'no-way'
  | 'ask-first'
  | 'counter-below-floor'
  | 'last-price-passed';
export type QuestionState = 'input-required' | 'answered' | 'expired';

export interface QuestionAnswer {
  choice: 'yes' | 'change' | 'no';
  priceUsdc?: string;
  days?: number;
}

export interface AgentQuestion {
  id: string;
  owner: string;
  side: QuestionSide;
  jobId: string;
  kind: QuestionKind;
  title: string;
  facts: Record<string, unknown>;
  suggested: { priceUsdc?: string; days?: number };
  state: QuestionState;
  answer: QuestionAnswer | null;
  mandateVersion: number;
  createdAt: number;
  updatedAt: number;
  remindedAt: number | null;
}

/// eBay lets an offer wait 24 hours; so does a question.
export const QUESTION_TTL_MS = 24 * 3_600_000;
/// One reminder, inside the first hour (view 41).
export const QUESTION_REMIND_AFTER_MS = 30 * 60_000;

const mem = new Map<string, AgentQuestion>();

const fromRow = (row: typeof agentQuestions.$inferSelect): AgentQuestion => ({
  ...row,
  side: row.side as QuestionSide,
  kind: row.kind as QuestionKind,
  state: row.state as QuestionState,
  facts: (row.facts ?? {}) as Record<string, unknown>,
  suggested: (row.suggested ?? {}) as AgentQuestion['suggested'],
  answer: (row.answer ?? null) as QuestionAnswer | null,
});

const live = (q: AgentQuestion, now: number) => q.state === 'input-required' && q.createdAt + QUESTION_TTL_MS > now;

export async function openFor(owner: string, jobId: string): Promise<AgentQuestion | null> {
  if (!pgEnabled) {
    return [...mem.values()].find((q) => q.owner === owner && q.jobId === jobId && q.state === 'input-required') ?? null;
  }
  const [row] = await db()
    .select()
    .from(agentQuestions)
    .where(and(eq(agentQuestions.owner, owner), eq(agentQuestions.jobId, jobId), eq(agentQuestions.state, 'input-required')))
    .limit(1);
  return row ? fromRow(row) : null;
}

export async function putQuestion(input: {
  owner: string;
  side: QuestionSide;
  jobId: string;
  kind: QuestionKind;
  title: string;
  facts: Record<string, unknown>;
  suggested: AgentQuestion['suggested'];
  mandateVersion: number;
  now?: number;
}): Promise<AgentQuestion> {
  const now = input.now ?? Date.now();
  const owner = input.owner.toLowerCase();
  const jobId = input.jobId.toLowerCase();
  const current = await openFor(owner, jobId);
  const q: AgentQuestion = current
    ? { ...current, kind: input.kind, title: input.title, facts: input.facts, suggested: input.suggested, mandateVersion: input.mandateVersion, updatedAt: now }
    : {
        id: randomUUID(),
        owner,
        side: input.side,
        jobId,
        kind: input.kind,
        title: input.title,
        facts: input.facts,
        suggested: input.suggested,
        state: 'input-required',
        answer: null,
        mandateVersion: input.mandateVersion,
        createdAt: now,
        updatedAt: now,
        remindedAt: null,
      };
  if (!pgEnabled) {
    mem.set(q.id, q);
    return q;
  }
  await db()
    .insert(agentQuestions)
    .values(q)
    .onConflictDoUpdate({
      target: agentQuestions.id,
      set: { kind: q.kind, title: q.title, facts: q.facts, suggested: q.suggested, mandateVersion: q.mandateVersion, updatedAt: q.updatedAt },
    });
  return q;
}

export async function getQuestion(id: string): Promise<AgentQuestion | null> {
  if (!pgEnabled) return mem.get(id) ?? null;
  const [row] = await db().select().from(agentQuestions).where(eq(agentQuestions.id, id)).limit(1);
  return row ? fromRow(row) : null;
}

export async function openQuestionsFor(owner: string, now = Date.now()): Promise<AgentQuestion[]> {
  const o = owner.toLowerCase();
  const rows = !pgEnabled
    ? [...mem.values()].filter((q) => q.owner === o)
    : (await db()
        .select()
        .from(agentQuestions)
        .where(and(eq(agentQuestions.owner, o), eq(agentQuestions.state, 'input-required'), gt(agentQuestions.createdAt, now - QUESTION_TTL_MS)))).map(fromRow);
  return rows.filter((q) => live(q, now)).sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function openQuestionsOnJob(jobId: string, now = Date.now()): Promise<AgentQuestion[]> {
  const j = jobId.toLowerCase();
  const rows = !pgEnabled
    ? [...mem.values()].filter((q) => q.jobId === j)
    : (await db()
        .select()
        .from(agentQuestions)
        .where(and(eq(agentQuestions.jobId, j), eq(agentQuestions.state, 'input-required')))).map(fromRow);
  return rows.filter((q) => live(q, now));
}

/// What the person answered, newest first, for what their agent learns (view 41).
export async function recentAnsweredFor(owner: string, limit = 50): Promise<AgentQuestion[]> {
  const o = owner.toLowerCase();
  if (!pgEnabled) {
    return [...mem.values()].filter((q) => q.owner === o && q.state === 'answered').sort((a, b) => b.updatedAt - a.updatedAt).slice(0, limit);
  }
  const rows = await db()
    .select()
    .from(agentQuestions)
    .where(and(eq(agentQuestions.owner, o), eq(agentQuestions.state, 'answered')))
    .orderBy(desc(agentQuestions.updatedAt))
    .limit(limit);
  return rows.map(fromRow);
}

/// Null when the question is not this person's, already answered or expired.
export async function answerQuestion(id: string, owner: string, answer: QuestionAnswer, now = Date.now()): Promise<AgentQuestion | null> {
  const q = await getQuestion(id);
  if (!q || q.owner !== owner.toLowerCase() || !live(q, now)) return null;
  const done: AgentQuestion = { ...q, state: 'answered', answer, updatedAt: now };
  if (!pgEnabled) {
    mem.set(id, done);
    return done;
  }
  const rows = await db()
    .update(agentQuestions)
    .set({ state: 'answered', answer, updatedAt: now })
    .where(and(eq(agentQuestions.id, id), eq(agentQuestions.state, 'input-required')))
    .returning({ id: agentQuestions.id });
  return rows.length ? done : null;
}

export async function expireQuestionsForJob(jobId: string, now = Date.now()): Promise<number> {
  const j = jobId.toLowerCase();
  if (!pgEnabled) {
    let n = 0;
    for (const q of mem.values()) {
      if (q.jobId === j && q.state === 'input-required') {
        mem.set(q.id, { ...q, state: 'expired', updatedAt: now });
        n += 1;
      }
    }
    return n;
  }
  const rows = await db()
    .update(agentQuestions)
    .set({ state: 'expired', updatedAt: now })
    .where(and(eq(agentQuestions.jobId, j), eq(agentQuestions.state, 'input-required')))
    .returning({ id: agentQuestions.id });
  return rows.length;
}

export async function dueReminders(now = Date.now()): Promise<AgentQuestion[]> {
  const cutoff = now - QUESTION_REMIND_AFTER_MS;
  const rows = !pgEnabled
    ? [...mem.values()].filter((q) => q.remindedAt === null && q.createdAt <= cutoff)
    : (await db()
        .select()
        .from(agentQuestions)
        .where(and(eq(agentQuestions.state, 'input-required'), isNull(agentQuestions.remindedAt), lte(agentQuestions.createdAt, cutoff)))).map(fromRow);
  return rows.filter((q) => live(q, now));
}

export async function markReminded(id: string, now = Date.now()): Promise<void> {
  if (!pgEnabled) {
    const q = mem.get(id);
    if (q) mem.set(id, { ...q, remindedAt: now });
    return;
  }
  await db().update(agentQuestions).set({ remindedAt: now }).where(eq(agentQuestions.id, id));
}

export async function deleteQuestionsFor(address: string): Promise<number> {
  const a = address.toLowerCase();
  if (!pgEnabled) {
    let n = 0;
    for (const [id, q] of mem) {
      if (q.owner === a) {
        mem.delete(id);
        n += 1;
      }
    }
    return n;
  }
  const rows = await db().delete(agentQuestions).where(eq(agentQuestions.owner, a)).returning({ id: agentQuestions.id });
  return rows.length;
}
