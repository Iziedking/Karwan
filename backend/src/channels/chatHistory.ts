import { findTelegramAccountByAddress, saveTelegramAccount } from '../db/telegramAccounts.js';
import { choicesNote, type ChatChoices } from './numberReply.js';

const HISTORY_MAX = 20;

/// Writes something Karwan sent outside a conversation (a question, an alert)
/// into the person's chat history, so their agent knows what a reply answers.
export async function rememberInChat(address: string, text: string): Promise<void> {
  const account = await findTelegramAccountByAddress(address);
  if (!account) return;
  const history = [...(account.history ?? []), { role: 'assistant' as const, content: text }].slice(-HISTORY_MAX);
  await saveTelegramAccount({ ...account, history });
}

/// Keeps a numbered list Karwan sent, so a bare number in reply chooses from
/// it, and notes it in the history for the assistant.
export async function rememberChoices(address: string, choices: ChatChoices): Promise<void> {
  const account = await findTelegramAccountByAddress(address);
  if (!account) return;
  const history = [...(account.history ?? []), { role: 'assistant' as const, content: choicesNote(choices) }].slice(-HISTORY_MAX);
  await saveTelegramAccount({ ...account, history, choices });
}
