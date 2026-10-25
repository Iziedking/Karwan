import { confirmNonce, type ConfirmActionBase } from './actions.js';

/// Confirm cards for the account (view 31 phase E): profile, settings, links,
/// memory, published deals, outside reads, agents, research credit, feedback
/// and the business workspace. Each payload is the body the page sends.

export type SettingsPatch = {
  locale?: 'en' | 'ar' | 'fr' | 'hi' | 'sw';
  theme?: 'light' | 'dark' | 'system';
  soundEnabled?: boolean;
  notificationsMuted?: boolean;
  publicPassport?: boolean;
  publishDeals?: boolean;
  publishHistory?: boolean;
  notifyVia?: 'telegram' | 'email' | 'both';
};

export interface ChangeSettingsConfirm extends ConfirmActionBase {
  intent: 'change_settings';
  payload: { address: string; settings: SettingsPatch };
}
export interface EditProfileConfirm extends ConfirmActionBase {
  intent: 'edit_profile';
  /// The whole profile body the profile page saves, with the change applied.
  payload: Record<string, unknown> & { address: string; displayName: string };
}
export interface SetXHandleConfirm extends ConfirmActionBase {
  intent: 'set_x_handle';
  payload: { address: string; handle: string | null };
}
export interface RemoveEmailConfirm extends ConfirmActionBase {
  intent: 'remove_email';
  payload: { address: string };
}
export interface JoinNewsletterConfirm extends ConfirmActionBase {
  intent: 'join_newsletter';
  payload: { email: string };
}
export interface UnlinkTelegramConfirm extends ConfirmActionBase {
  intent: 'unlink_telegram';
  payload: { address: string };
}
export interface SetMemoryConfirm extends ConfirmActionBase {
  intent: 'set_memory';
  payload: { on: boolean };
}
export interface RemovePublishedDealsConfirm extends ConfirmActionBase {
  intent: 'remove_published_deals';
  payload: Record<string, never>;
}
export interface SetOutsideReadsConfirm extends ConfirmActionBase {
  intent: 'set_outside_reads';
  payload: { address: string; outsideReadable: boolean };
}
export interface SendFeedbackConfirm extends ConfirmActionBase {
  intent: 'send_feedback';
  payload: { category: 'bug' | 'improvement' | 'other' | 'praise'; title: string; message: string };
}
export interface SetUpAgentsConfirm extends ConfirmActionBase {
  intent: 'set_up_agents';
  payload: { address: string; buyerName?: string; sellerName?: string };
}
export interface RenameAgentsConfirm extends ConfirmActionBase {
  intent: 'rename_agents';
  payload: { address: string; buyerName?: string; sellerName?: string };
}
export interface AddResearchCreditConfirm extends ConfirmActionBase {
  intent: 'add_research_credit';
  payload: Record<string, never>;
}
export interface CreateBusinessConfirm extends ConfirmActionBase {
  intent: 'create_business';
  payload: { name: string };
}
export interface RenameBusinessConfirm extends ConfirmActionBase {
  intent: 'rename_business';
  payload: { workspaceId: string; name: string };
}
export interface SaveTradeLineConfirm extends ConfirmActionBase {
  intent: 'save_trade_line';
  payload: { workspaceId: string; tradeType: 'goods' | 'services'; title: string; description?: string; region?: string; unit?: string; active: boolean; id?: string };
}
export interface RemoveTradeLineConfirm extends ConfirmActionBase {
  intent: 'remove_trade_line';
  payload: { workspaceId: string; availabilityId: string };
}
export interface EditCompanyCardConfirm extends ConfirmActionBase {
  intent: 'edit_company_card';
  payload: { address: string; smeProfile: CompanyCardPatch };
}

export type CompanyCardPatch = {
  region?: string;
  websiteUrl?: string;
  primaryMarkets?: string;
  minOrderValue?: string;
  leadTimeDays?: number;
  hideFromDiscovery?: boolean;
};

export type AccountStepConfirm =
  | ChangeSettingsConfirm
  | EditProfileConfirm
  | SetXHandleConfirm
  | RemoveEmailConfirm
  | JoinNewsletterConfirm
  | UnlinkTelegramConfirm
  | SetMemoryConfirm
  | RemovePublishedDealsConfirm
  | SetOutsideReadsConfirm
  | SendFeedbackConfirm
  | SetUpAgentsConfirm
  | RenameAgentsConfirm
  | AddResearchCreditConfirm
  | CreateBusinessConfirm
  | RenameBusinessConfirm
  | SaveTradeLineConfirm
  | RemoveTradeLineConfirm
  | EditCompanyCardConfirm;

const LANGUAGE = { en: 'English', ar: 'Arabic', fr: 'French', hi: 'Hindi', sw: 'Swahili' } as const;
const onOff = (v: boolean) => (v ? 'On' : 'Off');

/// One line per setting, in the words of the settings page.
function settingFields(s: SettingsPatch): Array<{ label: string; value: string }> {
  const rows: Array<{ label: string; value: string }> = [];
  if (s.locale) rows.push({ label: 'Language', value: LANGUAGE[s.locale] });
  if (s.theme) rows.push({ label: 'Theme', value: s.theme === 'system' ? 'Match my device' : s.theme === 'dark' ? 'Dark' : 'Light' });
  if (s.soundEnabled !== undefined) rows.push({ label: 'Sounds', value: onOff(s.soundEnabled) });
  if (s.notificationsMuted !== undefined) rows.push({ label: 'Alerts', value: onOff(!s.notificationsMuted) });
  if (s.publicPassport !== undefined) rows.push({ label: 'Public passport', value: onOff(s.publicPassport) });
  if (s.publishDeals !== undefined) rows.push({ label: 'Publish settled deals', value: onOff(s.publishDeals) });
  if (s.publishHistory !== undefined) rows.push({ label: 'Show deal history on my passport', value: onOff(s.publishHistory) });
  if (s.notifyVia) rows.push({ label: 'How we reach you', value: s.notifyVia === 'both' ? 'Telegram and email' : s.notifyVia === 'telegram' ? 'Telegram' : 'Email' });
  return rows;
}

export function buildChangeSettingsConfirm(i: { address: string; settings: SettingsPatch; hasTelegram: boolean; hasEmail: boolean }): ChangeSettingsConfirm | { error: string } {
  const fields = settingFields(i.settings);
  if (!fields.length) return { error: 'Say which setting to change.' };
  if ((i.settings.notifyVia === 'telegram' || i.settings.notifyVia === 'both') && !i.hasTelegram) {
    return { error: 'Telegram is not linked to this account yet. Link it from the account page first.' };
  }
  if ((i.settings.notifyVia === 'email' || i.settings.notifyVia === 'both') && !i.hasEmail) {
    return { error: 'This account has no verified email yet. Add one on the profile page first.' };
  }
  return {
    kind: 'confirm',
    id: `change_settings:${Object.keys(i.settings).sort().join(',')}:${confirmNonce()}`,
    intent: 'change_settings',
    title: 'Change your settings',
    summary: 'This changes only what is listed. You can change it back any time.',
    fields,
    payload: { address: i.address, settings: i.settings },
    confirmLabel: 'Save',
    cancelLabel: 'Keep as is',
  };
}

export function buildEditProfileConfirm(i: {
  profile: Record<string, unknown> & { address: string; displayName: string; role: string; seller?: { skills: string[]; bio: string } & Record<string, unknown> };
  displayName?: string;
  bio?: string;
  skills?: string[];
  nameTaken?: boolean;
}): EditProfileConfirm | { error: string } {
  const displayName = i.displayName?.trim();
  const bio = i.bio?.trim();
  const skills = i.skills?.map((s) => s.trim()).filter(Boolean);
  if (!displayName && bio === undefined && !skills) return { error: 'Say what to change: the name, the bio or the skills.' };
  if (displayName !== undefined && (displayName.length < 1 || displayName.length > 40)) return { error: 'A name is 1 to 40 characters.' };
  if (i.nameTaken) return { error: 'Another account already uses that name. Pick another.' };
  if ((bio !== undefined || skills) && !i.profile.seller) return { error: 'A bio and skills are part of a seller profile. Set up selling on the profile page first.' };
  if (bio !== undefined && bio.length > 400) return { error: 'Keep the bio to 400 characters.' };
  if (skills && (skills.length < 1 || skills.length > 20)) return { error: 'Give between 1 and 20 skills.' };
  const { keywords: _keywords, ...seller } = (i.profile.seller ?? {}) as Record<string, unknown>;
  const fields: Array<{ label: string; value: string }> = [];
  if (displayName) fields.push({ label: 'Name', value: displayName });
  if (bio !== undefined) fields.push({ label: 'Bio', value: bio || 'Empty' });
  if (skills) fields.push({ label: 'Skills', value: skills.join(', ') });
  const body: Record<string, unknown> = {
    address: i.profile.address,
    role: i.profile.role,
    displayName: displayName || i.profile.displayName,
    ...(i.profile.accountKind ? { accountKind: i.profile.accountKind } : {}),
    ...(i.profile.seller ? { seller: { ...seller, ...(bio !== undefined ? { bio } : {}), ...(skills ? { skills } : {}) } } : {}),
    ...(i.profile.buyer ? { buyer: i.profile.buyer } : {}),
  };
  return {
    kind: 'confirm',
    id: `edit_profile:${confirmNonce()}`,
    intent: 'edit_profile',
    title: 'Update your profile',
    summary: 'People see the new details on your profile and passport.',
    fields,
    payload: body as EditProfileConfirm['payload'],
    confirmLabel: 'Save',
    cancelLabel: 'Keep as is',
  };
}

export function buildSetXHandleConfirm(i: { address: string; handle: string | null; current?: string }): SetXHandleConfirm | { error: string } {
  const handle = i.handle === null ? null : i.handle.trim().replace(/^@/, '');
  if (handle !== null && !/^[A-Za-z0-9_]{1,15}$/.test(handle)) return { error: 'An X handle is 1 to 15 letters, numbers or underscores.' };
  if (handle === null && !i.current) return { error: 'No X handle is on this profile.' };
  return {
    kind: 'confirm',
    id: `set_x_handle:${handle ?? 'none'}:${confirmNonce()}`,
    intent: 'set_x_handle',
    title: handle ? `Show @${handle} on your profile` : 'Remove your X handle',
    summary: handle
      ? 'It shows on your profile as your X account. To prove it is yours, connect X on the profile page.'
      : 'Your profile stops showing an X account.',
    fields: handle ? [{ label: 'X handle', value: `@${handle}` }] : [{ label: 'Now', value: `@${i.current}` }],
    payload: { address: i.address, handle },
    confirmLabel: handle ? 'Save' : 'Remove',
    cancelLabel: 'Not now',
  };
}

export function buildRemoveEmailConfirm(i: { address: string; email?: string; loginEmail: boolean }): RemoveEmailConfirm | { error: string } {
  if (!i.email) return { error: 'No email is on this profile.' };
  if (i.loginEmail) return { error: 'This email is how they sign in, so it stays. Only an added contact email can be removed.' };
  return {
    kind: 'confirm',
    id: `remove_email:${confirmNonce()}`,
    intent: 'remove_email',
    title: 'Remove your email',
    summary: 'Deal alerts and Karwan updates stop going to it. Adding it again needs a new code.',
    fields: [{ label: 'Email', value: i.email }],
    payload: { address: i.address },
    confirmLabel: 'Remove',
    cancelLabel: 'Keep it',
  };
}

export function buildJoinNewsletterConfirm(i: { email?: string }): JoinNewsletterConfirm | { error: string } {
  if (!i.email) return { error: 'Add and verify an email on the profile page first.' };
  return {
    kind: 'confirm',
    id: `join_newsletter:${confirmNonce()}`,
    intent: 'join_newsletter',
    title: 'Get Karwan updates',
    summary: 'News about Karwan by email. Every email has a link to stop them.',
    fields: [{ label: 'Email', value: i.email }],
    payload: { email: i.email },
    confirmLabel: 'Sign me up',
    cancelLabel: 'Not now',
  };
}

export function buildUnlinkTelegramConfirm(i: { address: string; linked: boolean; username?: string | null }): UnlinkTelegramConfirm | { error: string } {
  if (!i.linked) return { error: 'Telegram is not linked to this account.' };
  return {
    kind: 'confirm',
    id: `unlink_telegram:${confirmNonce()}`,
    intent: 'unlink_telegram',
    title: 'Unlink Telegram',
    summary: 'Deal alerts stop going to Telegram, and the Karwan agent there no longer acts for this account.',
    fields: i.username ? [{ label: 'Telegram', value: `@${i.username}` }] : [],
    payload: { address: i.address },
    confirmLabel: 'Unlink',
    cancelLabel: 'Keep it',
  };
}

export function buildSetMemoryConfirm(i: { on: boolean; now: boolean }): SetMemoryConfirm | { error: string } {
  if (i.on === i.now) return { error: `Memory is already ${i.on ? 'on' : 'off'}.` };
  return {
    kind: 'confirm',
    id: `set_memory:${i.on}:${confirmNonce()}`,
    intent: 'set_memory',
    title: i.on ? 'Turn memory on' : 'Turn memory off',
    summary: i.on
      ? 'The assistant keeps short notes from your conversations, so you do not repeat yourself.'
      : 'The assistant stops keeping notes. Notes it already has stay until you ask to forget them.',
    fields: [],
    payload: { on: i.on },
    confirmLabel: i.on ? 'Turn on' : 'Turn off',
    cancelLabel: 'Not now',
  };
}

export function buildRemovePublishedDealsConfirm(i: { publishedCount: number }): RemovePublishedDealsConfirm | { error: string } {
  if (i.publishedCount < 1) return { error: 'None of their deals is published.' };
  return {
    kind: 'confirm',
    id: `remove_published_deals:${confirmNonce()}`,
    intent: 'remove_published_deals',
    title: 'Remove your published deals',
    summary: `The ${i.publishedCount} settled deal${i.publishedCount === 1 ? '' : 's'} published under your name are withdrawn. Your record on Karwan stays.`,
    warning: 'Copies others already saved cannot be recalled.',
    fields: [{ label: 'Published deals', value: String(i.publishedCount) }],
    payload: {},
    confirmLabel: 'Remove them',
    cancelLabel: 'Keep them',
  };
}

export function buildSetOutsideReadsConfirm(i: { address: string; on: boolean; now: boolean }): SetOutsideReadsConfirm | { error: string } {
  if (i.on === i.now) return { error: `Agents outside Karwan ${i.on ? 'can already' : 'already cannot'} check their record.` };
  return {
    kind: 'confirm',
    id: `set_outside_reads:${i.on}:${confirmNonce()}`,
    intent: 'set_outside_reads',
    title: i.on ? 'Let agents outside Karwan check your record' : 'Stop agents outside Karwan checking your record',
    summary: i.on
      ? 'An agent outside Karwan can read your record when it asks. You see each read.'
      : 'Agents outside Karwan can no longer read your record. Agents on requests you post on Karwan still can.',
    fields: [],
    payload: { address: i.address, outsideReadable: i.on },
    confirmLabel: i.on ? 'Allow' : 'Stop',
    cancelLabel: 'Not now',
  };
}

export function buildSendFeedbackConfirm(i: { category: SendFeedbackConfirm['payload']['category']; title: string; message: string }): SendFeedbackConfirm | { error: string } {
  const title = i.title.trim();
  const message = i.message.trim();
  if (title.length < 3 || title.length > 140) return { error: 'Give the feedback a short title, 3 to 140 characters.' };
  if (message.length < 5 || message.length > 4000) return { error: 'Say a little more, in up to 4,000 characters.' };
  const kind = { bug: 'Something broke', improvement: 'An idea', other: 'Other', praise: 'Praise' }[i.category];
  return {
    kind: 'confirm',
    id: `send_feedback:${confirmNonce()}`,
    intent: 'send_feedback',
    title: 'Send feedback to the team',
    summary: 'The Karwan team reads every note.',
    fields: [
      { label: 'Kind', value: kind },
      { label: 'Title', value: title },
      { label: 'Message', value: message },
    ],
    payload: { category: i.category, title, message },
    confirmLabel: 'Send',
    cancelLabel: 'Edit first',
  };
}

function agentNames(i: { buyerName?: string; sellerName?: string }) {
  const clean = (s?: string) => s?.trim().replace(/\s+/g, ' ').slice(0, 40) || undefined;
  return { buyerName: clean(i.buyerName), sellerName: clean(i.sellerName) };
}

export function buildSetUpAgentsConfirm(i: { address: string; active: boolean; buyerName?: string; sellerName?: string }): SetUpAgentsConfirm | { error: string } {
  if (i.active) return { error: 'Their agents are already set up. To rename them, use propose_rename_agents.' };
  const names = agentNames(i);
  return {
    kind: 'confirm',
    id: `set_up_agents:${confirmNonce()}`,
    intent: 'set_up_agents',
    title: 'Set up your agents',
    summary: 'Karwan makes a buying agent and a selling agent for your account. They act only within the limits you set.',
    fields: [
      { label: 'Buying agent', value: names.buyerName ?? 'Buying agent' },
      { label: 'Selling agent', value: names.sellerName ?? 'Selling agent' },
    ],
    payload: { address: i.address, ...(names.buyerName ? { buyerName: names.buyerName } : {}), ...(names.sellerName ? { sellerName: names.sellerName } : {}) },
    confirmLabel: 'Set up',
    cancelLabel: 'Not now',
  };
}

export function buildRenameAgentsConfirm(i: { address: string; active: boolean; buyerName?: string; sellerName?: string }): RenameAgentsConfirm | { error: string } {
  if (!i.active) return { error: 'Their agents are not set up yet. Offer propose_set_up_agents.' };
  const names = agentNames(i);
  if (!names.buyerName && !names.sellerName) return { error: 'Say the new name for the buying agent, the selling agent or both.' };
  return {
    kind: 'confirm',
    id: `rename_agents:${confirmNonce()}`,
    intent: 'rename_agents',
    title: 'Rename your agents',
    summary: 'Only the names change. Your agents keep their wallets and limits.',
    fields: [
      ...(names.buyerName ? [{ label: 'Buying agent', value: names.buyerName }] : []),
      ...(names.sellerName ? [{ label: 'Selling agent', value: names.sellerName }] : []),
    ],
    payload: { address: i.address, ...(names.buyerName ? { buyerName: names.buyerName } : {}), ...(names.sellerName ? { sellerName: names.sellerName } : {}) },
    confirmLabel: 'Save names',
    cancelLabel: 'Keep as is',
  };
}

export function buildAddResearchCreditConfirm(i: { active: boolean; priceUsdc: number; creditUsdc: number }): AddResearchCreditConfirm | { error: string } {
  if (i.active && i.creditUsdc > 0) return { error: `They still have ${i.creditUsdc.toFixed(2)} USDC of research credit.` };
  return {
    kind: 'confirm',
    id: `add_research_credit:${confirmNonce()}`,
    intent: 'add_research_credit',
    title: `Add ${i.priceUsdc.toFixed(2)} USDC of research credit`,
    summary: 'Your agents use it for paid market research once the free reports for the day are used. It is taken from your buying agent, or your selling agent if the buying agent is short.',
    fields: [{ label: 'Amount', value: `${i.priceUsdc.toFixed(2)} USDC` }],
    payload: {},
    confirmLabel: `Add ${i.priceUsdc.toFixed(2)} USDC`,
    cancelLabel: 'Not now',
  };
}

export function buildCreateBusinessConfirm(i: { name: string; hasBusiness: boolean; open: boolean }): CreateBusinessConfirm | { error: string } {
  if (!i.open) return { error: 'Business accounts are not open on this network yet.' };
  if (i.hasBusiness) return { error: 'They already have a business workspace.' };
  const name = i.name.trim();
  if (name.length < 1 || name.length > 120) return { error: 'Give the business a name, up to 120 characters.' };
  return {
    kind: 'confirm',
    id: `create_business:${confirmNonce()}`,
    intent: 'create_business',
    title: `Add ${name} as your business`,
    summary: 'A business workspace beside your personal one, on the same wallet. Registering it with documents is a separate step on the business page.',
    fields: [{ label: 'Business name', value: name }],
    payload: { name },
    confirmLabel: 'Add business',
    cancelLabel: 'Not now',
  };
}

export function buildRenameBusinessConfirm(i: { workspaceId: string; current: string; name: string }): RenameBusinessConfirm | { error: string } {
  const name = i.name.trim();
  if (name.length < 1 || name.length > 120) return { error: 'Give the business a name, up to 120 characters.' };
  if (name === i.current) return { error: `It is already called ${name}.` };
  return {
    kind: 'confirm',
    id: `rename_business:${i.workspaceId}:${confirmNonce()}`,
    intent: 'rename_business',
    title: 'Rename your business workspace',
    summary: 'The name your workspace shows. A registered legal name changes only through registration.',
    fields: [
      { label: 'Now', value: i.current },
      { label: 'New name', value: name },
    ],
    payload: { workspaceId: i.workspaceId, name },
    confirmLabel: 'Rename',
    cancelLabel: 'Keep it',
  };
}

export function buildSaveTradeLineConfirm(i: {
  workspaceId: string;
  id?: string;
  tradeType: 'goods' | 'services';
  title: string;
  description?: string;
  region?: string;
  unit?: string;
  active?: boolean;
}): SaveTradeLineConfirm | { error: string } {
  const title = i.title.trim();
  if (title.length < 1 || title.length > 140) return { error: 'Give what the business trades a title, up to 140 characters.' };
  if (i.description && i.description.trim().length > 500) return { error: 'Keep the description to 500 characters.' };
  const description = i.description?.trim();
  const region = i.region?.trim();
  const unit = i.unit?.trim();
  return {
    kind: 'confirm',
    id: `save_trade_line:${i.workspaceId}:${i.id ?? 'new'}:${confirmNonce()}`,
    intent: 'save_trade_line',
    title: i.id ? 'Update what you trade' : 'Add what you trade',
    summary: 'Businesses looking for a partner see it on your company card.',
    fields: [
      { label: 'Kind', value: i.tradeType === 'goods' ? 'Goods' : 'Services' },
      { label: 'What', value: title },
      ...(description ? [{ label: 'Details', value: description }] : []),
      ...(region ? [{ label: 'Where', value: region }] : []),
      ...(unit ? [{ label: 'Sold by', value: unit }] : []),
      { label: 'Shown', value: i.active === false ? 'No' : 'Yes' },
    ],
    payload: {
      workspaceId: i.workspaceId,
      tradeType: i.tradeType,
      title,
      ...(description ? { description } : {}),
      ...(region ? { region } : {}),
      ...(unit ? { unit } : {}),
      active: i.active !== false,
      ...(i.id ? { id: i.id } : {}),
    },
    confirmLabel: 'Save',
    cancelLabel: 'Not now',
  };
}

export function buildRemoveTradeLineConfirm(i: { workspaceId: string; availabilityId: string; title: string }): RemoveTradeLineConfirm | { error: string } {
  return {
    kind: 'confirm',
    id: `remove_trade_line:${i.availabilityId}:${confirmNonce()}`,
    intent: 'remove_trade_line',
    title: 'Remove this from what you trade',
    summary: 'It no longer shows on your company card.',
    fields: [{ label: 'What', value: i.title }],
    payload: { workspaceId: i.workspaceId, availabilityId: i.availabilityId },
    confirmLabel: 'Remove',
    cancelLabel: 'Keep it',
  };
}

export function buildEditCompanyCardConfirm(i: { address: string; isBusiness: boolean; patch: CompanyCardPatch }): EditCompanyCardConfirm | { error: string } {
  if (!i.isBusiness) return { error: 'The company card is for business accounts.' };
  const p = i.patch;
  const fields: Array<{ label: string; value: string }> = [];
  if (p.region !== undefined) fields.push({ label: 'Region', value: p.region });
  if (p.websiteUrl !== undefined) fields.push({ label: 'Website', value: p.websiteUrl });
  if (p.primaryMarkets !== undefined) fields.push({ label: 'Main markets', value: p.primaryMarkets });
  if (p.minOrderValue !== undefined) fields.push({ label: 'Smallest order', value: p.minOrderValue });
  if (p.leadTimeDays !== undefined) fields.push({ label: 'Lead time', value: `${p.leadTimeDays} days` });
  if (p.hideFromDiscovery !== undefined) fields.push({ label: 'Shown to businesses looking for partners', value: p.hideFromDiscovery ? 'No' : 'Yes' });
  if (!fields.length) return { error: 'Say what to change on the company card.' };
  if (p.region !== undefined && (p.region.length < 2 || p.region.length > 80)) return { error: 'A region is 2 to 80 characters.' };
  return {
    kind: 'confirm',
    id: `edit_company_card:${confirmNonce()}`,
    intent: 'edit_company_card',
    title: 'Update your company card',
    summary: 'Businesses looking for a partner see the new details.',
    fields,
    payload: { address: i.address, smeProfile: p },
    confirmLabel: 'Save',
    cancelLabel: 'Keep as is',
  };
}
