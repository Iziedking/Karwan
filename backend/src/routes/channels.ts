import { Hono } from 'hono';
import { ARC } from '../chain/client.js';
import { config } from '../config.js';
import { setSessionCookie } from '../auth/session.js';
import { chatOpenLinks } from '../channels/openLinksLive.js';
import { OPEN_LINK_SESSION_SECS } from '../channels/openLink.js';
import { openHandler } from '../channels/openRoute.js';

const webBase = (config.FRONTEND_BASE_URL ?? (ARC.testnet ? 'https://testnet.karwan.site' : 'https://karwan.site')).replace(/\/$/, '');

/// The one-time link any chat channel sends for the few steps that need a
/// page. It signs in for half an hour, never a normal 30-day session.
export const openChatLink = openHandler({
  webBase,
  redeem: (token) => chatOpenLinks.redeem(token),
  signIn: (c, address) =>
    setSessionCookie(c, { address, method: 'circle', chainId: ARC.chainId }, { ttlSecs: OPEN_LINK_SESSION_SECS }),
});

export const channelRoutes = new Hono();
channelRoutes.get('/open', openChatLink);
