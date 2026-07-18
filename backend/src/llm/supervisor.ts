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
import { recentErrors, subscribeErrors, type CapturedError } from '../errorTracker.js';
import { bus, type KarwanEvent } from '../events.js';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { telegramEnabled, sendTelegramMessage } from '../telegram/bot.js';

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

// ---------------------------------------------------------------------------
// User-facing diagnosis: turn a cryptic revert on a user's OWN action into plain
// guidance. Deliberately SEPARATE from diagnoseError: it never pulls the error
// ring or the event bus (those aggregate across users/deals), so nothing but the
// caller's own error string reaches the model. Output is the sanitized pair
// {summary, suggestedFix} only — no scope, stack, likelyCause, severity, or model
// leak to the user. The route enforces auth + deal party-membership before this
// is ever called; this function just produces safe prose.
// ---------------------------------------------------------------------------

const LOCALE_NAMES: Record<string, string> = {
  en: 'English',
  fr: 'French',
  ar: 'Arabic',
  hi: 'Hindi',
  sw: 'Swahili',
};

const userDiagnosisSchema = z.object({
  summary: z
    .string()
    .describe('One or two plain sentences addressed to the user as "you": what went wrong. No internal names, contract addresses, code, or stack traces.'),
  suggestedFix: z
    .string()
    .describe('What the user can do next, concrete and friendly. If it is a platform/backend issue they cannot fix themselves, say it is on our side and to try again shortly.'),
});

export interface UserDiagnosis {
  summary: string;
  suggestedFix: string;
}

/// Diagnose a single failed user action for the user themselves. `action` is a
/// short label ("release", "bridge", "fund"); `errorMessage` is the raw error
/// they hit. Returns null when the supervisor is disabled (no Anthropic key).
export async function diagnoseUserError(input: {
  action: string;
  errorMessage: string;
  locale?: string;
}): Promise<UserDiagnosis | null> {
  const model = supervisorModel;
  if (!model) return null;

  const language = LOCALE_NAMES[input.locale ?? 'en'] ?? 'English';
  const prompt = [
    'You help a Karwan user understand why an action just failed. Karwan is a',
    'cross-border settlement app: USDC in milestone escrow on Arc, autonomous',
    'buyer/seller agents, bridging via CCTP.',
    '',
    `The user tried to: ${input.action}`,
    `The system returned this error: ${input.errorMessage}`,
    '',
    'Rules:',
    `- Write BOTH fields in ${language}.`,
    '- Speak to the user directly as "you". Plain, calm, and short.',
    '- Never expose internal detail: no contract addresses, function names, stack',
    '  traces, scopes, or raw error codes. Translate them into what they mean.',
    '- If the user genuinely cannot fix it (a backend or network fault), say it is',
    '  on our side and to try again shortly, rather than inventing steps for them.',
    '- No em dashes.',
  ].join('\n');

  const { object } = await withLlmRetry('supervisor.userDiagnose', () =>
    generateObject({ model, schema: userDiagnosisSchema, prompt }),
  );
  return { summary: object.summary, suggestedFix: object.suggestedFix };
}

// ---------------------------------------------------------------------------
// Proactive mode: auto-diagnose captured errors as they land, guarded so it
// can't run up cost. Three guardrails: (1) a config flag (off by default),
// (2) dedup so a repeating error is diagnosed once, not every time, (3) a
// rolling hourly rate cap so an error storm of *distinct* errors is bounded.
// ---------------------------------------------------------------------------

/// Rolling rate window, in ms, from config: 1h default, 24h daily, 168h weekly.
const RATE_WINDOW_MS = config.SUPERVISOR_RATE_WINDOW_HOURS * 60 * 60 * 1000;
/// Cap on the stored diagnoses + dedup keys. Doubles as the dedup memory: once a
/// distinct error is diagnosed it stays cached (so repeats skip the model) until
/// evicted, which also bounds memory.
const MAX_STORED = 200;

/// A distinct-error key. The message is normalised — hex addresses and bare
/// numbers collapse — so "block 512" and "block 513", or two errors differing
/// only by jobId/address, count as the same error and are diagnosed once.
function dedupKey(e: CapturedError): string {
  const normalised = e.message
    .replace(/0x[0-9a-fA-F]+/g, '0x…')
    .replace(/\d+/g, 'N')
    .slice(0, 200);
  return `${e.scope}|${normalised}`;
}

const diagnoses = new Map<string, SupervisorDiagnosis>();
const callTimestamps: number[] = [];
const stats = { diagnosed: 0, deduped: 0, rateLimited: 0, failed: 0, skipped: 0 };

function withinRateBudget(): boolean {
  const cutoff = Date.now() - RATE_WINDOW_MS;
  while (callTimestamps.length && callTimestamps[0]! < cutoff) callTimestamps.shift();
  return callTimestamps.length < config.SUPERVISOR_MAX_DIAGNOSES_PER_WINDOW;
}

function store(key: string, d: SupervisorDiagnosis): void {
  diagnoses.set(key, d);
  while (diagnoses.size > MAX_STORED) {
    const oldest = diagnoses.keys().next().value;
    if (oldest === undefined) break;
    diagnoses.delete(oldest);
  }
}

/// Alert the operator on a critical-severity diagnosis via the operator Telegram
/// chat (reuses the feedback chat id). Best-effort; never throws into the error
/// path. Plain-text send since the model's prose can carry Markdown-breaking
/// characters.
async function alertOperator(d: SupervisorDiagnosis): Promise<void> {
  const chatId = config.FEEDBACK_TELEGRAM_CHAT_ID;
  if (!chatId || !telegramEnabled()) return;
  const text = [
    `⚠️ Supervisor: CRITICAL — ${d.target.scope}`,
    d.summary,
    `Likely cause: ${d.likelyCause}`,
    `Suggested: ${d.suggestedFix}`,
    `(confidence ${d.confidence})`,
  ].join('\n');
  await sendTelegramMessage(chatId, text, undefined, { plain: true });
}

/// The proactive handler. Non-blocking: reportError calls this synchronously, so
/// it schedules the diagnosis and returns immediately; the model call runs in the
/// background. Skips its own errors (loop guard), dedups, then rate-limits.
function onCapturedError(e: CapturedError): void {
  // Loop guard: never diagnose the supervisor's own failures, or a captured
  // error would trigger a diagnosis that fails and captures another error.
  if (e.scope.startsWith('supervisor.')) return;
  if (!supervisorEnabled()) return;

  const key = dedupKey(e);
  if (diagnoses.has(key)) {
    stats.deduped += 1;
    return;
  }
  if (!withinRateBudget()) {
    stats.rateLimited += 1;
    return;
  }
  // Reserve the slot + the dedup key BEFORE the async call so a burst of the same
  // error in the same tick can't slip past the checks and fire N parallel calls.
  callTimestamps.push(Date.now());
  diagnoses.set(key, PENDING);

  void (async () => {
    try {
      const d = await diagnoseError(e);
      if (!d) {
        diagnoses.delete(key); // model vanished; let a later error retry
        stats.skipped += 1;
        return;
      }
      store(key, d);
      stats.diagnosed += 1;
      if (d.severity === 'critical') {
        await alertOperator(d).catch(() => {});
      }
    } catch (err) {
      diagnoses.delete(key); // failed; don't cache a hole, allow a retry later
      stats.failed += 1;
      // logger only — NOT reportError — so a diagnosis failure can't feed itself.
      logger.warn({ scope: e.scope, err: (err as Error).message }, 'proactive supervisor diagnosis failed');
    }
  })();
}

/// Placeholder stored while a diagnosis is in flight, so concurrent duplicates
/// dedup against it. Never returned to callers (getDiagnosisFor filters it out).
const PENDING = { __pending: true } as unknown as SupervisorDiagnosis;

/// Look up the cached diagnosis for a captured error, matched by its distinct-
/// error key so every instance of a repeating error shows the same read. Returns
/// undefined when none exists or one is still in flight.
export function getDiagnosisFor(e: CapturedError): SupervisorDiagnosis | undefined {
  const d = diagnoses.get(dedupKey(e));
  return d && d !== PENDING ? d : undefined;
}

export function proactiveSupervisorStats(): typeof stats & { cached: number } {
  return { ...stats, cached: diagnoses.size };
}

/// Start proactive mode: subscribe to the error tracker so every captured error
/// is auto-diagnosed. No-op (returns a no-op stop fn) when the flag is off or no
/// Anthropic key is set. Wired once at boot; returns an unsubscribe for tests.
export function startProactiveSupervisor(): () => void {
  if (!config.SUPERVISOR_PROACTIVE_ENABLED || !supervisorEnabled()) {
    return () => {};
  }
  logger.info(
    {
      cap: config.SUPERVISOR_MAX_DIAGNOSES_PER_WINDOW,
      windowHours: config.SUPERVISOR_RATE_WINDOW_HOURS,
    },
    'proactive supervisor started: auto-diagnosing captured errors',
  );
  return subscribeErrors(onCapturedError);
}
