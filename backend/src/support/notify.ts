import { bus } from '../events.js';
import { getProfile } from '../db/profiles.js';
import { emailOperatorReply } from '../emails/supportTranscript.js';
import type { SupportConversation } from './store.js';

/// Fan an operator's reply out to every channel the user has, so they get it
/// whether or not the chat widget is open:
///   - email: the ticket's own address, or the user's verified profile email
///   - Telegram + in-app: one `support.reply` bus event the notifier routes to
///     the user's linked Telegram (the event is kept off the public SSE feed)
///   - the widget poll already shows it live when the chat is open
/// All channels lead back to the one ticket. Best-effort; one failing never
/// blocks the others. Guest tickets (no wallet, no email) reach only the widget.
export async function notifyUserOfReply(
  convo: SupportConversation,
  text: string,
): Promise<void> {
  let email = convo.email;
  if (!email && convo.address) {
    const p = await getProfile(convo.address).catch(() => null);
    if (p?.emailVerified && p.email) email = p.email;
  }
  if (email) void emailOperatorReply({ ...convo, email }, text);

  if (convo.address) {
    bus.emitEvent({
      type: 'support.reply',
      actor: 'platform',
      payload: { address: convo.address, ticketId: convo.id, text: text.slice(0, 400) },
    });
  }
}
