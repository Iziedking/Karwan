import { z } from 'zod';

export const bidDecisionSchema = z.object({
  decision: z.enum(['bid', 'skip']),
  confidence: z.number().min(0).max(1),
  suggestedPrice: z.string(),
  suggestedDeadline: z.number().int().positive(),
  reasoning: z.string(),
});
export type BidDecision = z.infer<typeof bidDecisionSchema>;

export const counterEvaluationSchema = z.object({
  decision: z.enum(['accept', 'counter', 'decline']),
  confidence: z.number().min(0).max(1),
  counterPrice: z.string().optional(),
  counterDeadline: z.number().int().positive().optional(),
  reasoning: z.string(),
});
export type CounterEvaluation = z.infer<typeof counterEvaluationSchema>;
