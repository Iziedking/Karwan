import { decide, type AccountKind, type Exit, type Refusal } from './rules.js';
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
}

export type GuardResult = { ok: true; release: () => Promise<void> } | { ok: false; refusal: Refusal };

const WINDOW_MS = 24 * 3_600_000;
const nothing = async () => {};

/// Asked by every route that sends money out of a wallet Karwan signs for,
/// before anything is submitted. An allowed payment is counted at once, under
/// its money movement's reference, so a retry is the same payment; `release`
/// uncounts it when the route stops before submitting.
export function createMoneyOutGuard(deps: MoneyOutGuardDeps) {
  async function check(input: { wallet: string; exit: Exit; amountMicros: bigint; reference: string }): Promise<GuardResult> {
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
        saved,
        spent,
        hasSession,
        paused: state.pausedAt !== null,
        returnCheckDue: state.returnCheckDueAt !== null,
      });
      if (!decision.ok) return decision;
      if (!counts || toOwnWallet(input.exit, ownAddresses)) return { ok: true, release: nothing };
      await spend.reserve(input.reference, input.amountMicros, now);
      return { ok: true, release: () => deps.store.release(input.reference) };
    });
  }

  return { check };
}

function toOwnWallet(exit: Exit, own: readonly string[]): boolean {
  return exit.kind === 'payout' && own.some((a) => a.toLowerCase() === exit.address.toLowerCase());
}

export type MoneyOutGuard = ReturnType<typeof createMoneyOutGuard>;
