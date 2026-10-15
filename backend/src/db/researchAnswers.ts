import { pgEnabled, postgresExecutor } from './client.js';

/// Answers to the public research survey at /research. Postgres in
/// production; an in-memory list without a database (local development).
/// Nothing about the sender is kept beyond what they typed and the language.

export const RESEARCH_ROLES = ['seller', 'buyer', 'both', 'platform'] as const;
export const RESEARCH_SIGNALS = ['reviews', 'past_work', 'vouch', 'id', 'test_job'] as const;
export const RESEARCH_CHECKS = [...RESEARCH_SIGNALS, 'nothing', 'other'] as const;
export const RESEARCH_SHARE = ['yes', 'if_i_choose', 'one_deal', 'no'] as const;
export const RESEARCH_PAYER = ['checker', 'app', 'free', 'not_sure'] as const;

export interface ResearchAnswer {
  id: string;
  createdAt: number;
  locale: string;
  role: (typeof RESEARCH_ROLES)[number];
  checks: Array<(typeof RESEARCH_CHECKS)[number]>;
  otherText: string | null;
  trustMost: (typeof RESEARCH_SIGNALS)[number];
  easiestFake: (typeof RESEARCH_SIGNALS)[number];
  share: (typeof RESEARCH_SHARE)[number];
  payer: (typeof RESEARCH_PAYER)[number];
  contact: string | null;
}

const mem: ResearchAnswer[] = [];

export async function saveResearchAnswer(answer: ResearchAnswer): Promise<void> {
  if (!pgEnabled) {
    mem.push(answer);
    return;
  }
  await postgresExecutor().query(
    `INSERT INTO research_answers_v1
       (id, created_at, locale, role, checks, other_text, trust_most, easiest_fake, share, payer, contact)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      answer.id,
      answer.createdAt,
      answer.locale,
      answer.role,
      answer.checks.join(','),
      answer.otherText,
      answer.trustMost,
      answer.easiestFake,
      answer.share,
      answer.payer,
      answer.contact,
    ],
  );
}

type Row = {
  id: string;
  created_at: string;
  locale: string;
  role: string;
  checks: string;
  other_text: string | null;
  trust_most: string;
  easiest_fake: string;
  share: string;
  payer: string;
  contact: string | null;
};

export async function listResearchAnswers(): Promise<ResearchAnswer[]> {
  if (!pgEnabled) return [...mem];
  const { rows } = await postgresExecutor().query<Row>('SELECT * FROM research_answers_v1 ORDER BY created_at ASC');
  return rows.map((r) => ({
    id: r.id,
    createdAt: Number(r.created_at),
    locale: r.locale,
    role: r.role as ResearchAnswer['role'],
    checks: r.checks.split(',').filter(Boolean) as ResearchAnswer['checks'],
    otherText: r.other_text,
    trustMost: r.trust_most as ResearchAnswer['trustMost'],
    easiestFake: r.easiest_fake as ResearchAnswer['easiestFake'],
    share: r.share as ResearchAnswer['share'],
    payer: r.payer as ResearchAnswer['payer'],
    contact: r.contact,
  }));
}

const tally = <T extends string>(keys: readonly T[], picked: (a: ResearchAnswer) => readonly string[], answers: ResearchAnswer[]) => {
  const counts = Object.fromEntries(keys.map((k) => [k, 0])) as Record<T, number>;
  for (const a of answers) for (const p of new Set(picked(a))) if (p in counts) counts[p as T] += 1;
  return counts;
};

/// Counts per answer, for the admin read. A person who ticked several checks
/// counts once under each.
export function summarizeResearchAnswers(answers: ResearchAnswer[]) {
  return {
    total: answers.length,
    withContact: answers.filter((a) => a.contact).length,
    role: tally(RESEARCH_ROLES, (a) => [a.role], answers),
    checks: tally(RESEARCH_CHECKS, (a) => a.checks, answers),
    trustMost: tally(RESEARCH_SIGNALS, (a) => [a.trustMost], answers),
    easiestFake: tally(RESEARCH_SIGNALS, (a) => [a.easiestFake], answers),
    share: tally(RESEARCH_SHARE, (a) => [a.share], answers),
    payer: tally(RESEARCH_PAYER, (a) => [a.payer], answers),
  };
}
