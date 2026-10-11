import { decide, toOwnWallet, type AccountKind, type Exit, type Refusal } from './rules.js';
import { logger } from '../logger.js';
import type { MoneyOutStore } from './store.js';

export interface MoneyOutGuardDeps {
  enabled: boolean;
  now: () => number;
  store: MoneyOutStore;
  kindOf: (wallet: string) => Promise<AccountKind>;
  /// The account's own wallets: identity and agents.
  ownAddresses: (wallet: string) => Promise<string[]>;
  /// The account has a World ID session saved.
  hasSession: (wallet: string) => Promise<boolean>;
  /// Tells the chat a payment out was counted. Never awaited by the payment.
  notify?: (wallet: string, outgoing: Outgoing) => Promise<void>;
}

export interface Outgoing {
  wallet: string;
  exit: Exit;
  amountMicros: bigint;
  reference: string;
  /// Signed in with a wallet key, the same address on every chain.
  ownEverywhere?: boolean;
}

export type GuardResult = { ok: true; release: () => Promise<void> } | { ok: false; refusal: Refusal };

const WINDOW_MS = 24 * 3_600_000;
const nothing = async () => {};

/// Asked by every route that sends money out of a wallet Karwan signs for,
/// before anything is submitted. An allowed payment is counted at once, under
/// its money movement's reference, so a retry is the same payment; `release`
/// uncounts it when the route stops before submitting. A route asks once with
/// `reserve: false` as soon as it knows the payment, to refuse before any other
/// work, and once more right before it submits, which is the check that counts.
export function createMoneyOutGuard(deps: MoneyOutGuardDeps) {
  async function check(input: Outgoing, opts: { reserve?: boolean } = {}): Promise<GuardResult> {
    if (!deps.enabled) return { ok: true, release: nothing };
    const wallet = input.wallet.toLowerCase();
    const [kind, ownAddresses] = await Promise.all([deps.kindOf(wallet), deps.ownAddresses(wallet)]);
    const counts = kind === 'chat';

    return deps.store.withAccountLock(wallet, async (spend) => {
      if (counts && (await spend.reserved(input.reference))) {
        return { ok: true, release: () => deps.store.release(input.reference) };
      }
      const now = deps.now();
      const [saved, state, hasSession, spent] = await Promise.all([
        counts ? deps.store.listAddresses(wallet) : Promise.resolve([]),
        deps.store.state(wallet),
        counts ? deps.hasSession(wallet) : Promise.resolve(false),
        counts ? spend.spentSince(now - WINDOW_MS) : Promise.resolve([]),
      ]);
      const decision = decide({
        kind,
        exit: input.exit,
        amountMicros: input.amountMicros,
        now,
        ownAddresses,
        ownEverywhere: input.ownEverywhere,
        saved,
        spent,
        hasSession,
        paused: state.pausedAt !== null,
        returnCheckDue: state.returnCheckDueAt !== null,
      });
      if (!decision.ok) return decision;
      if (!counts || opts.reserve === false || toOwnWallet(input.exit, ownAddresses, input.ownEverywhere)) {
        return { ok: true, release: nothing };
      }
      await spend.reserve(input.reference, input.amountMicros, now);
      void deps.notify?.(wallet, input).catch((err: Error) => {
        logger.warn({ wallet, reference: input.reference, err: err.message }, 'money-out notice not sent');
      });
      return { ok: true, release: () => deps.store.release(input.reference) };
    });
  }

  return { check };
}

export type MoneyOutGuard = ReturnType<typeof createMoneyOutGuard>;
