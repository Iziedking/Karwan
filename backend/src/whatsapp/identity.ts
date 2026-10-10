import { createHash } from 'node:crypto';
import type { WhatsappAccount } from '../db/whatsapp.js';
import { chatAccountEmail } from '../emails/chatRecipients.js';

export const CHAT_TERMS_VERSION = 'chat-2026-10-10';

/// Lookup key for a phone number. The number itself never becomes a key, so
/// a leaked table does not list who uses Karwan.
export function hashNumber(number: string, pepper: string): string {
  return createHash('sha256').update(`${pepper}:${number.replace(/\D/g, '')}`).digest('hex');
}

export interface IdentityDeps {
  pepper: string;
  now: () => number;
  getAccount: (numberHash: string) => Promise<WhatsappAccount | null>;
  saveAccount: (a: WhatsappAccount) => Promise<WhatsappAccount>;
  findByNullifier: (nullifier: string) => Promise<WhatsappAccount | null>;
  provisionIdentity: (refHash: string) => Promise<{ walletId: string; address: string }>;
  createUser: (u: { email: string; address: string; circleIdentityWalletId: string }) => void;
  /// Creates the agent wallets, binds them to the identity and does
  /// everything an email account gets at activation.
  activate: (address: string) => Promise<void>;
}

export function createIdentity(deps: IdentityDeps) {
  async function getOrStart(from: string): Promise<WhatsappAccount> {
    const numberHash = hashNumber(from, deps.pepper);
    const existing = await deps.getAccount(numberHash);
    if (existing) return existing;
    return deps.saveAccount({
      numberHash,
      to: from,
      address: null,
      termsVersion: null,
      termsAt: null,
      lastInboundAt: null,
      queue: [],
    });
  }

  /// Nothing is created before the person accepts. The identity wallet is
  /// saved before activation, so a failed activation is retried on the same
  /// wallet and never creates a second one.
  async function acceptTerms(numberHash: string): Promise<WhatsappAccount> {
    let account = await deps.getAccount(numberHash);
    if (!account) throw new Error('unknown chat account');
    if (account.address && account.activated) return account;

    if (!account.address) {
      const identity = await deps.provisionIdentity(numberHash);
      deps.createUser({
        email: chatAccountEmail(numberHash),
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

  /// One person, one account: a World ID nullifier belongs to one account.
  async function attachNullifier(
    numberHash: string,
    nullifier: string,
  ): Promise<{ ok: true } | { ok: false; reason: 'nullifier_in_use' }> {
    const holder = await deps.findByNullifier(nullifier);
    if (holder && holder.numberHash !== numberHash) return { ok: false, reason: 'nullifier_in_use' };
    const account = await deps.getAccount(numberHash);
    if (!account) throw new Error('unknown chat account');
    await deps.saveAccount({ ...account, worldIdNullifier: nullifier });
    return { ok: true };
  }

  return { getOrStart, acceptTerms, attachNullifier };
}
