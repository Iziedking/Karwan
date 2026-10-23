import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';

export const PIN_MAX_FAILURES = 5;
export const PIN_LOCK_MS = 15 * 60_000;

const N = 2 ** 15;
const R = 8;
const P = 1;
const KEY_BYTES = 32;
const MAXMEM = 64 * 1024 * 1024;

export interface PinState {
  hash: string;
  failures: number;
  lockedUntil: number | null;
}

function derive(pin: string, salt: Buffer, opts: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(pin, salt, KEY_BYTES, opts, (err, key) => (err ? reject(err) : resolve(key))),
  );
}

export function normalizePin(raw: string): string | null {
  const pin = raw.replace(/\s+/g, '');
  return /^[0-9]{6}$/.test(pin) ? pin : null;
}

export function pinProblem(pin: string): 'format' | 'too_simple' | null {
  if (!/^[0-9]{6}$/.test(pin)) return 'format';
  const d = [...pin].map(Number);
  const steps = new Set(d.slice(1).map((x, i) => x - d[i]!));
  const [step] = steps;
  if (steps.size === 1 && (step === 0 || step === 1 || step === -1)) return 'too_simple';
  return null;
}

export async function hashPin(pin: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(pin, salt, { N, r: R, p: P, maxmem: MAXMEM });
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64url')}$${key.toString('base64url')}`;
}

/// Reads the parameters from the stored hash, so they can be raised later.
export async function verifyPinHash(pin: string, stored: string): Promise<boolean> {
  const [kind, ns, rs, ps, saltText, hashText] = stored.split('$');
  if (kind !== 'scrypt' || saltText === undefined || hashText === undefined) return false;
  const [n, r, p] = [ns, rs, ps].map(Number) as [number, number, number];
  if (![n, r, p].every((x) => Number.isInteger(x) && x > 0)) return false;
  const salt = Buffer.from(saltText, 'base64url');
  const expected = Buffer.from(hashText, 'base64url');
  if (expected.length !== KEY_BYTES) return false;
  const key = await derive(pin, salt, { N: n, r, p, maxmem: MAXMEM });
  return timingSafeEqual(key, expected);
}

export function pinGate(state: PinState, now: number): { ok: true } | { ok: false; until: number } {
  return state.lockedUntil !== null && now < state.lockedUntil ? { ok: false, until: state.lockedUntil } : { ok: true };
}

export function afterPinFailure(state: PinState, now: number): PinState {
  const failures = state.failures + 1;
  return failures >= PIN_MAX_FAILURES
    ? { ...state, failures: 0, lockedUntil: now + PIN_LOCK_MS }
    : { ...state, failures, lockedUntil: null };
}

export function afterPinSuccess(state: PinState): PinState {
  return { ...state, failures: 0, lockedUntil: null };
}
