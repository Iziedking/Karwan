import { createHmac, timingSafeEqual } from 'node:crypto';
import { config } from '../config.js';

/// Proof that the holder just confirmed an email with a one-time code. Carried
/// from the code step to wallet sign-in, where it links the email to the
/// passkey account the user created in between. Short-lived and useless as a
/// session: the context string keeps it from ever verifying as one.
const CONTEXT = 'karwan:email-proof:v1:';
export const EMAIL_PROOF_TTL_MS = 15 * 60 * 1000;

function mac(body: string, secret: string): string {
  return createHmac('sha256', secret).update(CONTEXT + body).digest('base64url');
}

export function signEmailProof(email: string, now = Date.now(), secret = config.SESSION_SECRET): string {
  if (!secret) throw new Error('SESSION_SECRET is not set');
  const body = Buffer.from(
    JSON.stringify({ email: email.trim().toLowerCase(), exp: now + EMAIL_PROOF_TTL_MS }),
  ).toString('base64url');
  return `${body}.${mac(body, secret)}`;
}

/// The proven email, or null when the token is forged, altered or expired.
export function verifyEmailProof(
  token: string,
  now = Date.now(),
  secret = config.SESSION_SECRET,
): string | null {
  if (!secret) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const expected = Buffer.from(mac(body, secret));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const { email, exp } = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as {
      email?: unknown;
      exp?: unknown;
    };
    if (typeof email !== 'string' || typeof exp !== 'number' || exp < now) return null;
    return email;
  } catch {
    return null;
  }
}
