import { findTelegramAccountByAddress } from '../db/telegramAccounts.js';
import { findWhatsappAccountByAddress } from '../db/whatsapp.js';
import { createChatAccounts } from './accounts.js';

/// A Telegram chat linked to a web account runs as that account but Karwan
/// does not hold its keys, so it is not a chat account here.
export const { findChatAccountByAddress, isChatAccount } = createChatAccounts({
  telegram: async (address) => {
    const account = await findTelegramAccountByAddress(address);
    return account && !account.linkedWebAccount ? account : null;
  },
  whatsapp: findWhatsappAccountByAddress,
});
