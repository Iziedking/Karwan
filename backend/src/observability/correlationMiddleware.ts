import type { MiddlewareHandler } from 'hono';

import { correlationIdFromHeader, CORRELATION_HEADER } from './correlation.js';

export interface CorrelationLogger {
  debug(metadata: Record<string, unknown>, message: string): void;
}

/**
 * Attach one bounded correlation identifier to every response and completion
 * log. The identifier is metadata only: it is never used for authority,
 * idempotency, provider, or financial decisions.
 */
export function createCorrelationMiddleware(logger: CorrelationLogger): MiddlewareHandler {
  return async (c, next) => {
    const correlationId = correlationIdFromHeader(c.req.header('x-correlation-id'));
    c.header(CORRELATION_HEADER, correlationId);
    const startedAt = Date.now();
    try {
      await next();
    } finally {
      logger.debug(
        {
          correlationId,
          method: c.req.method,
          path: c.req.path,
          status: c.res.status,
          durationMs: Math.max(0, Date.now() - startedAt),
        },
        'request completed',
      );
    }
  };
}
