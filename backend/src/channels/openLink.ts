/// A WhatsApp account has no browser session, so the few steps that need a
/// page (signing in to X, the World ID check) open from a one-time link the
/// agent sends to the account's own number. It works once, within ten
/// minutes, and only to the pages listed here.
const TTL_MS = 10 * 60_000;
/// The browser session the link opens lasts long enough to finish the step,
/// never the 30 days of a normal sign-in.
export const OPEN_LINK_SESSION_SECS = 30 * 60;

export const OPENABLE_PATHS = ['/verify/person', '/profile'] as const;
export type OpenablePath = (typeof OPENABLE_PATHS)[number];

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

const isOpenable = (path: string): path is OpenablePath => (OPENABLE_PATHS as readonly string[]).includes(path);

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
