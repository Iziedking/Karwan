/// Process-wide error capture for the backend. Aggregates errors from three
/// sources so the operator has a single place to look at runtime health:
///
///   1. `process.on('unhandledRejection')` and `process.on('uncaughtException')`
///      catch top-level crashes that would otherwise vanish into stderr.
///   2. `reportError(scope, err, context?)` is called explicitly from try/catch
///      blocks that want to surface to ops without throwing.
///   3. The setInterval watchers wrap their tick functions in `runTick(scope, fn)`
///      so a thrown error doesn't kill the timer silently.
///
/// Captured errors:
///   - Logged via the structured logger (full message + stack + context).
///   - Emitted as `system.error` on the event bus so the activity feed and any
///     future operator dashboard can surface them in real time.
///   - Pushed onto an in-memory ring buffer (last 100) for the `/api/admin/errors`
///     endpoint to read. Restart clears this; persisted history is out of scope
///     for v1.
///
/// We intentionally do NOT exit the process on uncaught errors. The agents,
/// SSE bus, telegram poller, and watchers must keep running so one bad
/// request doesn't kill all the others.

import { bus } from './events.js';
import { logger } from './logger.js';

/// Optional Sentry forwarding. Activated when SENTRY_DSN is set AND
/// `@sentry/node` is installed. The package is a soft dependency: the
/// backend boots and runs cleanly without it. The interface below is the
/// minimal surface we use, so the project type-checks without the package
/// in node_modules.
interface SentryScope {
  setTag(key: string, value: string): void;
  setExtras(extras: Record<string, unknown>): void;
}
interface SentryLite {
  init(opts: {
    dsn: string;
    environment?: string;
    release?: string;
    tracesSampleRate?: number;
  }): void;
  captureException(e: Error): void;
  withScope(cb: (s: SentryScope) => void): void;
}
let sentry: SentryLite | null = null;
let sentryInitAttempted = false;

async function maybeInitSentry(): Promise<void> {
  if (sentryInitAttempted) return;
  sentryInitAttempted = true;
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;
  try {
    // Cast to unknown then SentryLite. This keeps tsc happy when @sentry/node
    // is not yet installed (the import resolves at runtime only).
    const mod = (await import('@sentry/node' as string)) as unknown as SentryLite;
    mod.init({
      dsn,
      environment: process.env.NODE_ENV || 'development',
      release: process.env.SENTRY_RELEASE,
      tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0),
    });
    sentry = mod;
    logger.info({ release: process.env.SENTRY_RELEASE }, 'sentry initialised');
  } catch (err) {
    logger.warn(
      { err: (err as Error).message },
      'SENTRY_DSN set but @sentry/node missing or init failed; continuing without sentry',
    );
  }
}

function forwardToSentry(scope: string, err: unknown, context?: Record<string, unknown>): void {
  if (!sentry) return;
  try {
    sentry.withScope((s) => {
      s.setTag('karwan.scope', scope);
      if (context) s.setExtras(context);
      const e = err instanceof Error ? err : new Error(extract(err).message);
      sentry!.captureException(e);
    });
  } catch {
    /* never let sentry forwarding break the original error path */
  }
}

export interface CapturedError {
  scope: string;
  message: string;
  stack?: string;
  context?: Record<string, unknown>;
  ts: number;
}

const MAX_BUFFER = 100;
const ringBuffer: CapturedError[] = [];

function pushBuffer(entry: CapturedError) {
  ringBuffer.push(entry);
  if (ringBuffer.length > MAX_BUFFER) {
    ringBuffer.splice(0, ringBuffer.length - MAX_BUFFER);
  }
}

/// Returns up to `limit` most recent captured errors, newest first. Used by
/// the admin route to surface backend health without grepping logs.
export function recentErrors(limit = 50): CapturedError[] {
  const tail = ringBuffer.slice(-Math.max(0, limit));
  return tail.reverse();
}

function extract(err: unknown): { message: string; stack?: string } {
  if (err == null) return { message: 'unknown error' };
  if (err instanceof Error) {
    return { message: err.message || err.name || 'Error', stack: err.stack };
  }
  if (typeof err === 'string') return { message: err };
  if (typeof err === 'object') {
    const o = err as Record<string, unknown>;
    const msg =
      (typeof o.message === 'string' && o.message) ||
      (typeof o.error === 'string' && o.error) ||
      (typeof o.reason === 'string' && o.reason) ||
      undefined;
    if (msg) return { message: msg };
    try {
      return { message: JSON.stringify(o) };
    } catch {
      return { message: '[unserialisable error]' };
    }
  }
  return { message: String(err) };
}

/// Explicitly report an error from a try/catch block. The scope is a short
/// identifier (eg 'agents.buyer.acceptBid') used to filter logs later.
export function reportError(
  scope: string,
  err: unknown,
  context?: Record<string, unknown>,
): void {
  const { message, stack } = extract(err);
  const entry: CapturedError = {
    scope,
    message,
    stack,
    context,
    ts: Date.now(),
  };
  pushBuffer(entry);
  logger.error({ scope, err: message, stack, ...context }, 'error captured');
  try {
    bus.emitEvent({
      type: 'system.error',
      actor: 'platform',
      payload: { scope, message, ...(context ?? {}) },
    });
  } catch {
    /* event bus is best-effort; never throw out of error reporting */
  }
  forwardToSentry(scope, err, context);
}

/// Wraps an async tick function so a thrown error is captured rather than
/// silently dropped. Used by the buyer agent, seller agent, deal watcher,
/// and job-expiry watcher's setInterval tick callbacks.
export async function runTick(
  scope: string,
  fn: () => Promise<void> | void,
): Promise<void> {
  try {
    await fn();
  } catch (err) {
    reportError(scope, err);
  }
}

/// Installs the global process listeners. Idempotent; safe to call once at
/// boot. Returns a stop fn so tests can unwire cleanly. Also kicks off the
/// optional Sentry init (no-op when SENTRY_DSN is unset or the package is
/// missing).
export function installProcessErrorHandlers(): () => void {
  void maybeInitSentry();
  const onUnhandled = (reason: unknown) => {
    reportError('process.unhandledRejection', reason);
  };
  const onUncaught = (err: unknown) => {
    reportError('process.uncaughtException', err);
  };
  process.on('unhandledRejection', onUnhandled);
  process.on('uncaughtException', onUncaught);
  return () => {
    process.off('unhandledRejection', onUnhandled);
    process.off('uncaughtException', onUncaught);
  };
}
