/// Public research survey.
///
///   POST /api/survey/research  five answers and an optional contact
///
/// No sign-in. The hidden `website` field is for bots: when it is filled the
/// reply is the same success and nothing is stored, so they learn nothing.

import { randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import { z } from 'zod';
import {
  RESEARCH_CHECKS,
  RESEARCH_PAYER,
  RESEARCH_ROLES,
  RESEARCH_SHARE,
  RESEARCH_SIGNALS,
  saveResearchAnswer,
} from '../db/researchAnswers.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { invalidBodyMessage } from './invalidBody.js';

export const surveyRoutes = new Hono();

const LOCALES = ['en', 'ar', 'fr', 'hi', 'sw'] as const;
const optionalText = (max: number) =>
  z.string().trim().max(max).optional().transform((v) => (v ? v : null));

const researchSchema = z.object({
  locale: z.enum(LOCALES).catch('en'),
  role: z.enum(RESEARCH_ROLES),
  checks: z.array(z.enum(RESEARCH_CHECKS)).min(1).max(RESEARCH_CHECKS.length),
  otherText: optionalText(140),
  trustMost: z.enum(RESEARCH_SIGNALS),
  easiestFake: z.enum(RESEARCH_SIGNALS),
  share: z.enum(RESEARCH_SHARE),
  payer: z.enum(RESEARCH_PAYER),
  contact: optionalText(120),
  website: z.string().optional(),
});

surveyRoutes.post('/research', rateLimit({ windowMs: 60 * 60 * 1000, max: 5, name: 'survey-research' }), async (c) => {
  let body;
  try {
    body = researchSchema.parse(await c.req.json());
  } catch (err) {
    return c.json({ error: invalidBodyMessage(err) }, 400);
  }
  if (body.website) return c.json({ ok: true });
  const checks = [...new Set(body.checks)];
  await saveResearchAnswer({
    id: randomUUID(),
    createdAt: Date.now(),
    locale: body.locale,
    role: body.role,
    checks,
    otherText: checks.includes('other') ? body.otherText : null,
    trustMost: body.trustMost,
    easiestFake: body.easiestFake,
    share: body.share,
    payer: body.payer,
    contact: body.contact,
  });
  return c.json({ ok: true });
});
