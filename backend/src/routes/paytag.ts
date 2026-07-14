/// Paytag lookup for the deal form. Confirms a handle exists before the buyer
/// commits, so a typo fails at the input and not at deal creation.
///
/// Returns the address MASKED. The buyer names a counterparty by handle
/// precisely so they don't have to swap raw addresses, and the deal page keeps
/// it that way. The unmasked address is pinned server-side at creation and is
/// what every payout acts on.

import { Hono } from 'hono';
import { config } from '../config.js';
import { maskAddress, resolvePaytag } from '../paytag/resolve.js';

export const paytagRoutes = new Hono();

paytagRoutes.get('/resolve', async (c) => {
  if (!config.PAYTAG_ENABLED) {
    return c.json({ enabled: false, found: false }, 200);
  }

  const handle = c.req.query('handle')?.trim();
  if (!handle) {
    return c.json({ error: 'handle required' }, 400);
  }

  const hit = await resolvePaytag(handle);
  if (!hit) {
    return c.json({ enabled: true, found: false, handle: handle.replace(/^@/, '').toLowerCase() }, 200);
  }

  return c.json({
    enabled: true,
    found: true,
    handle: hit.handle,
    maskedAddress: maskAddress(hit.address),
  });
});
