import { findTelegramAccountByAddress, saveTelegramAccount } from '../db/telegramAccounts.js';

const HISTORY_MAX = 20;

/// Writes something Karwan sent outside a conversation (a question, an alert)
/// into the person's chat history, so their agent knows what a reply answers.
export async function rememberInChat(address: string, text: string): Promise<void> {
  const account = await findTelegramAccountByAddress(address);
  if (!account) return;
  const history = [...(account.history ?? []), { role: 'assistant' as const, content: text }].slice(-HISTORY_MAX);
  await saveTelegramAccount({ ...account, history });
}
