import { generateObject } from 'ai';
import { z } from 'zod';
import { llmModel } from '../llm/client.js';
import { latestRejectionNote, type IssueSection, type SectionKey } from '../db/newsletter.js';
import { reviewDraft, type Finding } from './checks.js';
import type { Cluster, Decision } from './collect.js';
import { logger } from '../logger.js';

/// Writing the issue.
///
/// The model is given the signals and nothing else. It is not asked what it
/// knows about Karwan, because what it knows about Karwan is last quarter's
/// product described with this quarter's confidence. Every section is written
/// from the takes already in the pipeline, which is why the take field is the
/// one the admin form is built around.
///
/// If the model is unavailable the draft fails loudly. A newsletter is not worth
/// degrading for: silence this week is fine, and something thin going out under
/// our name is not.

const sectionSchema = z.object({
  key: z.enum(['shipped', 'ecosystem', 'learned']),
  body: z
    .string()
    .describe('Two to five short paragraphs. Every claim carries its source link inline as markdown.'),
});

const draftSchema = z.object({
  subject: z.string().describe('Under 60 characters. A claim, not a label. No colon-subtitle.'),
  preheader: z.string().describe('Under 100 characters. Extends the subject, never repeats it.'),
  sections: z.array(sectionSchema),
});

const VOICE = `Write as Karwan.

Start with the claim, not a windup. Sentence case headings. Concrete over
abstract: "a supplier in Lagos waits ninety days" beats "payment delays affect
SMEs". Name the failure and what it cost. Short sentences carry weight, and a
long one is fine when the idea needs it.

Never use an em dash. Use a period or a comma.
Never use: seamless, robust, game-changing, cutting-edge, delve, leverage the
power, unlock the potential, revolutionise, supercharge.
No rule of three. No hedging. No filler openers.

Every factual claim carries its source as an inline markdown link. A sentence
about what Karwan does must come from the "what we shipped" signals; do not
write anything about Karwan that the signals below do not say. If you cannot
support it, leave it out.`;

function sectionBrief(cluster: Cluster): string {
  const lines = cluster.signals.map((s) => {
    const parts = [
      `- ${s.title}`,
      s.url ? `  link: ${s.url}` : null,
      s.source ? `  source: ${s.source}` : null,
      `  date: ${new Date(s.publishedAt).toISOString().slice(0, 10)}`,
      s.summary ? `  summary: ${s.summary}` : null,
      s.myTake ? `  OUR TAKE: ${s.myTake}` : null,
      s.rawExcerpt ? `  excerpt: ${s.rawExcerpt.slice(0, 600)}` : null,
    ].filter(Boolean);
    return parts.join('\n');
  });
  return `## ${cluster.heading} (key: ${cluster.key})\n${lines.join('\n\n')}`;
}

const HEADINGS: Record<SectionKey, string> = {
  shipped: 'What we shipped',
  ecosystem: 'What moved on Arc and Circle',
  learned: 'What we learned',
};

export interface DraftResult {
  subject: string;
  preheader: string;
  sections: IssueSection[];
  /// Findings that survived the retry. Warnings only when the draft is usable.
  findings: Finding[];
  draftedBy: string;
  /// How many attempts it took. More than one means the first draft broke a
  /// rule and was sent back with the specific findings.
  attempts: number;
}

export class DraftFailed extends Error {}

/// Write the issue, check it, and give the model its own findings back once.
///
/// One retry, not a loop. A model that breaks the voice rules twice with the
/// specific line numbers in hand is not going to get there on the third pass,
/// and a loop here is a loop nobody is watching.
export async function writeDraft(decision: Decision, opts: { maxAttempts?: number } = {}): Promise<DraftResult> {
  if (decision.clusters.length === 0) throw new DraftFailed('nothing to draft from');

  const rejection = await latestRejectionNote();
  const brief = decision.clusters.map(sectionBrief).join('\n\n');
  const maxAttempts = opts.maxAttempts ?? 2;

  const context = [
    VOICE,
    rejection
      ? `\nThe last draft was rejected with this note. Do not repeat the mistake:\n"${rejection}"`
      : '',
    decision.monthInReview
      ? '\nThis is a short month in review, not a full issue. Keep it brief and do not pad it.'
      : '',
    `\nEverything you may write from:\n\n${brief}`,
  ]
    .filter(Boolean)
    .join('\n');

  let lastFindings: Finding[] = [];

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const corrections =
      lastFindings.length > 0
        ? `\n\nYour previous draft broke these rules. Fix every one:\n${lastFindings
            .map((f) => `- ${f.rule}: "${f.excerpt}" — ${f.fix}`)
            .join('\n')}`
        : '';

    let result;
    try {
      result = await generateObject({
        model: llmModel,
        schema: draftSchema,
        prompt: `${context}${corrections}\n\nWrite the issue.`,
      });
    } catch (e) {
      // Loudly, not quietly. Every provider in the chain is down, and the right
      // outcome is no issue this week rather than a thin one.
      throw new DraftFailed(
        `no LLM provider could write the draft: ${(e as Error).message}`,
      );
    }

    const sections: IssueSection[] = result.object.sections
      .filter((s) => s.body.trim())
      .map((s) => ({
        key: s.key,
        heading: HEADINGS[s.key],
        body: s.body.trim(),
        signalIds: decision.clusters.find((c) => c.key === s.key)?.signals.map((x) => x.id) ?? [],
      }));

    const whole = [result.object.subject, result.object.preheader, ...sections.map((s) => s.body)].join(
      '\n',
    );
    const review = reviewDraft(whole, decision.signals);

    if (review.clean) {
      return {
        subject: result.object.subject.trim(),
        preheader: result.object.preheader.trim(),
        sections,
        findings: review.findings,
        draftedBy: llmModel.modelId ?? 'unknown',
        attempts: attempt,
      };
    }

    lastFindings = review.findings.filter((f) => f.severity === 'error');
    logger.warn(
      { attempt, errors: review.errors, rules: [...new Set(lastFindings.map((f) => f.rule))] },
      'newsletter draft failed its own checks',
    );
  }

  throw new DraftFailed(
    `the draft still broke ${lastFindings.length} rule(s) after ${maxAttempts} attempts: ${[
      ...new Set(lastFindings.map((f) => f.rule)),
    ].join(', ')}`,
  );
}
