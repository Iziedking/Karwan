import { isChatAccountEmail } from '../emails/chatRecipients.js';

/// A chat account has no browser session, so the steps that need a page open
/// from a one-time link the agent sends in chat: the person check, signing in
/// to X, and every step that moves money, which is always confirmed on Karwan
/// itself and never by a chat button. A link works once, within ten minutes,
/// and only for the pages matched here.
const TTL_MS = 10 * 60_000;
/// The browser session the link opens lasts long enough to finish the step,
/// never the 30 days of a normal sign-in.
export const OPEN_LINK_SESSION_SECS = 30 * 60;

const ID = '0x[0-9a-fA-F]{64}';
const OPENABLE: readonly RegExp[] = [
  /^\/verify\/person$/,
  /^\/profile$/,
  /^\/account$/,
  /^\/guarantee$/,
  /^\/legacy$/,
  /^\/financier$/,
  /^\/profile\/agent-funds$/,
  /^\/deposit\/request\/[0-9a-f-]{36}$/,
  /^\/bridge\?direction=(in|out)$/,
  new RegExp(`^/deals/${ID}$`),
  new RegExp(`^/jobs/${ID}$`),
  // Contests (view 40): one contest, or the form filled from a chat card.
  /^\/contests\/c_[A-Za-z0-9_-]{1,40}$/,
  /^\/contests\/new\?[A-Za-z0-9=&%+*._-]{1,3000}$/,
  // Hourly work (view 32): one piece of work, or the form filled from a chat card.
  /^\/work\/w_[A-Za-z0-9_-]{1,40}$/,
  /^\/work\/new\?[A-Za-z0-9=&%+*._-]{1,3000}$/,
];

export type OpenablePath = string;

interface Pending {
  address: string;
  path: OpenablePath;
  expiresAt: number;
}

export interface OpenLinkDeps {
  now: () => number;
  newToken: () => string;
  put: (token: string, value: Pending) => Promise<void>;
  /// Returns the value and removes it, so a token works once.
  take: (token: string) => Promise<Pending | null>;
}

const isOpenable = (path: string): boolean => OPENABLE.some((pattern) => pattern.test(path));

export function createOpenLinks(deps: OpenLinkDeps) {
  async function mint(address: string, path: string): Promise<string | null> {
    if (!isOpenable(path)) return null;
    const token = deps.newToken();
    await deps.put(token, { address: address.toLowerCase(), path, expiresAt: deps.now() + TTL_MS });
    return token;
  }

  async function redeem(token: string): Promise<{ address: string; path: OpenablePath } | null> {
    const p = await deps.take(token);
    if (!p || p.expiresAt < deps.now()) return null;
    return { address: p.address, path: p.path };
  }

  return { mint, redeem };
}

/// Who gets a one-time signed-in link: an account Karwan holds the keys of,
/// a chat-only account or an email account linked to the chat. A browser
/// wallet account signs in on the page with its own wallet.
export function openLinkAllowed(
  account: { linkedWebAccount?: boolean } | null,
  user: { circleIdentityWalletId?: string } | null,
): boolean {
  if (!account) return false;
  return !account.linkedWebAccount || !!user?.circleIdentityWalletId;
}

/// The half-hour session a link opens. It carries the account's email when it
/// has a real one, so a PIN can be reset by email code on that page.
export function openLinkSession(address: string, user: { email?: string } | null, chainId: number) {
  const email = user?.email && !isChatAccountEmail(user.email) ? user.email.trim().toLowerCase() : undefined;
  return { address, method: 'circle' as const, chainId, via: 'open_link' as const, ...(email ? { email } : {}) };
}
