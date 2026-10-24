/// Coming back to the assistant reopens the conversation you were in. A new,
/// empty chat starts only when you ask for one, and coming back to that empty
/// chat keeps it empty.

export const NEW_CHAT = 'new';

const key = (account: string) => `karwan:assistant:open:${account.toLowerCase()}`;

/// Which saved conversation to open on arrival: the one last open on this
/// device when it still exists, else the most recent; none when the last thing
/// you did was start a new chat, or there is nothing saved.
export function conversationToResume(list: { id: string; updatedAt: number }[], remembered: string | null): string | null {
  if (remembered === NEW_CHAT) return null;
  if (remembered && list.some((c) => c.id === remembered)) return remembered;
  if (list.length === 0) return null;
  return [...list].sort((a, b) => b.updatedAt - a.updatedAt)[0]!.id;
}

export function readOpenConversation(account: string | null): string | null {
  if (!account) return null;
  try {
    return localStorage.getItem(key(account));
  } catch {
    return null;
  }
}

export function rememberOpenConversation(account: string | null, id: string): void {
  if (!account) return;
  try {
    localStorage.setItem(key(account), id);
  } catch {
    /* private mode: the most recent conversation opens instead */
  }
}
