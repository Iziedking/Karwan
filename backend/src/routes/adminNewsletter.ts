import { Hono } from 'hono';
import { z } from 'zod';
import { requireAdmin } from '../middleware/adminAuth.js';
import {
  approveIssue,
  createIssue,
  editIssue,
  getIssue,
  listIssues,
  rejectIssue,
  type IssueSource,
} from '../db/newsletter.js';
import { decide } from '../newsletter/collect.js';
import { writeDraft, DraftFailed } from '../newsletter/draft.js';
import { renderIssue } from '../newsletter/render.js';
import { reviewDraft } from '../newsletter/checks.js';
import { config } from '../config.js';
import { logger } from '../logger.js';

/// The newsletter, up to the approval gate and no further.
///
/// Nothing here sends. Approving marks an issue ready and stops; the send is a
/// separate phase with its own route, so a bug in this file cannot put an
/// unapproved draft in anyone's inbox.

export const adminNewsletterRoutes = new Hono();
adminNewsletterRoutes.use('*', requireAdmin);

function decideOptions(force = false) {
  return {
    enabled: config.NEWSLETTER_ENABLED,
    force,
    maxPerMonth: config.NEWSLETTER_MAX_PER_MONTH,
    minHoursBetweenSends: config.NEWSLETTER_MIN_HOURS_BETWEEN,
  };
}

function sourcesFrom(signals: Array<{ id: string; title: string; url: string; source: string; publishedAt: number }>): IssueSource[] {
  return signals
    .filter((s) => s.url)
    .map((s) => ({
      signalId: s.id,
      title: s.title,
      url: s.url,
      source: s.source,
      publishedAt: s.publishedAt,
    }));
}

/// GET /api/admin/newsletter: every issue, newest first, plus what the engine
/// would do right now.
adminNewsletterRoutes.get('/', async (c) => {
  const [issues, decision] = await Promise.all([listIssues(), decide(decideOptions())]);
  return c.json({
    issues,
    engine: {
      enabled: config.NEWSLETTER_ENABLED,
      wouldDraft: decision.draft,
      reason: decision.reason,
      blocked: decision.blocked ?? null,
      monthInReview: decision.monthInReview,
      waiting: decision.signals.length,
      clusters: decision.clusters.map((cl) => ({ key: cl.key, count: cl.signals.length })),
    },
    caps: {
      maxPerMonth: config.NEWSLETTER_MAX_PER_MONTH,
      minHoursBetween: config.NEWSLETTER_MIN_HOURS_BETWEEN,
    },
  });
});

/// POST /api/admin/newsletter/draft: write one.
///
/// `force` overrides the thresholds and the caps, not the kill switch. A cap is
/// a rule about how often to spend a reader's attention and an operator may
/// reasonably override it; the switch is off because somebody decided the whole
/// thing should not run.
adminNewsletterRoutes.post('/draft', async (c) => {
  const force = c.req.query('force') === '1';
  const decision = await decide(decideOptions(force));

  if (!decision.draft) {
    return c.json({ drafted: false, reason: decision.reason, blocked: decision.blocked ?? null }, 200);
  }

  let written;
  try {
    written = await writeDraft(decision);
  } catch (e) {
    const failed = e instanceof DraftFailed;
    logger.error({ err: (e as Error).message }, 'newsletter draft failed');
    // Loudly. A draft that could not be written is not a quiet week, and the
    // difference matters to whoever is waiting for an issue.
    return c.json(
      {
        drafted: false,
        reason: failed
          ? (e as Error).message
          : `the drafter failed: ${(e as Error).message}`,
        blocked: null,
      },
      failed ? 422 : 500,
    );
  }

  const issue = await createIssue({
    subject: written.subject,
    preheader: written.preheader,
    sections: written.sections,
    sources: sourcesFrom(decision.signals),
    signalIds: decision.signals.map((s) => s.id),
    from: decision.from,
    to: decision.to,
    monthInReview: decision.monthInReview,
    draftedBy: written.draftedBy,
  });

  logger.info(
    { issueId: issue.id, attempts: written.attempts, signals: decision.signals.length },
    'newsletter drafted',
  );

  return c.json({
    drafted: true,
    issue,
    warnings: written.findings,
    attempts: written.attempts,
    reason: decision.reason,
  });
});

/// GET /api/admin/newsletter/:id/preview: the rendered issue, and the checks
/// re-run against the current text. Re-run rather than cached, because an
/// operator can edit a draft after it was written and the review has to describe
/// what is actually there.
adminNewsletterRoutes.get('/:id/preview', async (c) => {
  const issue = await getIssue(c.req.param('id'));
  if (!issue) return c.json({ error: 'unknown issue' }, 404);

  const rendered = renderIssue(issue);
  const whole = [issue.subject, issue.preheader, ...issue.sections.map((s) => s.body)].join('\n');
  const { listSignals } = await import('../db/signals.js');
  const signals = (await listSignals({ includeDismissed: true })).filter((s) =>
    issue.signalIds.includes(s.id),
  );

  return c.json({ issue, rendered, review: reviewDraft(whole, signals) });
});

const editSchema = z.object({
  subject: z.string().min(1).max(200).optional(),
  preheader: z.string().min(1).max(300).optional(),
  sections: z
    .array(
      z.object({
        key: z.enum(['shipped', 'ecosystem', 'learned']),
        heading: z.string().min(1).max(120),
        body: z.string().min(1).max(20_000),
        signalIds: z.array(z.string()),
      }),
    )
    .optional(),
});

adminNewsletterRoutes.patch('/:id', async (c) => {
  let body;
  try {
    body = editSchema.parse(await c.req.json());
  } catch (e) {
    return c.json({ error: 'invalid body', detail: (e as Error).message }, 400);
  }

  try {
    const issue = await editIssue(c.req.param('id'), body);
    if (!issue) return c.json({ error: 'unknown issue' }, 404);
    return c.json({ issue });
  } catch (e) {
    return c.json({ error: (e as Error).message }, 409);
  }
});

/// POST /api/admin/newsletter/:id/approve
///
/// Marks it ready. Does not send: that is the next phase, deliberately behind a
/// separate route so nothing in this file can put mail in an inbox.
adminNewsletterRoutes.post('/:id/approve', async (c) => {
  if (!config.NEWSLETTER_ENABLED) {
    return c.json({ error: 'the newsletter is switched off' }, 409);
  }
  try {
    const issue = await approveIssue(c.req.param('id'));
    if (!issue) return c.json({ error: 'unknown issue' }, 404);
    logger.info({ issueId: issue.id }, 'newsletter issue approved');
    return c.json({ issue, note: 'Approved. Sending is a separate step and has not happened.' });
  } catch (e) {
    return c.json({ error: (e as Error).message }, 409);
  }
});

const rejectSchema = z.object({ note: z.string().min(1).max(2000) });

/// POST /api/admin/newsletter/:id/reject
///
/// The note is required, and it is the point. It is the only record of what was
/// wrong with a draft, and the next one is written with it in the prompt.
adminNewsletterRoutes.post('/:id/reject', async (c) => {
  let body;
  try {
    body = rejectSchema.parse(await c.req.json());
  } catch {
    return c.json({ error: 'a rejection needs a note saying what was wrong with it' }, 400);
  }

  try {
    const issue = await rejectIssue(c.req.param('id'), body.note);
    if (!issue) return c.json({ error: 'unknown issue' }, 404);
    logger.info({ issueId: issue.id }, 'newsletter issue rejected');
    return c.json({ issue, note: 'The next draft will be written with this note in hand.' });
  } catch (e) {
    return c.json({ error: (e as Error).message }, 409);
  }
});
