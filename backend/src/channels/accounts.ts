import type { ChatAccount } from './types.js';

export type ChatChannel = 'telegram' | 'whatsapp';

type FindByAddress = (address: string) => Promise<ChatAccount | null>;

/// One answer to "is this a chat account, and on which channel", whichever
/// channel opened it. Callers never ask a channel's store directly.
export function createChatAccounts(stores: Record<ChatChannel, FindByAddress>) {
  async function findChatAccountByAddress(address: string): Promise<{ channel: ChatChannel; account: ChatAccount } | null> {
    const key = address.toLowerCase();
    for (const channel of ['telegram', 'whatsapp'] as const) {
      const account = await stores[channel](key);
      if (account) return { channel, account };
    }
    return null;
  }

  async function isChatAccount(address: string): Promise<boolean> {
    return (await findChatAccountByAddress(address)) !== null;
  }

  return { findChatAccountByAddress, isChatAccount };
}
