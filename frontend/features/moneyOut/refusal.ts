import { ApiError, type MoneyOutCheck } from '@/core/api';
import type { MoneyOutCopy } from '@/shared/i18n/messages/moneyOut';

/// Why the backend kept money in an account Karwan signs for
/// (backend/src/moneyOut/refusal.ts).
export type RefusalCode =
  | 'NO_SESSION'
  | 'PAUSED'
  | 'RETURN_CHECK'
  | 'ADDRESS_NOT_SAVED'
  | 'ADDRESS_OPENS_LATER'
  | 'DAILY_LIMIT'
  | 'OWN_WALLET_ONLY';

export interface MoneyOutRefusal {
  code: RefusalCode;
  opensAt?: number;
  limitUsdc?: string;
  leftUsdc?: string;
  moreAt?: number;
}

const CODES: ReadonlySet<string> = new Set<RefusalCode>([
  'NO_SESSION',
  'PAUSED',
  'RETURN_CHECK',
  'ADDRESS_NOT_SAVED',
  'ADDRESS_OPENS_LATER',
  'DAILY_LIMIT',
  'OWN_WALLET_ONLY',
]);

export function moneyOutRefusalOf(err: unknown): MoneyOutRefusal | null {
  if (!(err instanceof ApiError) || err.status !== 409 || !err.code?.startsWith('MONEY_OUT_')) return null;
  const code = err.code.slice('MONEY_OUT_'.length);
  if (!CODES.has(code)) return null;
  const body = (err.body ?? {}) as { opensAt?: unknown; limitUsdc?: unknown; leftUsdc?: unknown; moreAt?: unknown };
  return {
    code: code as RefusalCode,
    ...(typeof body.opensAt === 'number' ? { opensAt: body.opensAt } : {}),
    ...(typeof body.limitUsdc === 'string' ? { limitUsdc: body.limitUsdc } : {}),
    ...(typeof body.leftUsdc === 'string' ? { leftUsdc: body.leftUsdc } : {}),
    ...(typeof body.moreAt === 'number' ? { moreAt: body.moreAt } : {}),
  };
}

export type NextStep =
  | { kind: 'check'; purpose: Exclude<MoneyOutCheck, 'enrol'> }
  | { kind: 'link'; href: '/verify/person' }
  | { kind: 'none' };

/// The one thing the person can do about it. A wait, the limit and an
/// own-wallet rule have nothing to press.
export function nextStepFor(refusal: MoneyOutRefusal): NextStep {
  switch (refusal.code) {
    case 'ADDRESS_NOT_SAVED':
      return { kind: 'check', purpose: 'add_address' };
    case 'RETURN_CHECK':
      return { kind: 'check', purpose: 'return' };
    case 'PAUSED':
      return { kind: 'check', purpose: 'unpause' };
    case 'NO_SESSION':
      return { kind: 'link', href: '/verify/person' };
    default:
      return { kind: 'none' };
  }
}

/// A day and a time in the reader's language and time zone.
export function formatWhen(ms: number, locale: string): string {
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(ms);
}

const fillIn = (template: string, values: Record<string, string>) =>
  template.replace(/\{(\w+)\}/g, (match, key: string) => values[key] ?? match);

/// The sentence a payment screen shows for the guard's answer.
export function refusalLine(refusal: MoneyOutRefusal, copy: MoneyOutCopy, locale: string): string {
  switch (refusal.code) {
    case 'NO_SESSION':
      return copy.noSession;
    case 'PAUSED':
      return copy.paused;
    case 'RETURN_CHECK':
      return copy.returnCheck;
    case 'ADDRESS_NOT_SAVED':
      return copy.notSaved;
    case 'ADDRESS_OPENS_LATER':
      return refusal.opensAt ? fillIn(copy.opensLater, { time: formatWhen(refusal.opensAt, locale) }) : copy.notSaved;
    case 'DAILY_LIMIT':
      return fillIn(copy.limit, {
        limit: refusal.limitUsdc ?? '',
        left: refusal.leftUsdc ?? '0',
        time: refusal.moreAt ? formatWhen(refusal.moreAt, locale) : '',
      });
    case 'OWN_WALLET_ONLY':
      return copy.ownWalletOnly;
  }
}
