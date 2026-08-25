import { randomUUID } from 'node:crypto';

export const CORRELATION_HEADER = 'X-Correlation-ID';
const CORRELATION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

/**
 * Accepts a bounded opaque request identifier or creates one locally. The
 * value is correlation metadata only: it is never used as an idempotency key,
 * authorization input, provider reference, or financial command identity.
 */
export function correlationIdFromHeader(value: string | undefined, create: () => string = randomUUID): string {
  const candidate = value?.trim() ?? '';
  return CORRELATION_PATTERN.test(candidate) ? candidate : create();
}

export function isCorrelationId(value: string): boolean {
  return CORRELATION_PATTERN.test(value);
}
