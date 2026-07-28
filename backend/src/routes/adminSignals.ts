import { Hono } from 'hono';
import { z } from 'zod';
import { requireAdmin } from '../middleware/adminAuth.js';
import {
  addSignal,
  dismissSignal,
  listSignals,
  EXCERPT_MAX,
  IMPORTANCES,
  SIGNAL_ORIGINS,
  type SignalOrigin,
} from '../db/signals.js';
import { logger } from '../logger.js';

/// The manual drop, and the read side every engine collects from.
///
/// The drop is the primary path by decision: Arc House is pasted in, never
/// scraped. Everything automated writes through the same store, so a watcher can
/// never produce a shape the drafting side has not seen.

export const adminSignalRoutes = new Hono();
adminSignalRoutes.use('*', requireAdmin);

const dropSchema = z.object({
  source: z.string().min(1).max(80),
  title: z.string().min(1).max(200),
  url: z.string().url().max(2000).optional().or(z.literal('')),
  // A date rather than a timestamp: it is what a form gives and what a citation
  // needs. Absent means today.
  publishedOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD')
    .optional(),
  summary: z.string().max(1000).optional(),
  // Generous here and clamped in the store. Rejecting a long paste outright
  // would mean retyping; the response says what was kept.
  rawExcerpt: z.string().max(20_000).optional(),
  myTake: z.string().max(4000).optional(),
  tags: z.array(z.string().min(1).max(40)).max(12).optional(),
  importance: z.enum(['low', 'normal', 'high']).optional(),
  origin: z.enum(['manual', 'arc', 'circle', 'karwan']).optional(),
  externalId: z.string().min(1).max(200).optional(),
});

/// GET /api/admin/signals: the pipeline, newest first.
adminSignalRoutes.get('/', async (c) => {
  const origin = c.req.query('origin');
  const sinceRaw = c.req.query('since');
  const since = sinceRaw ? Number(sinceRaw) : undefined;

  if (origin && !SIGNAL_ORIGINS.includes(origin as SignalOrigin)) {
    return c.json({ error: `unknown origin, expected one of ${SIGNAL_ORIGINS.join(', ')}` }, 400);
  }
  if (since !== undefined && !Number.isFinite(since)) {
    return c.json({ error: 'since must be epoch milliseconds' }, 400);
  }

  const items = await listSignals({
    origin: origin as SignalOrigin | undefined,
    since,
    includeDismissed: c.req.query('includeDismissed') === '1',
    limit: 200,
  });

  return c.json({
    signals: items,
    limits: { excerptMax: EXCERPT_MAX, importances: IMPORTANCES, origins: SIGNAL_ORIGINS },
  });
});

/// POST /api/admin/signals: drop one in.
///
/// A repeat of something already in the pipeline is not an error. It comes back
/// 200 with `duplicate: true` and the row it collided with, because the useful
/// answer to "I pasted this twice" is the existing row, not a rejection.
adminSignalRoutes.post('/', async (c) => {
  let body;
  try {
    body = dropSchema.parse(await c.req.json());
  } catch (e) {
    return c.json({ error: 'invalid body', detail: (e as Error).message }, 400);
  }

  // Parsed as UTC noon rather than midnight so a date does not slip a day for
  // anyone reading it west of Greenwich.
  const publishedAt = body.publishedOn
    ? Date.parse(`${body.publishedOn}T12:00:00Z`)
    : Date.now();

  const result = await addSignal({
    origin: body.origin ?? 'manual',
    source: body.source,
    title: body.title,
    url: body.url || undefined,
    publishedAt,
    summary: body.summary,
    rawExcerpt: body.rawExcerpt,
    myTake: body.myTake,
    tags: body.tags,
    importance: body.importance,
    externalId: body.externalId,
  });

  logger.info(
    {
      signalId: result.signal.id,
      origin: result.signal.origin,
      duplicate: result.duplicate,
      merged: result.merged,
    },
    'signal dropped',
  );

  return c.json({
    signal: result.signal,
    duplicate: result.duplicate,
    merged: result.merged,
    note: result.duplicate
      ? result.merged
        ? 'Already in the pipeline. Your take and tags were added to it.'
        : 'Already in the pipeline. Nothing new to add, so nothing changed.'
      : undefined,
  });
});

/// DELETE /api/admin/signals/:id: dismiss.
///
/// Kept rather than deleted. A watcher would only put a deleted row back, and
/// "we saw this and decided against writing about it" is worth having later.
adminSignalRoutes.delete('/:id', async (c) => {
  const signal = await dismissSignal(c.req.param('id'));
  if (!signal) return c.json({ error: 'unknown signal' }, 404);
  logger.info({ signalId: signal.id }, 'signal dismissed');
  return c.json({ signal });
});
