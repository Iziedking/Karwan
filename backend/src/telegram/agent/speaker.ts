import type { TelegramAccount } from '../../db/telegramAccounts.js';

/// The account to save when this chat is linked to a web account, or null
/// when nothing changes. A custodial chat account is never repointed at a web
/// account by a link: its wallets and record stay where they are.
export function withLinkedAccount(
  account: TelegramAccount,
  linkedAddress: string | null,
  now: number,
): TelegramAccount | null {
  if (!linkedAddress) return null;
  const address = linkedAddress.toLowerCase();
  if (account.address && !account.linkedWebAccount) return null;
  if (account.address === address) return null;
  return {
    ...account,
    address,
    linkedWebAccount: true,
    termsVersion: 'web',
    termsAt: now,
    activated: true,
    history: [],
    pendingActions: {},
  };
}
