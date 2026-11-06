import { createHmac, timingSafeEqual } from 'node:crypto';
import { config } from '../config.js';
import { DISPLAY_CURRENCIES, type LocalCurrency, type UsdcRates } from './usdcRates.js';

/// An amount typed in a local currency, worked out in USDC at today's rate and
/// held for two minutes (view 55). USDC is what moves; the typed figure is what
/// the person agreed to and what their receipt keeps. Signed, so the server
/// that moves the money can trust the figure the screen showed.
export interface LocalAmount {
  currency: LocalCurrency;
  /// As typed, in the currency's own units: "50000".
  amount: string;
  /// 1 USDC in that currency when the quote was made.
  rate: number;
  at: number;
}

export interface Quote extends LocalAmount {
  /// The USDC that moves, in micros, rounded down to the token's precision.
  usdcMicros: string;
  expiresAt: number;
  token: string;
}

export const QUOTE_TTL_MS = 2 * 60_000;
const CONTEXT = 'karwan:quote:v1:';
const LOCAL = DISPLAY_CURRENCIES.filter((c): c is LocalCurrency => c !== 'USDC');

/// Naira, shillings and the CFA franc have no minor unit in use.
export function currencyDigits(currency: LocalCurrency): number {
  return currency === 'NGN' || currency === 'KES' || currency === 'XOF' ? 0 : 2;
}

export function isLocalCurrency(value: unknown): value is LocalCurrency {
  return typeof value === 'string' && (LOCAL as readonly string[]).includes(value);
}

/// "50000" or "49.5" as the currency allows; null for anything else.
export function cleanLocalAmount(raw: string, currency: LocalCurrency): string | null {
  const value = raw.trim().replace(/,/g, '');
  const digits = currencyDigits(currency);
  const shape = digits === 0 ? /^\d{1,15}$/ : /^\d{1,15}(\.\d{1,2})?$/;
  if (!shape.test(value) || Number(value) <= 0) return null;
  return digits === 0 ? String(Number(value)) : value;
}

/// USDC micros for a local amount at a rate, rounded down so the person never
/// moves more than they typed.
export function usdcMicrosFor(amount: string, rate: number): bigint {
  const micros = Math.floor((Number(amount) / rate) * 1_000_000);
  return BigInt(Math.max(0, micros));
}

function mac(body: string, secret: string): string {
  return createHmac('sha256', secret).update(CONTEXT + body).digest('base64url');
}

export function makeQuote(
  currency: LocalCurrency,
  rawAmount: string,
  rates: UsdcRates,
  now = Date.now(),
  secret = config.SESSION_SECRET,
): Quote | null {
  const amount = cleanLocalAmount(rawAmount, currency);
  const rate = rates.rates[currency];
  if (!amount || !rate || rates.updatedAt === null || !secret) return null;
  const usdcMicros = usdcMicrosFor(amount, rate);
  if (usdcMicros <= 0n) return null;
  const payload = { currency, amount, rate, at: now, usdcMicros: usdcMicros.toString(), expiresAt: now + QUOTE_TTL_MS };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return { ...payload, token: `${body}.${mac(body, secret)}` };
}

/// The quote behind a token, or null when it is forged, altered or expired.
export function verifyQuote(token: string, now = Date.now(), secret = config.SESSION_SECRET): Omit<Quote, 'token'> | null {
  if (!secret || typeof token !== 'string') return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const want = Buffer.from(mac(body, secret));
  const got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  try {
    const q = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as Omit<Quote, 'token'>;
    if (!isLocalCurrency(q.currency) || typeof q.expiresAt !== 'number' || q.expiresAt < now) return null;
    return q;
  } catch {
    return null;
  }
}

/// The local figure to keep on a record, when the quote is good and moves the
/// same USDC as the record. Anything else keeps no local figure: the record
/// stays true in USDC and reads at today's rate.
export function localFromQuote(
  token: string | undefined | null,
  usdcMicros: bigint | string,
  now = Date.now(),
  secret = config.SESSION_SECRET,
): LocalAmount | undefined {
  if (!token) return undefined;
  const q = verifyQuote(token, now, secret);
  if (!q || q.usdcMicros !== String(usdcMicros)) return undefined;
  return { currency: q.currency, amount: q.amount, rate: q.rate, at: q.at };
}
