import { z } from 'zod';

const decimalString = z
  .string()
  .regex(/^\d+(\.\d{1,6})?$/, 'must be digits only, optional dot, no currency unit');

export const bidDecisionSchema = z.object({
  decision: z.enum(['bid', 'skip']),
  confidence: z.number().min(0).max(1),
  suggestedPrice: decimalString.describe(
    "USDC amount as decimal digits only — no currency suffix, no commas. e.g. '450' or '450.5'.",
  ),
  suggestedDeadlineDays: z
    .number()
    .int()
    .min(1)
    .max(60)
    .describe('Days from now until the proposed delivery deadline. Integer between 1 and 60.'),
  reasoning: z.string(),
});
export type BidDecision = z.infer<typeof bidDecisionSchema>;

export const counterEvaluationSchema = z.object({
  decision: z.enum(['accept', 'counter', 'decline']),
  confidence: z.number().min(0).max(1),
  counterPrice: decimalString.optional(),
  counterDeadlineDays: z.number().int().min(1).max(60).optional(),
  reasoning: z.string(),
});
export type CounterEvaluation = z.infer<typeof counterEvaluationSchema>;
