import type { SqlExecutor } from '../db/migrations.js';
import type { PresenceAction } from './action.js';
import type { PinState } from './pin.js';

/// A confirmation can be spent for this long after the person gave it.
export const GRANT_WINDOW_MS = 2 * 60_000;

export type PresenceMethod = 'pin' | 'passkey' | 'wallet';

export interface PresenceChallenge {
  id: string;
  wallet: string;
  digest: string;
  action: PresenceAction;
  webauthnChallenge: string;
  createdAt: number;
  expiresAt: number;
  confirmedAt: number | null;
  method: PresenceMethod | null;
  usedAt: number | null;
}

export interface PresencePasskey {
  credentialId: string;
  wallet: string;
  publicKey: string;
  counter: number;
  transports: string[];
  createdAt: number;
}

export type ConsumeResult = 'ok' | 'missing' | 'mismatch' | 'expired' | 'used';

export interface PresenceStore {
  pin: (wallet: string) => Promise<PinState | null>;
  savePin: (wallet: string, state: PinState) => Promise<void>;
  passkeys: (wallet: string) => Promise<PresencePasskey[]>;
  addPasskey: (p: PresencePasskey) => Promise<void>;
  removePasskey: (wallet: string, credentialId: string) => Promise<boolean>;
  bumpPasskey: (credentialId: string, counter: number) => Promise<void>;
  createChallenge: (c: PresenceChallenge) => Promise<void>;
  challenge: (id: string) => Promise<PresenceChallenge | null>;
  /// False when the challenge is gone, expired or already confirmed.
  confirm: (id: string, method: PresenceMethod, now: number) => Promise<boolean>;
  /// Spends a confirmation once, for the wallet and action it was given for.
  consume: (id: string, wallet: string, digest: string, now: number) => Promise<ConsumeResult>;
  /// One PIN check at a time per account, so parallel guesses cannot skip the count.
  withPinLock: <T>(wallet: string, fn: () => Promise<T>) => Promise<T>;
  forget: (wallet: string) => Promise<void>;
}

type Transaction = <T>(operation: (tx: SqlExecutor) => Promise<T>) => Promise<T>;

interface ChallengeRow extends Record<string, unknown> {
  id: string;
  wallet: string;
  digest: string;
  action: PresenceAction;
  webauthn_challenge: string;
  created_at: string;
  expires_at: string;
  confirmed_at: string | null;
  method: PresenceMethod | null;
  used_at: string | null;
}

interface PasskeyRow extends Record<string, unknown> {
  credential_id: string;
  wallet: string;
  public_key: string;
  counter: string;
  transports: string[];
  created_at: string;
}

const num = (v: string | null) => (v == null ? null : Number(v));

const toChallenge = (r: ChallengeRow): PresenceChallenge => ({
  id: r.id,
  wallet: r.wallet,
  digest: r.digest,
  action: r.action,
  webauthnChallenge: r.webauthn_challenge,
  createdAt: Number(r.created_at),
  expiresAt: Number(r.expires_at),
  confirmedAt: num(r.confirmed_at),
  method: r.method,
  usedAt: num(r.used_at),
});

const toPasskey = (r: PasskeyRow): PresencePasskey => ({
  credentialId: r.credential_id,
  wallet: r.wallet,
  publicKey: r.public_key,
  counter: Number(r.counter),
  transports: r.transports,
  createdAt: Number(r.created_at),
});

function whyNot(c: PresenceChallenge | null, wallet: string, digest: string, now: number): ConsumeResult {
  if (!c || c.confirmedAt === null) return 'missing';
  if (c.wallet !== wallet.toLowerCase() || c.digest !== digest) return 'mismatch';
  if (c.usedAt !== null) return 'used';
  if (now > c.confirmedAt + GRANT_WINDOW_MS) return 'expired';
  return 'ok';
}

export function createPostgresPresenceStore(transaction: Transaction): PresenceStore {
  const readChallenge = async (tx: SqlExecutor, id: string) => {
    const r = await tx.query<ChallengeRow>(`SELECT * FROM confirm_challenges_v1 WHERE id = $1`, [id]);
    return r.rows[0] ? toChallenge(r.rows[0]) : null;
  };

  return {
    pin: (wallet) =>
      transaction(async (tx) => {
        const r = await tx.query<{ hash: string; failures: number; locked_until: string | null }>(
          `SELECT hash, failures, locked_until FROM confirm_pins_v1 WHERE wallet = $1`,
          [wallet.toLowerCase()],
        );
        const row = r.rows[0];
        return row ? { hash: row.hash, failures: Number(row.failures), lockedUntil: num(row.locked_until) } : null;
      }),

    savePin: (wallet, state) =>
      transaction(async (tx) => {
        await tx.query(
          `INSERT INTO confirm_pins_v1 (wallet, hash, failures, locked_until, updated_at)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (wallet) DO UPDATE SET hash = EXCLUDED.hash, failures = EXCLUDED.failures,
             locked_until = EXCLUDED.locked_until, updated_at = EXCLUDED.updated_at`,
          [wallet.toLowerCase(), state.hash, state.failures, state.lockedUntil, Date.now()],
        );
      }),

    passkeys: (wallet) =>
      transaction(async (tx) => {
        const r = await tx.query<PasskeyRow>(
          `SELECT * FROM confirm_passkeys_v1 WHERE wallet = $1 ORDER BY created_at, credential_id`,
          [wallet.toLowerCase()],
        );
        return r.rows.map(toPasskey);
      }),

    addPasskey: (p) =>
      transaction(async (tx) => {
        await tx.query(
          `INSERT INTO confirm_passkeys_v1 (credential_id, wallet, public_key, counter, transports, created_at)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [p.credentialId, p.wallet.toLowerCase(), p.publicKey, p.counter, JSON.stringify(p.transports), p.createdAt],
        );
      }),

    removePasskey: (wallet, credentialId) =>
      transaction(async (tx) => {
        const r = await tx.query(
          `DELETE FROM confirm_passkeys_v1 WHERE wallet = $1 AND credential_id = $2 RETURNING credential_id`,
          [wallet.toLowerCase(), credentialId],
        );
        return r.rows.length === 1;
      }),

    bumpPasskey: (credentialId, counter) =>
      transaction(async (tx) => {
        await tx.query(`UPDATE confirm_passkeys_v1 SET counter = $2 WHERE credential_id = $1`, [credentialId, counter]);
      }),

    createChallenge: (c) =>
      transaction(async (tx) => {
        await tx.query(
          `INSERT INTO confirm_challenges_v1
             (id, wallet, digest, action, webauthn_challenge, created_at, expires_at, confirmed_at, method, used_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [c.id, c.wallet.toLowerCase(), c.digest, JSON.stringify(c.action), c.webauthnChallenge, c.createdAt, c.expiresAt, c.confirmedAt, c.method, c.usedAt],
        );
      }),

    challenge: (id) => transaction((tx) => readChallenge(tx, id)),

    confirm: (id, method, now) =>
      transaction(async (tx) => {
        const r = await tx.query(
          `UPDATE confirm_challenges_v1 SET confirmed_at = $2, method = $3
           WHERE id = $1 AND confirmed_at IS NULL AND expires_at >= $2 RETURNING id`,
          [id, now, method],
        );
        return r.rows.length === 1;
      }),

    consume: (id, wallet, digest, now) =>
      transaction(async (tx) => {
        const r = await tx.query(
          `UPDATE confirm_challenges_v1 SET used_at = $4
           WHERE id = $1 AND wallet = $2 AND digest = $3 AND confirmed_at IS NOT NULL
             AND used_at IS NULL AND confirmed_at + ${GRANT_WINDOW_MS} >= $4
           RETURNING id`,
          [id, wallet.toLowerCase(), digest, now],
        );
        if (r.rows.length === 1) return 'ok';
        const result = whyNot(await readChallenge(tx, id), wallet, digest, now);
        return result === 'ok' ? 'used' : result;
      }),

    withPinLock: (wallet, fn) =>
      transaction(async (tx) => {
        await tx.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`confirm-pin:${wallet.toLowerCase()}`]);
        return fn();
      }),

    forget: (wallet) =>
      transaction(async (tx) => {
        const key = wallet.toLowerCase();
        await tx.query(`DELETE FROM confirm_pins_v1 WHERE wallet = $1`, [key]);
        await tx.query(`DELETE FROM confirm_passkeys_v1 WHERE wallet = $1`, [key]);
        await tx.query(`DELETE FROM confirm_challenges_v1 WHERE wallet = $1`, [key]);
      }),
  };
}

/// The same store in memory, for a backend running without Postgres.
export function createMemoryPresenceStore(): PresenceStore {
  const pins = new Map<string, PinState>();
  const passkeys = new Map<string, PresencePasskey>();
  const challenges = new Map<string, PresenceChallenge>();
  const locks = new Map<string, Promise<unknown>>();

  return {
    pin: async (wallet) => {
      const s = pins.get(wallet.toLowerCase());
      return s ? { ...s } : null;
    },
    savePin: async (wallet, state) => {
      pins.set(wallet.toLowerCase(), { ...state });
    },
    passkeys: async (wallet) =>
      [...passkeys.values()]
        .filter((p) => p.wallet === wallet.toLowerCase())
        .sort((a, b) => a.createdAt - b.createdAt || (a.credentialId < b.credentialId ? -1 : 1))
        .map((p) => ({ ...p, transports: [...p.transports] })),
    addPasskey: async (p) => {
      if (passkeys.has(p.credentialId)) throw new Error('passkey already registered');
      passkeys.set(p.credentialId, { ...p, wallet: p.wallet.toLowerCase(), transports: [...p.transports] });
    },
    removePasskey: async (wallet, credentialId) => {
      const p = passkeys.get(credentialId);
      if (!p || p.wallet !== wallet.toLowerCase()) return false;
      return passkeys.delete(credentialId);
    },
    bumpPasskey: async (credentialId, counter) => {
      const p = passkeys.get(credentialId);
      if (p) p.counter = counter;
    },
    createChallenge: async (c) => {
      challenges.set(c.id, { ...c, wallet: c.wallet.toLowerCase() });
    },
    challenge: async (id) => {
      const c = challenges.get(id);
      return c ? { ...c } : null;
    },
    confirm: async (id, method, now) => {
      const c = challenges.get(id);
      if (!c || c.confirmedAt !== null || now > c.expiresAt) return false;
      c.confirmedAt = now;
      c.method = method;
      return true;
    },
    consume: async (id, wallet, digest, now) => {
      const c = challenges.get(id) ?? null;
      const result = whyNot(c, wallet, digest, now);
      if (result === 'ok') c!.usedAt = now;
      return result;
    },
    withPinLock: (wallet, fn) => {
      const key = wallet.toLowerCase();
      const run = (locks.get(key) ?? Promise.resolve()).then(fn);
      locks.set(key, run.catch(() => undefined));
      return run;
    },
    forget: async (wallet) => {
      const key = wallet.toLowerCase();
      pins.delete(key);
      for (const [id, p] of passkeys) if (p.wallet === key) passkeys.delete(id);
      for (const [id, c] of challenges) if (c.wallet === key) challenges.delete(id);
    },
  };
}
