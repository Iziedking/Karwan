import { createHash } from 'node:crypto';
import type { ChatAccount } from './types.js';

export const CHAT_TERMS_VERSION = 'chat-2026-10-12';

/// Lookup key for a phone number. The number itself never becomes a key, so
/// a leaked table does not list who uses Karwan.
export function hashNumber(number: string, pepper: string): string {
  return createHash('sha256').update(`${pepper}:${number.replace(/\D/g, '')}`).digest('hex');
}

export interface IdentityDeps<A extends ChatAccount> {
  now: () => number;
  /// The lookup key for a channel id. Each channel hashes its own ids.
  keyOf: (from: string) => string;
  /// A new, empty account for someone's first message. Nothing is provisioned.
  blank: (numberHash: string, to: string) => A;
  /// The placeholder email of a chat account. Nothing is ever sent to it.
  emailOf: (numberHash: string) => string;
  getAccount: (numberHash: string) => Promise<A | null>;
  saveAccount: (a: A) => Promise<A>;
  provisionIdentity: (refHash: string) => Promise<{ walletId: string; address: string }>;
  createUser: (u: { email: string; address: string; circleIdentityWalletId: string }) => void;
  /// Creates the agent wallets, binds them to the identity and does
  /// everything an email account gets at activation.
  activate: (address: string) => Promise<void>;
}

export function createIdentity<A extends ChatAccount>(deps: IdentityDeps<A>) {
  async function getOrStart(from: string): Promise<A> {
    const numberHash = deps.keyOf(from);
    const existing = await deps.getAccount(numberHash);
    if (existing) return existing;
    return deps.saveAccount(deps.blank(numberHash, from));
  }

  /// Nothing is created before the person accepts. The identity wallet is
  /// saved before activation, so a failed activation is retried on the same
  /// wallet and never creates a second one.
  async function acceptTerms(numberHash: string): Promise<A> {
    let account = await deps.getAccount(numberHash);
    if (!account) throw new Error('unknown chat account');
    if (account.address && account.activated) return account;

    if (!account.address) {
      const identity = await deps.provisionIdentity(numberHash);
      deps.createUser({
        email: deps.emailOf(numberHash),
        address: identity.address,
        circleIdentityWalletId: identity.walletId,
      });
      account = await deps.saveAccount({
        ...account,
        address: identity.address.toLowerCase(),
        termsVersion: CHAT_TERMS_VERSION,
        termsAt: deps.now(),
      });
    }
    await deps.activate(account.address!);
    return deps.saveAccount({ ...account, activated: true });
  }

  return { getOrStart, acceptTerms };
}
