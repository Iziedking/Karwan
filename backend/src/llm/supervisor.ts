/// Phase-C supervisor: the read-first "general intelligence" layer. It does not
/// act — it reads a captured backend error together with the error cluster and
/// event context around it, and returns a plain-language diagnosis with a
/// proposed fix for the operator. The backend still renders the raw error; this
/// is the human-readable second opinion beside it.
///
/// PRIVACY: the prompt carries error context and recent events, which include
/// deal data (parties, amounts, jobIds). It runs ONLY on `supervisorModel`
/// (direct Anthropic, no Conduit / OpenRouter proxy). When the model is absent
/// (no ANTHROPIC_API_KEY) the supervisor is disabled and callers get null — they
/// must NOT fall back to a proxy for this input.

import { generateObject } from 'ai';
import { z } from 'zod';
import { supervisorModel } from './client.js';
import { withLlmRetry } from '../agents/llm-utils.js';
import { recentErrors, type CapturedError } from '../errorTracker.js';
import { bus, type KarwanEvent } from '../events.js';

export function supervisorEnabled(): boolean {
  return supervisorModel !== null;
}

const diagnosisSchema = z.object({
  summary: z.string().describe('One sentence: what actually went wrong, in plain language.'),
  likelyCause: z.string().describe('The most probable root cause, reasoned from the error and the surrounding context.'),
  suggestedFix: z.string().describe('A concrete next step the operator could take. A suggestion to a human, never an action you took.'),
  severity: z.enum(['info', 'warning', 'critical']).describe('critical only when money movement, escrow, or a stuck deal is implicated.'),
  confidence: z.enum(['low', 'medium', 'high']).describe('high only when the context clearly points to the cause.'),
});

export type SupervisorDiagnosis = z.infer<typeof diagnosisSchema> & {
  target: { scope: string; message: string; ts: number };
  model: string;
};

/// How much surrounding context to hand the model. Bounded so one diagnosis is a
/// single cheap call, not a dump of the whole ring buffer.
const MAX_PEER_ERRORS = 8;
const MAX_EVENTS = 20;
const STACK_CHARS = 800;

function trimStack(stack?: string): string | undefined {
  if (!stack) return undefined;
  return stack.length > STACK_CHARS ? `${stack.slice(0, STACK_CHARS)}…` : stack;
}

/// Pull a jobId out of a captured error's context if one is present, so the
/// event slice can be scoped to the deal the error belongs to.
function jobIdOf(err: CapturedError): string | undefined {
  const v = err.context?.jobId;
  return typeof v === 'string' && v ? v : undefined;
}

function eventLine(e: KarwanEvent): string {
  const when = new Date(e.ts).toISOString();
  const job = e.jobId ? ` job=${e.jobId}` : '';
  return `${when} ${e.type} actor=${e.actor}${job}`;
}

/// Diagnose a single captured error. Gathers the peer errors and the recent
/// event trail (scoped to the error's jobId when it has one) as context, then
/// asks the supervisor model to explain it. Returns null when the supervisor is
/// disabled (no Anthropic key) — the caller surfaces the raw error alone.
export async function diagnoseError(target: CapturedError): Promise<SupervisorDiagnosis | null> {
  const model = supervisorModel;
  if (!model) return null;

  const jobId = jobIdOf(target);
  const peers = recentErrors(MAX_PEER_ERRORS + 1)
    .filter((e) => !(e.scope === target.scope && e.ts === target.ts))
    .slice(0, MAX_PEER_ERRORS);
  const events = bus.recent(MAX_EVENTS, jobId);

  const context = {
    error: {
      scope: target.scope,
      message: target.message,
      stack: trimStack(target.stack),
      context: target.context ?? {},
      at: new Date(target.ts).toISOString(),
    },
    otherRecentErrors: peers.map((e) => ({ scope: e.scope, message: e.message, at: new Date(e.ts).toISOString() })),
    recentEvents: events.map(eventLine),
  };

  const prompt = [
    'You are the supervisor for Karwan, an agentic cross-border settlement backend on Arc',
    '(USDC in milestone escrow, autonomous buyer/seller agents, a trade-finance rail).',
    'A runtime error was captured. Explain it for the operator and propose a fix.',
    '',
    'Rules:',
    '- Read-first. You do not act or change anything. suggestedFix is advice to a human.',
    '- Ground every claim in the provided context. If the cause is genuinely unclear,',
    '  say so and set confidence to low rather than inventing one.',
    '- Reserve severity=critical for money movement, escrow, or a stuck/again-failing deal.',
    '',
    'Context:',
    JSON.stringify(context, null, 2),
  ].join('\n');

  const { object } = await withLlmRetry(`supervisor.diagnose(${target.scope})`, () =>
    generateObject({ model, schema: diagnosisSchema, prompt }),
  );

  return {
    ...object,
    target: { scope: target.scope, message: target.message, ts: target.ts },
    model: model.modelId,
  };
}
