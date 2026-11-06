import { Hono } from 'hono';
import { z } from 'zod';
import { sessionAddress } from '../auth/session.js';
import { draftDeal, type DraftPart, type SplitWithModel } from '../deals/drafter.js';
import { generateObjectWithLlmFallback } from '../llm/client.js';
import { logger } from '../logger.js';

const splitSchema = z.object({
  parts: z.array(z.object({ pct: z.number(), what: z.string() })).min(1).max(5),
});

/// The model, asked only when long words may hide stages (view 56).
export const modelSplit: SplitWithModel = async (brief) => {
  const prompt = [
    'A person described a deal in their own words. Split it into the parts it is paid in.',
    'Use 2 to 5 parts only when the words describe stages of work or delivery; otherwise answer one part.',
    'Each part says in plain words what must be delivered for it, short, in the language of the words.',
    'Shares are whole percents that add up to 100, smaller early, the finished work biggest.',
    'Never invent work the words do not ask for.',
    '',
    `Words: ${brief}`,
  ].join('\n');
  const result = await generateObjectWithLlmFallback({ schema: splitSchema, prompt }, 'light');
  return result.object.parts as DraftPart[];
};

const bodySchema = z.object({ brief: z.string().trim().min(3).max(500) });

export const dealDraftRoutes = new Hono();

/// A person's words as a deal card (view 56). Prepares only: nothing is saved,
/// posted or paid.
dealDraftRoutes.post('/draft', async (c) => {
  if (!sessionAddress(c)) return c.json({ error: 'not authenticated' }, 401);
  const parsed = bodySchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'Say what the deal is, in a few words.' }, 400);
  try {
    return c.json({ draft: await draftDeal({ brief: parsed.data.brief }, { split: modelSplit }) });
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'deal draft failed');
    return c.json({ draft: await draftDeal({ brief: parsed.data.brief }, {}) });
  }
});
