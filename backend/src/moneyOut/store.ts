import { randomUUID } from 'node:crypto';
import type { SqlExecutor } from '../db/migrations.js';
import { ADDRESS_WAIT_MS, addressKey, type Spend } from './rules.js';

export interface SavedAddress {
  id: string;
  chain: string;
  address: string;
  addedAt: number;
  opensAt: number;
}

export interface AccountState {
  pausedAt: number | null;
  returnCheckDueAt: number | null;
}

/// What a payment sees while it holds its account's lock: the spend so far,
/// and the one write that counts it.
export interface LockedSpend {
  spentSince: (at: number) => Promise<Spend[]>;
  /// A payment already counted under this reference: a retry, not a new payment.
  reserved: (reference: string) => Promise<boolean>;
  /// Counts a payment once per reference; a repeat is a no-op.
  reserve: (reference: string, amountMicros: bigint, at: number) => Promise<void>;
}

export interface MoneyOutStore {
  listAddresses: (wallet: string) => Promise<SavedAddress[]>;
  /// Saving an address that is already saved keeps the first one and its time.
  addAddress: (wallet: string, chain: string, address: string, now: number) => Promise<SavedAddress>;
  removeAddress: (wallet: string, id: string, now: number) => Promise<boolean>;
  state: (wallet: string) => Promise<AccountState>;
  setPaused: (wallet: string, at: number | null) => Promise<void>;
  setReturnCheckDue: (wallet: string, at: number | null) => Promise<void>;
  /// One payment at a time per account, so two cannot both fit under the limit.
  withAccountLock: <T>(wallet: string, fn: (spend: LockedSpend) => Promise<T>) => Promise<T>;
  /// Uncounts a payment that failed before anything was submitted.
  release: (reference: string) => Promise<void>;
}

type Transaction = <T>(operation: (tx: SqlExecutor) => Promise<T>) => Promise<T>;

interface AddressRow extends Record<string, unknown> {
  id: string;
  chain: string;
  address: string;
  added_at: string;
  opens_at: string;
}

const toAddress = (r: AddressRow): SavedAddress => ({
  id: r.id,
  chain: r.chain,
  address: r.address,
  addedAt: Number(r.added_at),
  opensAt: Number(r.opens_at),
});

export function createPostgresMoneyOutStore(transaction: Transaction): MoneyOutStore {
  const upsertState = (column: 'paused_at' | 'return_check_due_at') => (wallet: string, at: number | null) =>
    transaction(async (tx) => {
      await tx.query(
        `INSERT INTO money_out_state_v1 (wallet, ${column}) VALUES ($1, $2)
         ON CONFLICT (wallet) DO UPDATE SET ${column} = EXCLUDED.${column}`,
        [wallet.toLowerCase(), at],
      );
    });

  return {
    listAddresses: (wallet) =>
      transaction(async (tx) => {
        const r = await tx.query<AddressRow>(
          `SELECT id, chain, address, added_at, opens_at FROM money_out_addresses_v1
           WHERE wallet = $1 AND removed_at IS NULL ORDER BY added_at, id`,
          [wallet.toLowerCase()],
        );
        return r.rows.map(toAddress);
      }),

    addAddress: (wallet, chain, address, now) =>
      transaction(async (tx) => {
        const key = [wallet.toLowerCase(), chain, addressKey(address)];
        await tx.query(
          `INSERT INTO money_out_addresses_v1 (id, wallet, chain, address, added_at, opens_at)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (wallet, chain, address) WHERE removed_at IS NULL DO NOTHING`,
          [randomUUID(), ...key, now, now + ADDRESS_WAIT_MS],
        );
        const r = await tx.query<AddressRow>(
          `SELECT id, chain, address, added_at, opens_at FROM money_out_addresses_v1
           WHERE wallet = $1 AND chain = $2 AND address = $3 AND removed_at IS NULL`,
          key,
        );
        return toAddress(r.rows[0]!);
      }),

    removeAddress: (wallet, id, now) =>
      transaction(async (tx) => {
        const r = await tx.query(
          `UPDATE money_out_addresses_v1 SET removed_at = $3
           WHERE wallet = $1 AND id = $2 AND removed_at IS NULL RETURNING id`,
          [wallet.toLowerCase(), id, now],
        );
        return r.rows.length === 1;
      }),

    state: (wallet) =>
      transaction(async (tx) => {
        const r = await tx.query<{ paused_at: string | null; return_check_due_at: string | null }>(
          `SELECT paused_at, return_check_due_at FROM money_out_state_v1 WHERE wallet = $1`,
          [wallet.toLowerCase()],
        );
        const row = r.rows[0];
        return {
          pausedAt: row?.paused_at == null ? null : Number(row.paused_at),
          returnCheckDueAt: row?.return_check_due_at == null ? null : Number(row.return_check_due_at),
        };
      }),

    setPaused: upsertState('paused_at'),
    setReturnCheckDue: upsertState('return_check_due_at'),

    withAccountLock: (wallet, fn) =>
      transaction(async (tx) => {
        const key = wallet.toLowerCase();
        await tx.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`money-out:${key}`]);
        return fn({
          spentSince: async (at) => {
            const r = await tx.query<{ amount_micros: string; at: string }>(
              `SELECT amount_micros, at FROM money_out_spend_v1 WHERE wallet = $1 AND at > $2 ORDER BY at`,
              [key, at],
            );
            return r.rows.map((row) => ({ amountMicros: BigInt(row.amount_micros), at: Number(row.at) }));
          },
          reserved: async (reference) => {
            const r = await tx.query(`SELECT 1 FROM money_out_spend_v1 WHERE reference = $1 AND wallet = $2`, [reference, key]);
            return r.rows.length === 1;
          },
          reserve: async (reference, amountMicros, at) => {
            await tx.query(
              `INSERT INTO money_out_spend_v1 (reference, wallet, amount_micros, at) VALUES ($1, $2, $3, $4)
               ON CONFLICT (reference) DO NOTHING`,
              [reference, key, amountMicros.toString(), at],
            );
          },
        });
      }),

    release: (reference) =>
      transaction(async (tx) => {
        await tx.query(`DELETE FROM money_out_spend_v1 WHERE reference = $1`, [reference]);
      }),
  };
}

/// The same store in memory, for a backend running without Postgres.
export function createMemoryMoneyOutStore(): MoneyOutStore {
  const addresses: (SavedAddress & { wallet: string; removedAt: number | null })[] = [];
  const states = new Map<string, AccountState>();
  const spends = new Map<string, Spend & { wallet: string }>();
  const locks = new Map<string, Promise<unknown>>();
  const live = (wallet: string) => addresses.filter((a) => a.wallet === wallet.toLowerCase() && a.removedAt === null);
  const strip = ({ wallet: _w, removedAt: _r, ...a }: (typeof addresses)[number]): SavedAddress => a;
  const stateOf = (wallet: string) => states.get(wallet.toLowerCase()) ?? { pausedAt: null, returnCheckDueAt: null };

  return {
    listAddresses: async (wallet) => live(wallet).map(strip),
    addAddress: async (wallet, chain, address, now) => {
      const existing = live(wallet).find((a) => a.chain === chain && a.address === addressKey(address));
      if (existing) return strip(existing);
      const row = {
        id: randomUUID(),
        wallet: wallet.toLowerCase(),
        chain,
        address: addressKey(address),
        addedAt: now,
        opensAt: now + ADDRESS_WAIT_MS,
        removedAt: null,
      };
      addresses.push(row);
      return strip(row);
    },
    removeAddress: async (wallet, id, now) => {
      const row = live(wallet).find((a) => a.id === id);
      if (!row) return false;
      row.removedAt = now;
      return true;
    },
    state: async (wallet) => ({ ...stateOf(wallet) }),
    setPaused: async (wallet, at) => {
      states.set(wallet.toLowerCase(), { ...stateOf(wallet), pausedAt: at });
    },
    setReturnCheckDue: async (wallet, at) => {
      states.set(wallet.toLowerCase(), { ...stateOf(wallet), returnCheckDueAt: at });
    },
    withAccountLock: (wallet, fn) => {
      const key = wallet.toLowerCase();
      const run = (locks.get(key) ?? Promise.resolve()).then(() =>
        fn({
          spentSince: async (at) =>
            [...spends.values()]
              .filter((s) => s.wallet === key && s.at > at)
              .sort((a, b) => a.at - b.at)
              .map(({ amountMicros, at: when }) => ({ amountMicros, at: when })),
          reserved: async (reference) => spends.get(reference)?.wallet === key,
          reserve: async (reference, amountMicros, at) => {
            if (!spends.has(reference)) spends.set(reference, { wallet: key, amountMicros, at });
          },
        }),
      );
      locks.set(key, run.catch(() => undefined));
      return run;
    },
    release: async (reference) => {
      spends.delete(reference);
    },
  };
}
