import { Hono } from 'hono';
import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { rateLimit } from '../middleware/rateLimit.js';
import { addSignal } from '../db/signals.js';
import { config } from '../config.js';
import { logger } from '../logger.js';

/// The write-only door for the Arc and Circle sweep.
///
/// Neither the Arc nor the Circle MCP can answer "what changed since last
/// Tuesday": both are documentation search, and the Arc docs tree carries no
/// changelog at all. They also run in an operator's editor rather than anywhere
/// this container can reach. So the sweep happens where the tools actually live,
/// and posts its findings here.
///
/// Three things make that safe enough to leave running unattended:
///
///   1. Its own token, not the admin one. This endpoint can append to a content
///      pipeline and do nothing else.
///   2. `origin` is restricted to the sources the sweep is for. It cannot forge
///      a Karwan release, which is the one origin a reader would trust as our
///      own word.
///   3. Batched and capped, so a runaway agent loop cannot fill the table.

export const signalIngestRoutes = new Hono();

/// Generous for a weekly job, useless for anything else.
const ingestLimit = rateLimit({ windowMs: 60_000, max: 10, name: 'signal-ingest' });

/// `karwan` is absent on purpose. Only the release watcher, reading a file that
/// shipped inside this image, may speak as Karwan.
const itemSchema = z.object({
  origin: z.enum(['arc', 'circle']),
  source: z.string().min(1).max(80),
  title: z.string().min(1).max(200),
  url: z.string().url().max(2000).optional(),
  publishedOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD')
    .optional(),
  summary: z.string().max(1000).optional(),
  rawExcerpt: z.string().max(20_000).optional(),
  myTake: z.string().max(4000).optional(),
  tags: z.array(z.string().min(1).max(40)).max(12).optional(),
  importance: z.enum(['low', 'normal', 'high']).optional(),
  externalId: z.string().min(1).max(200).optional(),
});

const bodySchema = z.object({ signals: z.array(itemSchema).min(1).max(50) });

function tokenMatches(presented: string): boolean {
  const expected = config.SIGNAL_INGEST_TOKEN;
  if (!expected) return false;
  const a = Buffer.from(presented);
  const b = Buffer.from(expected);
  // Length first: timingSafeEqual throws on a mismatch rather than returning
  // false, and the length itself is not the secret.
  return a.length === b.length && timingSafeEqual(a, b);
}

/// POST /api/signals/ingest
///
/// Returns per-item results rather than a bare ok. A sweep needs to know what
/// was already known, or it cannot tell a quiet week from a broken run.
signalIngestRoutes.post('/ingest', ingestLimit, async (c) => {
  if (!config.SIGNAL_INGEST_TOKEN) {
    return c.json({ error: 'signal ingest is not configured on this deployment' }, 503);
  }

  const presented = (c.req.header('authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!presented || !tokenMatches(presented)) {
    return c.json({ error: 'unauthorized' }, 401);
  }

  let body;
  try {
    body = bodySchema.parse(await c.req.json());
  } catch (e) {
    return c.json({ error: 'invalid body', detail: (e as Error).message }, 400);
  }

  const results = [];
  for (const item of body.signals) {
    const result = await addSignal({
      origin: item.origin,
      source: item.source,
      title: item.title,
      url: item.url,
      // Parsed at UTC noon so a date does not slip a day west of Greenwich.
      publishedAt: item.publishedOn ? Date.parse(`${item.publishedOn}T12:00:00Z`) : Date.now(),
      summary: item.summary,
      rawExcerpt: item.rawExcerpt,
      myTake: item.myTake,
      tags: item.tags,
      importance: item.importance,
      externalId: item.externalId,
    });
    results.push({
      id: result.signal.id,
      title: result.signal.title,
      duplicate: result.duplicate,
      merged: result.merged,
    });
  }

  const added = results.filter((r) => !r.duplicate).length;
  logger.info(
    { count: results.length, added, duplicate: results.length - added },
    'signals ingested from sweep',
  );

  return c.json({ added, duplicate: results.length - added, results });
});
