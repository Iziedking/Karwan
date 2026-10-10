import { randomBytes } from 'node:crypto';
import { generateObject } from 'ai';
import { z } from 'zod';
import type { AssistantAction } from '../assistant/actions.js';
import { ARC } from '../chain/client.js';
import { provisionUserIdentityWallet } from '../circle/wallets.js';
import { config } from '../config.js';
import { claimUnique } from '../db/evidence.js';
import { durableEphemeralMap } from '../db/ephemeral.js';
import { getProfile } from '../db/profiles.js';
import { createUser } from '../db/users.js';
import {
  claimDailySlot,
  findWhatsappAccountByAddress,
  findWhatsappAccountByNullifier,
  getWhatsappAccount,
  saveWhatsappAccount,
} from '../db/whatsapp.js';
import { assistantAgentModel } from '../llm/client.js';
import { logger } from '../logger.js';
import { setInboundHandler, setOpenRedeemer } from '../routes/whatsapp.js';
import type { ExtractedInvoice } from '../verification/invoice.js';
import { addVerifiedFact, cacReview, clientConfirmations, levelOf } from '../verification/live.js';
import { chatDealGate } from '../deals/chatDealGate.js';
import { installVerificationServices } from '../verification/services.js';
import { createDispatcher } from './dispatch.js';
import { createExecutor } from './executor.js';
import { createIdentity, hashNumber } from './identity.js';
import { callAsAccount } from './inProcess.js';
import { createEvidenceIntake } from './media.js';
import { createOpenLinks, type OpenablePath } from './openLink.js';
import { createOutbox } from './outbox.js';
import type { OutMessage } from './render.js';
import { installChatPorts } from './sender.js';
import { createWhatsappNotifier } from './notifier.js';
import { RELEVANT, recipientsFor, summaryFor } from '../telegram/notifier.js';
import { bus } from '../events.js';

const MEDIA_MAX_BYTES = 10 * 1024 * 1024;

const invoiceSchema = z.object({
  issuer: z.string().optional(),
  counterparty: z.string().optional(),
  amount: z.number().optional(),
  currency: z.string().optional(),
  date: z.string().optional().describe('YYYY-MM-DD'),
  number: z.string().optional(),
});

/// Wires the WhatsApp agent to the real store, Graph API and assistant. Runs
/// at startup only when WHATSAPP_ENABLED is on and the pepper is set.
export function startWhatsappAgent(): void {
  if (!config.WHATSAPP_ENABLED) return;
  const pepper = config.CHAT_NUMBER_PEPPER;
  if (!pepper) {
    logger.error('whatsapp: CHAT_NUMBER_PEPPER is not set; the agent stays off');
    return;
  }
  const keyOf = (to: string) => hashNumber(to, pepper);
  const webBase = (config.FRONTEND_BASE_URL ?? (ARC.testnet ? 'https://testnet.karwan.site' : 'https://karwan.site')).replace(/\/$/, '');
  const graph = `https://graph.facebook.com/${config.WHATSAPP_GRAPH_VERSION}`;

  const outbox = createOutbox({
    token: config.WHATSAPP_TOKEN,
    phoneNumberId: config.WHATSAPP_PHONE_NUMBER_ID,
    graphVersion: config.WHATSAPP_GRAPH_VERSION,
    now: Date.now,
    fetch,
    lastInboundAt: async (to) => (await getWhatsappAccount(keyOf(to)))?.lastInboundAt ?? null,
    claimDailySlot: (to, day) => claimDailySlot(keyOf(to), day),
    enqueue: async (to, m) => {
      const a = await getWhatsappAccount(keyOf(to));
      if (a) await saveWhatsappAccount({ ...a, queue: [...a.queue, m] });
    },
    takeQueue: async (to) => {
      const a = await getWhatsappAccount(keyOf(to));
      if (!a || a.queue.length === 0) return [];
      await saveWhatsappAccount({ ...a, queue: [] });
      return a.queue;
    },
  });

  const pendingLinks = durableEphemeralMap<{ address: string; path: OpenablePath; expiresAt: number }>('wa-open');
  const links = createOpenLinks({
    now: Date.now,
    newToken: () => randomBytes(24).toString('base64url'),
    put: async (k, v) => {
      pendingLinks.set(k, v);
    },
    take: async (k) => {
      const v = pendingLinks.get(k) ?? null;
      pendingLinks.delete(k);
      return v;
    },
  });
  setOpenRedeemer(links.redeem);

  const sendToAddress = async (address: string, m: OutMessage) => {
    const a = await findWhatsappAccountByAddress(address);
    return a ? (await outbox.send(a.to, m)).sent : false;
  };
  const apiBase = config.PUBLIC_API_BASE_URL?.replace(/\/$/, '');
  installChatPorts({
    toAddress: sendToAddress,
    toNumber: async (to, m) => (await outbox.send(to.replace(/\D/g, ''), m)).sent,
    openLink: async (address, path) => {
      if (!apiBase || !(await findWhatsappAccountByAddress(address))) return null;
      const token = await links.mint(address, path);
      return token ? `${apiBase}/api/whatsapp/open?t=${token}` : null;
    },
  });

  createWhatsappNotifier({
    subscribe: (h) => bus.subscribe(h),
    relevant: RELEVANT,
    recipients: recipientsFor,
    summary: (e, role) => summaryFor(e, role, 'en'),
    muted: async (address) => !!(await getProfile(address))?.settings?.notificationsMuted,
    tell: sendToAddress,
  });

  const clientConfirm = clientConfirmations({
    hash: keyOf,
    numberHashOf: async (address) => (await findWhatsappAccountByAddress(address))?.numberHash ?? null,
    addressOfNumberHash: async (h) => (await getWhatsappAccount(h))?.address ?? null,
    sendTemplate: async (to, params, buttonIds) => {
      await outbox.send(to, { kind: 'template', name: 'confirm_work', params, buttonIds });
    },
  });
  installVerificationServices({
    clientConfirm,
    cac: cacReview((address, text) => sendToAddress(address, { kind: 'text', body: text }).then(() => undefined)),
  });

  const intake = createEvidenceIntake({
    now: Date.now,
    download: async (mediaId) => {
      if (!config.WHATSAPP_TOKEN) return null;
      const auth = { Authorization: `Bearer ${config.WHATSAPP_TOKEN}` };
      try {
        const meta = (await (await fetch(`${graph}/${mediaId}`, { headers: auth })).json()) as {
          url?: string;
          mime_type?: string;
          file_size?: number;
        };
        if (!meta.url || !meta.mime_type || (meta.file_size ?? 0) > MEDIA_MAX_BYTES) return null;
        const res = await fetch(meta.url, { headers: auth });
        if (!res.ok) return null;
        const bytes = new Uint8Array(await res.arrayBuffer());
        return bytes.byteLength > MEDIA_MAX_BYTES ? null : { bytes, mimeType: meta.mime_type };
      } catch (err) {
        logger.warn({ err: (err as Error).message }, 'whatsapp: media download failed');
        return null;
      }
    },
    extract: async (bytes, mimeType) => {
      if (!assistantAgentModel) throw new Error('no direct model configured');
      const file =
        mimeType === 'application/pdf'
          ? { type: 'file' as const, data: bytes, mediaType: mimeType }
          : { type: 'image' as const, image: bytes, mediaType: mimeType };
      const { object } = await generateObject({
        model: assistantAgentModel,
        schema: invoiceSchema,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text:
                  'Read this invoice or receipt. Return who issued it, who it was issued to, the total amount as a number, ' +
                  'the currency code, the invoice date as YYYY-MM-DD and the invoice number. Leave out any field that is not printed. Do not guess.',
              },
              file,
            ],
          },
        ],
      });
      return object as ExtractedInvoice;
    },
    displayNameOf: async (address) => (await getProfile(address))?.displayName ?? '',
    claimFingerprint: (fp, address) => claimUnique('fp', fp, address),
    addFact: addVerifiedFact,
  });

  const identity = createIdentity({
    pepper,
    now: Date.now,
    getAccount: getWhatsappAccount,
    saveAccount: saveWhatsappAccount,
    findByNullifier: findWhatsappAccountByNullifier,
    provisionIdentity: (refHash) => provisionUserIdentityWallet(refHash, 'chat'),
    createUser: (u) => {
      createUser(u);
    },
    activate: async (address) => {
      const r = await callAsAccount(address, 'POST', '/api/activation/activate', { address });
      if (r.status !== 200) throw new Error(`activation answered ${r.status}`);
    },
  });

  const dispatch = createDispatcher({
    now: Date.now,
    webBase,
    explorerTx: (hash) => `${ARC.explorer.replace(/\/$/, '')}/tx/${hash}`,
    getOrStart: identity.getOrStart,
    acceptTerms: identity.acceptTerms,
    saveAccount: saveWhatsappAccount,
    send: outbox.send,
    drain: outbox.drain,
    chat: async (address, messages) => {
      const r = await callAsAccount(address, 'POST', '/api/assistant/chat', { messages });
      if (r.status === 200) {
        return { ok: true, reply: String(r.json.reply ?? ''), actions: r.json.actions as AssistantAction[] | undefined };
      }
      return { ok: false, error: String(r.json.error ?? 'assistant-unavailable'), code: r.json.code as string | undefined };
    },
    executeConfirm: createExecutor({
      call: callAsAccount,
      ...(config.VERIFIED_NETWORK_ONLY
        ? {
            fundingGate: async (account, deal) => {
              const [buyer, seller] = await Promise.all([levelOf(account.address), levelOf(deal.seller)]);
              const gate = chatDealGate({ amountUsdc: deal.amountUsdc, buyer, seller });
              return gate.ok ? { ok: true as const } : { ok: false as const, message: gate.message };
            },
          }
        : {}),
    }),
    clientAnswer: async (requestId, from, yes) => {
      const fact = await clientConfirm.answer(requestId, from, yes);
      if (fact) return 'Thank you. Your confirmation is on their record.';
      return yes ? 'Thank you. This request was already answered or has closed.' : 'Thank you for answering. Nothing was added to their record.';
    },
    media: (account, m) => (account.address ? intake(account.address, m) : Promise.resolve([])),
  });

  setInboundHandler(dispatch);
  logger.info('whatsapp: agent started');
}
