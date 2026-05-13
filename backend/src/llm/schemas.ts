import { z } from 'zod';

const decimalString = z
  .string()
  .regex(/^\d+(\.\d{1,6})?$/, 'must be digits only, optional dot, no currency unit');

export const bidDecisionSchema = z.object({
  decision: z.enum(['bid', 'skip']),
  confidence: z.number().min(0).max(1),
  suggestedPrice: decimalString,
  suggestedDeadlineDays: z.number().int().min(1).max(60),
  reasoning: z.string(),
});
export type BidDecision = z.infer<typeof bidDecisionSchema>;

export const bidScoreSchema = z.object({
  score: z.number().min(0).max(100),
  suggestedCounterPrice: decimalString,
  suggestedCounterDeadlineDays: z.number().int().min(1).max(60),
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
});
export type BidScore = z.infer<typeof bidScoreSchema>;

export const counterEvaluationSchema = z.object({
  decision: z.enum(['accept', 'counter', 'decline']),
  confidence: z.number().min(0).max(1),
  counterPrice: decimalString.optional(),
  counterDeadlineDays: z.number().int().min(1).max(60).optional(),
  reasoning: z.string(),
});
export type CounterEvaluation = z.infer<typeof counterEvaluationSchema>;
