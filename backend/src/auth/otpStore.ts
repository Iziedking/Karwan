import { checkOtpAttempt, generateOtpCode, hashOtpCode, OTP_MAX_ATTEMPTS, OTP_TTL_MS } from './otp.js';

/// The 6-digit email codes, shared by the website's sign-in routes and the
/// chat bots, so a code sent from either is checked the same way. Codes are
/// stored as an HMAC bound to the email, never in the clear.
///
/// Limits sit here, not on a route, so every caller shares them: within ten
/// minutes of the first code an email gets at most five codes, a new code
/// keeps the wrong guesses already made, and a locked email stays locked
/// until the ten minutes pass. Five guesses per window, whoever asks.

export interface PendingEmailCode {
  codeHash: string;
  email: string;
  expiresAt: number;
  attempts: number;
  /// Codes sent in the current window, and when the window ends.
  sends?: number;
  windowEndsAt?: number;
}

const WINDOW_MS = 10 * 60_000;
const MAX_SENDS = 5;

interface CodeStore {
  get: (email: string) => PendingEmailCode | undefined;
  set: (email: string, value: PendingEmailCode) => unknown;
  delete: (email: string) => unknown;
  entries: () => Iterable<[string, PendingEmailCode]>;
}

export interface EmailCodeDeps {
  store: CodeStore;
  secret: () => string;
  send: (email: string, code: string) => Promise<{ delivered: boolean }>;
  /// The code comes back in the answer only when this is true and the email
  /// was not delivered: local development without a mail key.
  devCodes: () => boolean;
  now?: () => number;
}

export type EmailCodeCheck = 'ok' | 'wrong' | 'expired' | 'locked' | 'none';

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export function createEmailCodes(deps: EmailCodeDeps) {
  const now = deps.now ?? Date.now;

  const endsAt = (v: PendingEmailCode) => Math.max(v.expiresAt, v.windowEndsAt ?? 0);

  function purgeStale() {
    const t = now();
    for (const [k, v] of [...deps.store.entries()]) if (endsAt(v) < t) deps.store.delete(k);
  }

  async function request(rawEmail: string): Promise<{ delivered: boolean; devCode?: string; limited?: true }> {
    const email = normalizeEmail(rawEmail);
    purgeStale();
    const t = now();
    const open = deps.store.get(email);
    const inWindow = !!open && (open.windowEndsAt ?? 0) > t;
    if (open && inWindow && (open.attempts >= OTP_MAX_ATTEMPTS || (open.sends ?? 1) >= MAX_SENDS)) {
      return { delivered: false, limited: true };
    }
    const code = generateOtpCode();
    deps.store.set(email, {
      codeHash: hashOtpCode(code, email, deps.secret()),
      email,
      expiresAt: t + OTP_TTL_MS,
      attempts: inWindow ? open!.attempts : 0,
      sends: inWindow ? (open!.sends ?? 1) + 1 : 1,
      windowEndsAt: inWindow ? open!.windowEndsAt : t + WINDOW_MS,
    });
    let delivered = false;
    try {
      delivered = (await deps.send(email, code)).delivered;
    } catch {
      // The code is stored either way; the person can ask for it again.
    }
    return { delivered, ...(deps.devCodes() && !delivered ? { devCode: code } : {}) };
  }

  function verify(rawEmail: string, rawCode: string): EmailCodeCheck {
    const email = normalizeEmail(rawEmail);
    const code = rawCode.replace(/\s/g, '');
    const entry = deps.store.get(email);
    if (!entry) return 'none';
    const result = checkOtpAttempt(entry, code, email, deps.secret(), now());
    if (result.status === 'wrong' || result.status === 'locked') {
      // A locked email keeps its record, so no new code can reset the count.
      deps.store.set(email, { ...entry, attempts: Math.max(result.attempts, entry.attempts) });
      return result.status;
    }
    if (result.status === 'expired') return 'expired';
    deps.store.delete(email);
    return 'ok';
  }

  return { request, verify };
}
