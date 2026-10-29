import { Hono } from 'hono';
import type { Context } from 'hono';
import { z } from 'zod';
import { sessionAddress } from '../auth/session.js';
import { invalidBodyMessage } from './invalidBody.js';
import { getQuestion, openQuestionsFor, type AgentQuestion } from '../db/agentQuestions.js';
import { closeQuestion } from '../agents/agentQuestion.js';
import { getBrief } from '../db/briefs.js';

/// What a person's agent is asking them (view 41). Identity is the signed
/// session only. A question about a request is answered by making an offer
/// (the offers route closes it) or with "Not for me" here; a question about a
/// buyer's counter is answered here, and the agent acts on the answer.

let session: (c: Context) => string | null = (c) => sessionAddress(c);
type CounterAnswer = (
  jobId: string,
  sellerUser: string,
  answer: { choice: 'yes' | 'change' | 'no'; priceUsdc?: string },
) => Promise<{ ok: true } | { ok: false; message: string }>;
let counterAnswer: CounterAnswer = async (jobId, sellerUser, answer) =>
  (await import('../agents/seller.js')).answerCounterQuestion(jobId, sellerUser, answer);

const COUNTER_KINDS: ReadonlySet<AgentQuestion['kind']> = new Set(['counter-below-floor', 'last-price-passed']);

const answerSchema = z.object({
  choice: z.enum(['yes', 'change', 'no']),
  priceUsdc: z.string().regex(/^\d+(\.\d{1,6})?$/).optional(),
  days: z.number().int().min(1).max(365).optional(),
});

export const agentQuestionsRoutes = new Hono();

agentQuestionsRoutes.get('/', async (c) => {
  const me = session(c);
  if (!me) return c.json({ error: 'Sign in to see your questions.', code: 'sign_in' }, 401);
  return c.json({ questions: await openQuestionsFor(me) });
});

agentQuestionsRoutes.post('/:id/answer', async (c) => {
  const me = session(c);
  if (!me) return c.json({ error: 'Sign in to answer.', code: 'sign_in' }, 401);
  let body: z.infer<typeof answerSchema>;
  try {
    body = answerSchema.parse(await c.req.json());
  } catch (err) {
    return c.json({ error: invalidBodyMessage(err), code: 'bad_body' }, 400);
  }
  const q = await getQuestion(c.req.param('id'));
  if (!q || q.owner !== me.toLowerCase()) return c.json({ error: 'No such question.', code: 'not_found' }, 404);
  if (q.state !== 'input-required') return c.json({ error: 'This question has already been answered or has closed.', code: 'closed' }, 409);

  const counterpart = (q.side === 'seller' ? getBrief(q.jobId)?.postedBy : null) ?? null;
  if (COUNTER_KINDS.has(q.kind)) {
    const price = body.choice === 'yes' ? undefined : body.priceUsdc ?? q.suggested.priceUsdc;
    const acted = await counterAnswer(q.jobId, me, { choice: body.choice, ...(price ? { priceUsdc: price } : {}) });
    if (!acted.ok) {
      await closeQuestion(q, { choice: 'no' }, counterpart);
      return c.json({ error: acted.message, code: 'ended' }, 409);
    }
    const done = await closeQuestion(q, { choice: body.choice, ...(price ? { priceUsdc: price } : {}) }, counterpart);
    return c.json({ question: done });
  }
  if (q.kind === 'price-above-cap') {
    // The buyer's near match is answered on its own card, which pays the seller;
    // the near-match route closes this question.
    if (body.choice === 'change') return c.json({ error: 'Take it at the price the seller asks, or pass. To offer less, edit the request.', code: 'bad_body' }, 400);
    return c.json({ next: { intent: body.choice === 'yes' ? 'near_miss_proceed' : 'near_miss_pass', jobId: q.jobId } });
  }
  if (body.choice === 'change' && !body.priceUsdc) return c.json({ error: 'Say the price you want.', code: 'bad_body' }, 400);
  if (body.choice !== 'no') {
    // A request question is answered with an offer, through the same card and
    // route as any offer of their own; that route closes this question.
    return c.json({
      next: { intent: 'make_offer', jobId: q.jobId, priceUsdc: body.priceUsdc ?? q.suggested.priceUsdc, deliverInDays: body.days ?? q.suggested.days },
    });
  }
  const done = await closeQuestion(q, { choice: 'no' }, counterpart);
  return c.json({ question: done });
});

export const __agentQuestionsTest = {
  setSession(fn: (c: Context) => string | null) {
    session = fn;
  },
  setCounterAnswer(fn: CounterAnswer) {
    counterAnswer = fn;
  },
};
