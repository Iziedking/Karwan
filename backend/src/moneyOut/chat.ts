import type { OutMessage } from '../channels/render.js';
import { PAUSE_ID, REMOVE_PREFIX } from './messages.js';
import { QUIET_MS } from './rules.js';
import type { MoneyOutStore } from './store.js';

export interface MoneyOutChatDeps {
  enabled: boolean;
  now: () => number;
  store: MoneyOutStore;
  /// Karwan holds the account's keys. A web account linked to a chat is not one.
  isChatAccount: (address: string) => Promise<boolean>;
  /// A one-time sign-in link to a Karwan page, or null when no channel holds the account.
  openLink: (address: string, path: string) => Promise<string | null>;
}

const text = (body: string): OutMessage => ({ kind: 'text', body });

/// The money controls a chat account has in the chat itself: the check when
/// it comes back after a long silence, and the Pause and Remove buttons. None
/// of them moves money, so each is allowed on a chat button.
export function createMoneyOutChat(deps: MoneyOutChatDeps) {
  const withLink = async (address: string, body: string): Promise<OutMessage> => {
    const url = await deps.openLink(address, '/account');
    return url ? { kind: 'link', body, label: 'Open in Karwan', url } : text(body);
  };

  /// Called with the time of the person's previous message, before it is overwritten.
  async function noteReturn(address: string, previousAt: number | null): Promise<OutMessage | null> {
    if (!deps.enabled || previousAt === null || deps.now() - previousAt <= QUIET_MS) return null;
    if (!(await deps.isChatAccount(address))) return null;
    await deps.store.setReturnCheckDue(address, deps.now());
    return withLink(
      address,
      'Welcome back. It has been a while, so before money moves again, confirm it is still you with your World ID on Karwan.',
    );
  }

  async function tap(address: string, replyId: string): Promise<OutMessage | null> {
    if (replyId === PAUSE_ID) {
      await deps.store.setPaused(address, deps.now());
      return withLink(
        address,
        'Every payment out of your account is paused. Nothing leaves until you confirm with your World ID on Karwan.',
      );
    }
    if (replyId.startsWith(REMOVE_PREFIX)) {
      const removed = await deps.store.removeAddress(address, replyId.slice(REMOVE_PREFIX.length), deps.now());
      return text(removed ? 'Removed. Nothing can be sent to that address now.' : 'That address was already removed.');
    }
    return null;
  }

  return { noteReturn, tap };
}

export type MoneyOutChat = ReturnType<typeof createMoneyOutChat>;
