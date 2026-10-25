import { tool } from 'ai';
import { z } from 'zod';
import { logger } from '../logger.js';
import { hasEquivalentConfirm, type AssistantAction, type ConfirmAction } from './actions.js';
import {
  buildAddResearchCreditConfirm,
  buildChangeSettingsConfirm,
  buildCreateBusinessConfirm,
  buildEditCompanyCardConfirm,
  buildEditProfileConfirm,
  buildJoinNewsletterConfirm,
  buildRemoveEmailConfirm,
  buildRemovePublishedDealsConfirm,
  buildRemoveTradeLineConfirm,
  buildRenameAgentsConfirm,
  buildRenameBusinessConfirm,
  buildSaveTradeLineConfirm,
  buildSendFeedbackConfirm,
  buildSetMemoryConfirm,
  buildSetOutsideReadsConfirm,
  buildSetUpAgentsConfirm,
  buildSetXHandleConfirm,
  buildUnlinkTelegramConfirm,
} from './accountActions.js';

/// Account tools (view 31 phase E). Each reads the current state first and
/// only prepares a card; the route behind it checks again on confirm.

type Call = (address: string, method: 'GET' | 'POST', path: string, body?: unknown) => Promise<{ status: number; json: Record<string, unknown> }>;

export type StoredProfile = Record<string, unknown> & {
  address: string;
  role: string;
  displayName: string;
  accountKind?: 'person' | 'business';
  email?: string;
  emailVerified?: boolean;
  xHandle?: string;
  seller?: { skills: string[]; bio: string } & Record<string, unknown>;
};

export interface AccountToolDeps {
  call: Call;
  profile: (address: string) => Promise<StoredProfile | null>;
  /// The email the account signs in with, when it signs in by email.
  loginEmail: (address: string) => string | null;
  agentsActive: (address: string) => Promise<boolean>;
  publishedDeals: (address: string) => Promise<number>;
  businessOpen: boolean;
}

interface WorkspaceRow { id: string; kind: string; name: string }
interface TradeLine { id: string; tradeType: 'goods' | 'services'; title: string; description?: string; region?: string; unit?: string; active: boolean }

function offer(actions: AssistantAction[], built: ConfirmAction | { error: string }) {
  if ('error' in built) return built;
  if (!hasEquivalentConfirm(actions, built)) actions.push(built);
  return { ok: true, shown: built.title };
}

async function guarded<T>(name: string, run: () => Promise<T>): Promise<T | { error: string }> {
  try {
    return await run();
  } catch (err) {
    logger.warn({ err: (err as Error).message }, `assistant ${name} failed`);
    return { error: 'Could not prepare that right now. Try again shortly.' };
  }
}

export function accountTools(address: string, actions: AssistantAction[], deps: AccountToolDeps) {
  const me = address.toLowerCase();
  const business = async (): Promise<WorkspaceRow | null> => {
    const r = await deps.call(me, 'GET', '/api/workspaces');
    const rows = r.status === 200 && Array.isArray(r.json.workspaces) ? (r.json.workspaces as WorkspaceRow[]) : [];
    return rows.find((w) => w.kind === 'business') ?? null;
  };
  const tradeLines = async (workspaceId: string): Promise<TradeLine[]> => {
    const r = await deps.call(me, 'GET', `/api/workspaces/${encodeURIComponent(workspaceId)}/availability`);
    return r.status === 200 && Array.isArray(r.json.availability) ? (r.json.availability as TradeLine[]) : [];
  };

  return {
    propose_change_settings: tool({
      description:
        "Prepare a card to change account settings: language (en, ar, fr, hi, sw), theme, sounds, alerts on or off, the public passport, publishing settled deals, showing deal history on the passport, and how Karwan reaches them (telegram, email or both). Pass only what changes.",
      inputSchema: z.object({
        locale: z.enum(['en', 'ar', 'fr', 'hi', 'sw']).optional(),
        theme: z.enum(['light', 'dark', 'system']).optional(),
        soundEnabled: z.boolean().optional(),
        alertsOn: z.boolean().optional().describe('false mutes alerts.'),
        publicPassport: z.boolean().optional(),
        publishDeals: z.boolean().optional(),
        publishHistory: z.boolean().optional(),
        notifyVia: z.enum(['telegram', 'email', 'both']).optional(),
      }),
      execute: async ({ alertsOn, ...rest }) =>
        guarded('propose_change_settings', async () => {
          const settings = Object.fromEntries(Object.entries({ ...rest, ...(alertsOn !== undefined ? { notificationsMuted: !alertsOn } : {}) }).filter(([, v]) => v !== undefined));
          const [profile, tg] = await Promise.all([deps.profile(me), deps.call(me, 'GET', `/api/telegram/status?address=${me}`)]);
          return offer(actions, buildChangeSettingsConfirm({ address: me, settings, hasTelegram: tg.json.linked === true, hasEmail: !!(profile?.email && profile.emailVerified) }));
        }),
    }),

    propose_edit_profile: tool({
      description: "Prepare a card to change the person's profile: their display name, their seller bio, or their skills (the full new list). Pass only what changes.",
      inputSchema: z.object({
        displayName: z.string().max(40).optional(),
        bio: z.string().max(400).optional(),
        skills: z.array(z.string().min(1).max(60)).max(20).optional(),
      }),
      execute: async ({ displayName, bio, skills }) =>
        guarded('propose_edit_profile', async () => {
          const profile = await deps.profile(me);
          if (!profile) return { error: 'They have no profile yet. Offer to finish setting it up on the profile page.' };
          return offer(actions, buildEditProfileConfirm({ profile, ...(displayName !== undefined ? { displayName } : {}), ...(bio !== undefined ? { bio } : {}), ...(skills ? { skills } : {}) }));
        }),
    }),

    propose_x_handle: tool({
      description: "Prepare a card to show an X handle on the profile, or remove it (handle null). Connecting X on the profile page proves the handle is theirs; this only shows it.",
      inputSchema: z.object({ handle: z.string().max(16).nullable() }),
      execute: async ({ handle }) =>
        guarded('propose_x_handle', async () => {
          const profile = await deps.profile(me);
          if (!profile) return { error: 'They have no profile yet.' };
          return offer(actions, buildSetXHandleConfirm({ address: me, handle, ...(profile.xHandle ? { current: profile.xHandle } : {}) }));
        }),
    }),

    propose_remove_email: tool({
      description: "Prepare a card to remove the contact email from the profile. Adding an email needs a code sent to it, entered on the profile page; never ask for a code in the chat.",
      inputSchema: z.object({}),
      execute: async () =>
        guarded('propose_remove_email', async () => {
          const profile = await deps.profile(me);
          const login = deps.loginEmail(me);
          return offer(actions, buildRemoveEmailConfirm({ address: me, ...(profile?.email ? { email: profile.email } : {}), loginEmail: !!login && login.toLowerCase() === profile?.email?.toLowerCase() }));
        }),
    }),

    propose_join_newsletter: tool({
      description: "Prepare a card to sign the person's verified email up for Karwan news by email.",
      inputSchema: z.object({}),
      execute: async () =>
        guarded('propose_join_newsletter', async () => {
          const profile = await deps.profile(me);
          return offer(actions, buildJoinNewsletterConfirm(profile?.email && profile.emailVerified ? { email: profile.email } : {}));
        }),
    }),

    propose_unlink_telegram: tool({
      description: 'Prepare a card to unlink Telegram from the account. Linking it opens the bot from the account page.',
      inputSchema: z.object({}),
      execute: async () =>
        guarded('propose_unlink_telegram', async () => {
          const r = await deps.call(me, 'GET', `/api/telegram/status?address=${me}`);
          return offer(actions, buildUnlinkTelegramConfirm({ address: me, linked: r.json.linked === true, username: typeof r.json.username === 'string' ? r.json.username : null }));
        }),
    }),

    propose_memory_switch: tool({
      description: "Prepare a card to turn the assistant's memory on or off. Forgetting notes already kept is forget_memory.",
      inputSchema: z.object({ on: z.boolean() }),
      execute: async ({ on }) =>
        guarded('propose_memory_switch', async () => {
          const r = await deps.call(me, 'GET', '/api/assistant/memory');
          return offer(actions, buildSetMemoryConfirm({ on, now: r.json.enabled === true }));
        }),
    }),

    propose_remove_published_deals: tool({
      description: "Prepare a card to withdraw every settled deal published under the person's name (attested deals). Their record on Karwan stays. To stop publishing future deals, use propose_change_settings with publishDeals false.",
      inputSchema: z.object({}),
      execute: async () =>
        guarded('propose_remove_published_deals', async () => offer(actions, buildRemovePublishedDealsConfirm({ publishedCount: await deps.publishedDeals(me) }))),
    }),

    propose_outside_record_reads: tool({
      description: "Prepare a card to let agents outside Karwan check the person's record when they ask, or stop them. Agents on requests they post on Karwan can always check it.",
      inputSchema: z.object({ on: z.boolean() }),
      execute: async ({ on }) =>
        guarded('propose_outside_record_reads', async () => {
          const r = await deps.call(me, 'GET', `/api/me/reputation-sources?address=${me}`);
          const now = (r.json.sources as { outsideReadable?: boolean } | undefined)?.outsideReadable === true;
          return offer(actions, buildSetOutsideReadsConfirm({ address: me, on, now }));
        }),
    }),

    propose_send_feedback: tool({
      description: "Prepare a card to send the person's feedback to the Karwan team: a bug, an idea, praise or other, with a short title and the message in their words.",
      inputSchema: z.object({
        category: z.enum(['bug', 'improvement', 'other', 'praise']),
        title: z.string().max(140),
        message: z.string().max(4000),
      }),
      execute: async ({ category, title, message }) => guarded('propose_send_feedback', async () => offer(actions, buildSendFeedbackConfirm({ category, title, message }))),
    }),

    propose_set_up_agents: tool({
      description: 'Prepare a card to set up the buying and selling agents of an account that has none yet, with optional names.',
      inputSchema: z.object({ buyerName: z.string().max(40).optional(), sellerName: z.string().max(40).optional() }),
      execute: async ({ buyerName, sellerName }) =>
        guarded('propose_set_up_agents', async () =>
          offer(actions, buildSetUpAgentsConfirm({ address: me, active: await deps.agentsActive(me), ...(buyerName ? { buyerName } : {}), ...(sellerName ? { sellerName } : {}) }))),
    }),

    propose_rename_agents: tool({
      description: 'Prepare a card to rename the buying agent, the selling agent or both.',
      inputSchema: z.object({ buyerName: z.string().max(40).optional(), sellerName: z.string().max(40).optional() }),
      execute: async ({ buyerName, sellerName }) =>
        guarded('propose_rename_agents', async () =>
          offer(actions, buildRenameAgentsConfirm({ address: me, active: await deps.agentsActive(me), ...(buyerName ? { buyerName } : {}), ...(sellerName ? { sellerName } : {}) }))),
    }),

    propose_add_research_credit: tool({
      description: 'Testnet. Prepare a card to add research credit, which agents spend on paid market research after the free reports of the day. The fixed amount comes from the buying agent.',
      inputSchema: z.object({}),
      execute: async () =>
        guarded('propose_add_research_credit', async () => {
          const r = await deps.call(me, 'GET', '/api/research/status');
          return offer(actions, buildAddResearchCreditConfirm({ active: r.json.active === true, priceUsdc: Number(r.json.priceUsdc ?? 0), creditUsdc: Number(r.json.creditUsdc ?? 0) }));
        }),
    }),

    propose_add_business: tool({
      description: "Prepare a card to add a business workspace beside the person's personal one, under a business name. Registering the business with documents is a separate step on the business page.",
      inputSchema: z.object({ name: z.string().max(120) }),
      execute: async ({ name }) =>
        guarded('propose_add_business', async () => offer(actions, buildCreateBusinessConfirm({ name, hasBusiness: !!(await business()), open: deps.businessOpen }))),
    }),

    propose_rename_business: tool({
      description: 'Prepare a card to rename the business workspace.',
      inputSchema: z.object({ name: z.string().max(120) }),
      execute: async ({ name }) =>
        guarded('propose_rename_business', async () => {
          const ws = await business();
          if (!ws) return { error: 'They have no business workspace yet. Offer propose_add_business.' };
          return offer(actions, buildRenameBusinessConfirm({ workspaceId: ws.id, current: ws.name, name }));
        }),
    }),

    list_what_my_business_trades: tool({
      description: "List what the person's business offers to trade (goods or services), as their company card shows it. Use before changing or removing one.",
      inputSchema: z.object({}),
      execute: async () =>
        guarded('list_what_my_business_trades', async () => {
          const ws = await business();
          if (!ws) return { error: 'They have no business workspace yet.' };
          const lines = await tradeLines(ws.id);
          return { lines: lines.map((l) => ({ lineId: l.id, kind: l.tradeType, title: l.title, shown: l.active, ...(l.region ? { region: l.region } : {}) })), note: 'Never show lineId.' };
        }),
    }),

    propose_save_trade_line: tool({
      description: "Prepare a card to add, or change (pass lineId), one thing the person's business trades: goods or services, a title, and optional details, region and unit it is sold by. 'shown' false hides it.",
      inputSchema: z.object({
        lineId: z.string().max(120).optional(),
        kind: z.enum(['goods', 'services']),
        title: z.string().max(140),
        details: z.string().max(500).optional(),
        region: z.string().max(120).optional(),
        unit: z.string().max(80).optional(),
        shown: z.boolean().optional(),
      }),
      execute: async ({ lineId, kind, title, details, region, unit, shown }) =>
        guarded('propose_save_trade_line', async () => {
          const ws = await business();
          if (!ws) return { error: 'They have no business workspace yet. Offer propose_add_business.' };
          if (lineId && !(await tradeLines(ws.id)).some((l) => l.id === lineId)) return { error: 'That is not one of their trade lines. Call list_what_my_business_trades.' };
          return offer(actions, buildSaveTradeLineConfirm({
            workspaceId: ws.id,
            ...(lineId ? { id: lineId } : {}),
            tradeType: kind,
            title,
            ...(details ? { description: details } : {}),
            ...(region ? { region } : {}),
            ...(unit ? { unit } : {}),
            ...(shown !== undefined ? { active: shown } : {}),
          }));
        }),
    }),

    propose_remove_trade_line: tool({
      description: 'Prepare a card to remove one thing the business trades. Call list_what_my_business_trades first for the lineId.',
      inputSchema: z.object({ lineId: z.string().min(1).max(120) }),
      execute: async ({ lineId }) =>
        guarded('propose_remove_trade_line', async () => {
          const ws = await business();
          if (!ws) return { error: 'They have no business workspace yet.' };
          const line = (await tradeLines(ws.id)).find((l) => l.id === lineId);
          if (!line) return { error: 'That is not one of their trade lines. Call list_what_my_business_trades.' };
          return offer(actions, buildRemoveTradeLineConfirm({ workspaceId: ws.id, availabilityId: lineId, title: line.title }));
        }),
    }),

    propose_edit_company_card: tool({
      description:
        "Prepare a card to change a business account's company card, which businesses looking for a partner see: region, website, main markets, smallest order, lead time in days, and whether it is shown to them. The legal name and registration stay on the business page.",
      inputSchema: z.object({
        region: z.string().max(80).optional(),
        websiteUrl: z.string().max(200).optional(),
        primaryMarkets: z.string().max(200).optional(),
        minOrderValue: z.string().max(80).optional(),
        leadTimeDays: z.number().int().min(0).max(365).optional(),
        shownToPartners: z.boolean().optional(),
      }),
      execute: async ({ shownToPartners, ...rest }) =>
        guarded('propose_edit_company_card', async () => {
          const profile = await deps.profile(me);
          const patch = Object.fromEntries(Object.entries({ ...rest, ...(shownToPartners !== undefined ? { hideFromDiscovery: !shownToPartners } : {}) }).filter(([, v]) => v !== undefined));
          return offer(actions, buildEditCompanyCardConfirm({ address: me, isBusiness: profile?.accountKind === 'business', patch }));
        }),
    }),
  };
}
