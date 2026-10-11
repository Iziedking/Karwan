import { randomBytes } from 'node:crypto';
import { config } from '../config.js';
import { durableEphemeralMap } from '../db/ephemeral.js';
import { createOpenLinks, type OpenablePath } from './openLink.js';

/// One store of one-time page links for every chat channel, redeemed by the
/// same route whichever channel sent the link.
const pending = durableEphemeralMap<{ address: string; path: OpenablePath; expiresAt: number }>('chat-open');

export const chatOpenLinks = createOpenLinks({
  now: Date.now,
  newToken: () => randomBytes(24).toString('base64url'),
  put: async (k, v) => {
    pending.set(k, v);
  },
  take: async (k) => {
    const v = pending.get(k) ?? null;
    pending.delete(k);
    return v;
  },
});

export function chatOpenUrl(token: string): string | null {
  const base = config.PUBLIC_API_BASE_URL?.replace(/\/$/, '');
  return base ? `${base}/api/channels/open?t=${token}` : null;
}
