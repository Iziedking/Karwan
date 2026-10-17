import type { MessageToolDeps } from '../assistant/messageTools.js';
import { rememberInChat } from '../channels/chatHistory.js';
import { config } from '../config.js';
import { listDealsForAddress } from '../db/deals.js';
import { deleteRecord, getRecord, putRecord } from '../db/evidence.js';
import { addMessage, deleteDirectMessagesFor, listDirectFor, listMessages } from '../db/messages.js';
import { findProfileByHandle, getProfile } from '../db/profiles.js';
import { getTelegramLink } from '../db/telegramLinks.js';
import { sendDealEventEmail } from '../emails/dealEventEmail.js';
import { publicLocation } from '../location/rules.js';
import { logger } from '../logger.js';
import { loadPublicPassport } from '../sealed/passportLoader.js';
import { recordLinkOffense } from '../security/linkOffenses.js';
import { localScanProof } from '../security/localScan.js';
import { sendTelegramMessage } from '../telegram/bot.js';
import { deliverDirectAlert, type AlertDeps } from './alerts.js';
import type { SenderHistory } from './direct.js';
import { createDirect } from './directService.js';

const countryOf = async (address: string) => publicLocation((await getProfile(address).catch(() => null))?.location).country;

export const liveAlertDeps: AlertDeps = {
  countryOf,
  contact: async (address) => {
    const [profile, link] = await Promise.all([getProfile(address).catch(() => null), getTelegramLink(address).catch(() => null)]);
    return {
      muted: !!profile?.settings?.notificationsMuted,
      email: profile?.email && profile.emailVerified ? profile.email : null,
      telegramChatId: link?.chatId ?? null,
    };
  },
  telegram: (chatId, text, button) => sendTelegramMessage(chatId, text, button ? [button] : undefined, { plain: true }),
  remember: rememberInChat,
  email: async (to, content) => void (await sendDealEventEmail({ to, ...content })),
  baseUrl: config.FRONTEND_BASE_URL ? config.FRONTEND_BASE_URL.replace(/\/$/, '') : null,
};

export const liveDirect = createDirect({
  now: Date.now,
  findByTag: async (tag) => {
    const p = await findProfileByHandle(tag).catch(() => null);
    return p?.handle ? { address: p.address.toLowerCase(), tag: p.handle } : null;
  },
  tagOf: async (address) => (await getProfile(address).catch(() => null))?.handle ?? null,
  getHistory: async (address) => (await getRecord<SenderHistory>('dm-history', address)) ?? { firstMessages: [] },
  putHistory: (address, history) => putRecord('dm-history', address, history),
  add: addMessage,
  list: (key) => listMessages(key, 'direct', key),
  threadsFor: listDirectFor,
  hasDeal: async (a, b) => (await listDealsForAddress(a).catch(() => [])).some((d) => d.buyer.toLowerCase() === b || d.seller.toLowerCase() === b),
  alert: (a) =>
    deliverDirectAlert(a, liveAlertDeps).catch((err) => logger.warn({ err: (err as Error).message }, 'direct message alert failed')),
  scan: localScanProof,
  offense: (address, verdict, reasons) => recordLinkOffense({ address, jobId: 'direct', surface: 'chat', verdict, reasons }),
  dropHistory: (address) => deleteRecord('dm-history', address),
  dropMessages: async (address) => void (await deleteDirectMessagesFor(address)),
});

export const liveMessageToolDeps: MessageToolDeps = {
  send: liveDirect.send,
  list: liveDirect.list,
  inbox: liveDirect.inbox,
  describe: async (tag) => {
    const p = await findProfileByHandle(tag).catch(() => null);
    if (!p?.handle) return null;
    const passport = await loadPublicPassport(p.address);
    return { tag: p.handle, country: passport.country, tier: passport.tier };
  },
};
