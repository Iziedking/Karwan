import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';

export const OTP_TTL_MS = 10 * 60 * 1000;
export const OTP_MAX_ATTEMPTS = 5;

export interface PendingOtpRecord {
  codeHash: string;
  expiresAt: number;
  attempts: number;
}

export type OtpAttemptResult =
  | { status: 'verified'; attempts: number }
  | { status: 'wrong'; attempts: number }
  | { status: 'expired'; attempts: number }
  | { status: 'locked'; attempts: number };

/** Generate a uniformly distributed, zero-padded six digit code. */
export function generateOtpCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

/** Bind a code to the normalized identity it was issued for. */
export function hashOtpCode(code: string, binding: string, secret: string): string {
  return createHmac('sha256', secret).update(`${code}:${binding}`).digest('hex');
}

/**
 * Check one OTP attempt without mutating storage.
 *
 * A correct fifth attempt succeeds. The fifth wrong attempt locks the code;
 * callers should delete the record on expired, locked, or verified results.
 */
export function checkOtpAttempt(
  record: PendingOtpRecord,
  candidateCode: string,
  binding: string,
  secret: string,
  now = Date.now(),
): OtpAttemptResult {
  if (record.expiresAt < now) return { status: 'expired', attempts: record.attempts };
  if (record.attempts >= OTP_MAX_ATTEMPTS) {
    return { status: 'locked', attempts: record.attempts };
  }

  const expected = Buffer.from(record.codeHash, 'hex');
  const actual = Buffer.from(hashOtpCode(candidateCode, binding, secret), 'hex');
  if (expected.length === actual.length && timingSafeEqual(expected, actual)) {
    return { status: 'verified', attempts: record.attempts };
  }

  const attempts = record.attempts + 1;
  return attempts >= OTP_MAX_ATTEMPTS
    ? { status: 'locked', attempts }
    : { status: 'wrong', attempts };
}
