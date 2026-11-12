import { bus } from '../events.js';
import { getProfile } from '../db/profiles.js';
import { getTelegramLink } from '../db/telegramLinks.js';
import { emailOperatorReply } from '../emails/supportTranscript.js';
import { caseStore } from './cases.js';
import { deliverReply, replyRoute, type ReplyChannel } from './replyRoute.js';
import type { SupportConversation } from './store.js';

/// Send a teammate's reply back the way the person came (view 78): the
/// channel they last wrote from, then the account's other channels, stopping
/// at the first that takes it. The website case page always has the reply.
/// Telegram goes out as one `support.reply` bus event the notifier routes to
/// the person's linked chat (kept off the public event feed).

type Reach = { telegramLinked: boolean; verifiedEmail?: string };

async function liveReach(address: string | undefined): Promise<Reach> {
  if (!address) return { telegramLinked: false };
  const [link, profile] = await Promise.all([getTelegramLink(address).catch(() => null), getProfile(address).catch(() => null)]);
  return {
    telegramLinked: !!link,
    ...(profile?.emailVerified && profile.email ? { verifiedEmail: profile.email } : {}),
  };
}

export async function notifyUserOfReply(
  convo: SupportConversation,
  text: string,
  opts: {
    messageId?: string;
    reach?: (address: string | undefined) => Promise<Reach>;
    send?: Record<ReplyChannel, () => Promise<boolean>>;
  } = {},
): Promise<ReplyChannel[]> {
  const reach = await (opts.reach ?? liveReach)(convo.address);
  const email = convo.email ?? reach.verifiedEmail;
  const route = replyRoute(
    { lastChannel: convo.channel === 'widget' ? 'web' : convo.channel, ...(convo.email ? { email: convo.email } : {}), ...(convo.address ? { address: convo.address } : {}) },
    reach,
  );
  const took = await deliverReply(route, opts.send ?? {
    email: async () => !!email && (await emailOperatorReply({ ...convo, email }, text)).delivered,
    telegram: async () => {
      bus.emitEvent({
        type: 'support.reply',
        actor: 'platform',
        payload: { address: convo.address, ticketId: convo.id, text: text.slice(0, 400) },
      });
      return true;
    },
  });
  if (opts.messageId) {
    const c = await caseStore().get(convo.id);
    if (c) await caseStore().delivered(c.id, opts.messageId, took);
  }
  return took;
}
