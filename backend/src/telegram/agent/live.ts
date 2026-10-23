import { createHash } from 'node:crypto';
import type { AssistantAction } from '../../assistant/actions.js';
import { ARC } from '../../chain/client.js';
import { READABLE_ASK, createDispatcher } from '../../channels/dispatch.js';
import { createInterview } from '../../channels/interview.js';
import { createExecutor } from '../../channels/executor.js';
import { createEmailAccounts } from '../../channels/emailAccounts.js';
import { createIdentity } from '../../channels/identity.js';
import { createOnboarding } from '../../channels/onboarding.js';
import { createTagStep } from '../../channels/tagStep.js';
import { checkKarwanTag } from '../../profile/karwanTag.js';
import { MONEY_INTENTS, createMoneyStepPresenter } from '../../channels/moneySteps.js';
import { callAsAccount } from '../../channels/inProcess.js';
import { extractInvoice, MEDIA_MAX_BYTES } from '../../channels/invoiceExtract.js';
import { createEvidenceIntake } from '../../channels/media.js';
import { chatOpenLinks, chatOpenUrl } from '../../channels/openLinksLive.js';
import { openLinkAllowed } from '../../channels/openLink.js';
import type { OutMessage } from '../../channels/render.js';
import { installChannelPorts, tellAccount } from '../../channels/sender.js';
import { provisionUserIdentityWallet } from '../../circle/wallets.js';
import { config } from '../../config.js';
import { claimUnique } from '../../db/evidence.js';
import { getProfile, tagAvailableFor, updateProfile } from '../../db/profiles.js';
import {
  claimTelegramUsername,
  findTelegramAccountByAddress,
  getTelegramAccount,
  markTelegramUpdateProcessed,
  saveTelegramAccount,
  type TelegramAccount,
} from '../../db/telegramAccounts.js';
import { findAddressByChatId, getTelegramLink, saveTelegramLink } from '../../db/telegramLinks.js';
import { changeUserEmail, createUser, getUserByAddress, getUserByEmail } from '../../db/users.js';
import { getModularAccountByEmail } from '../../db/modularAccounts.js';
import { isInvited, joinWaitlist } from '../../db/waitlist.js';
import { emailCodes, emailHash } from '../../routes/auth.js';
import { isChatAccountEmail, telegramAccountEmail } from '../../emails/chatRecipients.js';
import { logger } from '../../logger.js';
import { addVerifiedFact, cacReview, clientConfirmations } from '../../verification/live.js';
import { installVerificationServices } from '../../verification/services.js';
import { setTelegramAgentHandler } from '../bot.js';
import { createTelegramApi } from './api.js';
import { createTelegramHandler } from './handler.js';
import { toTelegram } from './render.js';
import { accountDeletion } from '../../accountDeletion/live.js';
import { moneyOutChat } from '../../moneyOut/live.js';
import { applySourcesUpdate, sourcesOf } from '../../reputation/consent.js';

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

  const activate = async (address: string) => {
    const r = await callAsAccount(address, 'POST', '/api/activation/activate', { address });
    if (r.status !== 200) throw new Error(`activation answered ${r.status}`);
  };

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
    activate: (address) => activate(address),
  });

  // A new chat account is paired with its chat for notifications, so the
  // existing Telegram notifier serves it in the person's language and no
  // second notifier is needed.
  const acceptTerms = async (numberHash: string) => {
    const account = await identity.acceptTerms(numberHash);
    if (account.address) await saveTelegramLink({ address: account.address, chatId: chatIdOf(account.to), linkedAt: Date.now() });
    return account;
  };

  const emailAccounts = createEmailAccounts<TelegramAccount>({
    now: Date.now,
    network: ARC.testnet ? 'testnet' : 'mainnet',
    getUserByEmail,
    getUserByAddress,
    isInvited,
    joinWaitlist: async (email) => {
      await joinWaitlist(email, 'en');
    },
    refHash: emailHash,
    provisionIdentity: (refHash) => provisionUserIdentityWallet(refHash, 'chat'),
    createUser: (u) => {
      createUser(u);
    },
    changeUserEmail: (address, email) => {
      changeUserEmail(address, email);
    },
    isPlaceholder: isChatAccountEmail,
    activate,
    link: async (address, account) => {
      await saveTelegramLink({ address, chatId: chatIdOf(account.to), username: account.tgUsername ?? undefined, linkedAt: Date.now() });
    },
    chatOf: async (address) => (await findTelegramAccountByAddress(address))?.numberHash ?? null,
    passkeyAccount: async (email) => !!(await getModularAccountByEmail(email)),
  });

  const executeConfirm = createExecutor({ call: callAsAccount, refuse: MONEY_INTENTS });
  // The website's setup route reads and saves the answers, so chat and /setup
  // set up the same account.
  const interview = createInterview<TelegramAccount>({
    afterwards: [READABLE_ASK],
    preview: async (address, answers) => {
      const r = await callAsAccount(address, 'POST', '/api/setup/preview', { answers });
      if (r.status !== 200) throw new Error(`setup preview ${r.status}`);
      return { lines: (r.json.lines as string[]) ?? [], needs: (r.json.needs as Array<'price'>) ?? [] };
    },
    save: async (address, card) => {
      const r = await executeConfirm({ address }, card);
      return r.ok ? { ok: true } : { ok: false, message: r.message };
    },
  });

  const tagStep = createTagStep<TelegramAccount>({
    check: checkKarwanTag,
    available: tagAvailableFor,
    // The website's own sign-up route; an account that already has a profile
    // (made before tags) adds its tag through the tag route instead.
    signup: async (address, tag) => {
      let r = await callAsAccount(address, 'POST', '/api/signup', { tag, accountKind: 'person' });
      if (r.status === 409 && r.json.code === 'account_exists') r = await callAsAccount(address, 'POST', '/api/signup/tag', { tag });
      if (r.status === 200 || r.status === 201) return { ok: true };
      return { ok: false, code: String(r.json.code ?? r.status) };
    },
    afterTag: (account) => interview.enter(account),
  });

  const onboarding = createOnboarding<TelegramAccount>({
    webBase,
    sendCode: async (email) => !(await emailCodes.request(email)).limited,
    checkCode: emailCodes.verify,
    emailAccounts,
    tagOf: async (address) => (await getProfile(address))?.handle ?? null,
    placeholderEmail: async (address) => isChatAccountEmail(getUserByAddress(address)?.email ?? ''),
    enterTag: tagStep.enter,
    later: async (account, m) => (await tagStep.handle(account, m)) ?? interview.handle(account, m),
    deleteMessage: async (m) => {
      if (m.messageRef) await api.deleteMessage(chatIdOf(m.from), Number(m.messageRef));
    },
  });

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
    executeConfirm,
    // One-time links follow openLinkAllowed: a browser wallet account signs in on the page.
    presentConfirm: createMoneyStepPresenter({
      webBase,
      openLink: async (address, path) => {
        const account = await findTelegramAccountByAddress(address);
        const token = openLinkAllowed(account, getUserByAddress(address)) ? await chatOpenLinks.mint(address, path) : null;
        return token ? chatOpenUrl(token) : null;
      },
    }),
    moneyOut: moneyOutChat,
    deletion: accountDeletion,
    onboarding,
    findable: {
      kind: 'buttons',
      body: 'Can people find you here by your Telegram name, to check your Karwan record before they deal with you?',
      buttons: [
        { id: 'rc:findable:yes', title: 'Yes' },
        { id: 'rc:findable:no', title: 'Not now' },
      ],
    },
    consent: async (address, patch) => {
      const saved = await updateProfile(address, (current) => ({
        ...current,
        reputationSources: applySourcesUpdate(sourcesOf(current), patch, Date.now()),
      }));
      if (!saved) throw new Error('no profile to save consent on');
    },
    // A recycled number logs into the old Telegram account unless it has a password.
    joinedTip:
      'One more thing: turn on Two-Step Verification in Telegram (Settings, Privacy and Security). Then nobody who later gets your phone number can open this chat.',
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

  // The alert link row carries the username too, so it never goes stale.
  const saveWithLinkUsername = async (account: TelegramAccount) => {
    const saved = await saveTelegramAccount(account);
    if (saved.address) {
      const link = await getTelegramLink(saved.address);
      const username = saved.tgUsername ?? undefined;
      if (link && link.username !== username) await saveTelegramLink({ ...link, username });
    }
    return saved;
  };

  setTelegramAgentHandler(
    createTelegramHandler({
      now: Date.now,
      claim: markTelegramUpdateProcessed,
      answerCallback: api.answerCallback,
      linkedAddress: findAddressByChatId,
      getOrStart: identity.getOrStart,
      save: saveWithLinkUsername,
      dispatch,
      question: clientConfirm.questionFor,
      send,
      claimUsername: claimTelegramUsername,
    }),
  );

  installChannelPorts('telegram', {
    toAddress: async (address, m) => {
      const account = await findTelegramAccountByAddress(address);
      return account ? (await send(account.to, m)).sent : false;
    },
    // One-time links follow openLinkAllowed: a browser wallet account signs in on the page.
    openLink: async (address, path) => {
      const account = await findTelegramAccountByAddress(address);
      if (!openLinkAllowed(account, getUserByAddress(address))) return null;
      const linkToken = await chatOpenLinks.mint(address, path);
      return linkToken ? chatOpenUrl(linkToken) : null;
    },
  });

  logger.info('telegram agent: started');
  return true;
}
