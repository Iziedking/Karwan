import { createHash } from 'node:crypto';
import type { AssistantAction } from '../../assistant/actions.js';
import { ARC } from '../../chain/client.js';
import { createDispatcher } from '../../channels/dispatch.js';
import { createExecutor } from '../../channels/executor.js';
import { createIdentity } from '../../channels/identity.js';
import { callAsAccount } from '../../channels/inProcess.js';
import { extractInvoice, MEDIA_MAX_BYTES } from '../../channels/invoiceExtract.js';
import { createEvidenceIntake } from '../../channels/media.js';
import { chatOpenLinks, chatOpenUrl } from '../../channels/openLinksLive.js';
import type { OutMessage } from '../../channels/render.js';
import { installChannelPorts, tellAccount } from '../../channels/sender.js';
import { provisionUserIdentityWallet } from '../../circle/wallets.js';
import { config } from '../../config.js';
import { claimUnique } from '../../db/evidence.js';
import { getProfile } from '../../db/profiles.js';
import {
  findTelegramAccountByAddress,
  getTelegramAccount,
  markTelegramUpdateProcessed,
  saveTelegramAccount,
  type TelegramAccount,
} from '../../db/telegramAccounts.js';
import { findAddressByChatId, saveTelegramLink } from '../../db/telegramLinks.js';
import { createUser } from '../../db/users.js';
import { telegramAccountEmail } from '../../emails/chatRecipients.js';
import { logger } from '../../logger.js';
import { addVerifiedFact, cacReview, clientConfirmations } from '../../verification/live.js';
import { installVerificationServices } from '../../verification/services.js';
import { setTelegramAgentHandler } from '../bot.js';
import { createTelegramApi } from './api.js';
import { createTelegramHandler } from './handler.js';
import { toTelegram } from './render.js';

const chatIdOf = (to: string) => Number(to.replace(/^tg:/, ''));

/// Wires the Karwan agent onto the existing Telegram bot. Runs at startup and
/// does nothing unless TELEGRAM_AGENT_ENABLED is on with the bot token and the
/// pepper set. Returns whether the agent started.
export function startTelegramAgent(): boolean {
  if (!config.TELEGRAM_AGENT_ENABLED) return false;
  const token = config.TELEGRAM_BOT_TOKEN;
  const pepper = config.CHAT_NUMBER_PEPPER;
  if (!token || !pepper) {
    logger.error('telegram agent: TELEGRAM_BOT_TOKEN and CHAT_NUMBER_PEPPER are both required; the agent stays off');
    return false;
  }
  // Telegram ids are hashed in their own namespace, so a Telegram id can never
  // collide with a WhatsApp number's key.
  const keyOf = (from: string) => createHash('sha256').update(`${pepper}:tg:${from.replace(/\D/g, '')}`).digest('hex');
  const webBase = (config.FRONTEND_BASE_URL ?? (ARC.testnet ? 'https://testnet.karwan.site' : 'https://karwan.site')).replace(/\/$/, '');
  const api = createTelegramApi({ token, fetch, maxFileBytes: MEDIA_MAX_BYTES });

  const send = async (to: string, m: OutMessage): Promise<{ sent: boolean }> => {
    const parts = toTelegram(m);
    if (!parts) return { sent: false };
    let sent = true;
    for (const part of parts) sent = (await api.sendMessage(chatIdOf(to), part)) && sent;
    return { sent };
  };

  const clientConfirm = clientConfirmations({
    // Telegram cannot message a number, so the number path is never used here.
    hash: () => '',
    numberHashOf: async (address) => (await findTelegramAccountByAddress(address))?.numberHash ?? null,
    addressOfNumberHash: async (h) => (await getTelegramAccount(h))?.address ?? null,
    sendTemplate: async () => {},
  });
  const botUsername = config.TELEGRAM_BOT_USERNAME;
  installVerificationServices({
    sendsToNumbers: false,
    confirmLink: (requestId) => (botUsername ? `https://t.me/${botUsername}?start=cw_${requestId}` : null),
    clientConfirm,
    cac: cacReview((address, text) => tellAccount(address, { kind: 'text', body: text }).then(() => undefined)),
  });

  const intake = createEvidenceIntake({
    now: Date.now,
    channel: 'telegram',
    download: async (fileId, mimeType) => {
      const bytes = await api.download(fileId);
      return bytes && mimeType ? { bytes, mimeType } : null;
    },
    extract: extractInvoice,
    displayNameOf: async (address) => (await getProfile(address))?.displayName ?? '',
    claimFingerprint: (fp, address) => claimUnique('fp', fp, address),
    addFact: addVerifiedFact,
  });

  const identity = createIdentity<TelegramAccount>({
    now: Date.now,
    keyOf,
    blank: (numberHash, to) => ({ numberHash, to, address: null, termsVersion: null, termsAt: null, lastInboundAt: null }),
    emailOf: telegramAccountEmail,
    getAccount: getTelegramAccount,
    saveAccount: saveTelegramAccount,
    provisionIdentity: (refHash) => provisionUserIdentityWallet(refHash, 'chat'),
    createUser: (u) => {
      createUser(u);
    },
    activate: async (address) => {
      const r = await callAsAccount(address, 'POST', '/api/activation/activate', { address });
      if (r.status !== 200) throw new Error(`activation answered ${r.status}`);
    },
  });

  // A new chat account is paired with its chat for notifications, so the
  // existing Telegram notifier serves it in the person's language and no
  // second notifier is needed.
  const acceptTerms = async (numberHash: string) => {
    const account = await identity.acceptTerms(numberHash);
    if (account.address) await saveTelegramLink({ address: account.address, chatId: chatIdOf(account.to), linkedAt: Date.now() });
    return account;
  };

  const dispatch = createDispatcher<TelegramAccount>({
    now: Date.now,
    webBase,
    explorerTx: (hash) => `${ARC.explorer.replace(/\/$/, '')}/tx/${hash}`,
    getOrStart: identity.getOrStart,
    acceptTerms,
    saveAccount: saveTelegramAccount,
    send,
    drain: async () => {},
    chat: async (address, messages) => {
      const r = await callAsAccount(address, 'POST', '/api/assistant/chat', { messages });
      if (r.status === 200) {
        return { ok: true, reply: String(r.json.reply ?? ''), actions: r.json.actions as AssistantAction[] | undefined };
      }
      return { ok: false, error: String(r.json.error ?? 'assistant-unavailable'), code: r.json.code as string | undefined };
    },
    executeConfirm: createExecutor({ call: callAsAccount }),
    clientAnswer: async (requestId, from, yes) => {
      const account = await getTelegramAccount(keyOf(from));
      const address = account?.address ?? (await findAddressByChatId(chatIdOf(from)));
      if (!address) {
        return 'To answer, send me any message to set up your Karwan account, then tap Yes or No again.';
      }
      const fact = await clientConfirm.answerAsAccount(requestId, { address, channelHash: account?.numberHash ?? keyOf(from) }, yes);
      if (fact) {
        return fact.independent
          ? 'Thank you. Your confirmation is on their record.'
          : 'Thank you. It is saved, and it counts on their record once you pass the person check.';
      }
      return yes ? 'Thank you. This request was already answered or has closed.' : 'Thank you for answering. Nothing was added to their record.';
    },
    media: (account, m) => (account.address ? intake(account.address, m) : Promise.resolve([])),
  });

  setTelegramAgentHandler(
    createTelegramHandler({
      now: Date.now,
      claim: markTelegramUpdateProcessed,
      answerCallback: api.answerCallback,
      linkedAddress: findAddressByChatId,
      getOrStart: identity.getOrStart,
      save: saveTelegramAccount,
      dispatch,
      question: clientConfirm.questionFor,
      send,
    }),
  );

  installChannelPorts('telegram', {
    toAddress: async (address, m) => {
      const account = await findTelegramAccountByAddress(address);
      return account ? (await send(account.to, m)).sent : false;
    },
    // A linked web account signs in on the web; links are for accounts
    // Karwan holds the keys of.
    openLink: async (address, path) => {
      const account = await findTelegramAccountByAddress(address);
      if (!account || account.linkedWebAccount) return null;
      const linkToken = await chatOpenLinks.mint(address, path);
      return linkToken ? chatOpenUrl(linkToken) : null;
    },
  });

  logger.info('telegram agent: started');
  return true;
}
