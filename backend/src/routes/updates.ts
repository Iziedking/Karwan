/// Home Updates cards. GET /api/updates is public; /api/admin/updates manages
/// them behind the admin token.

import { Hono } from 'hono';
import { z } from 'zod';
import { requireAdmin } from '../middleware/adminAuth.js';
import { invalidBodyMessage } from './invalidBody.js';
import { listAllBriefs } from '../db/briefs.js';
import { liveUpdates, trendingCategories, updateInputSchema } from '../updates/model.js';
import { createUpdate, deleteUpdate, listUpdates, patchUpdate, reorderUpdates } from '../updates/store.js';
import { sourcedCards } from '../updates/source.js';
import { withThumbnails } from '../updates/thumbnail.js';
import { decodeUpdateImage, updateImages, MAX_UPDATE_IMAGE_BYTES } from '../updates/images.js';
import { config } from '../config.js';

export const updatesRoutes = new Hono();

updatesRoutes.get('/', async (c) => {
  const now = Date.now();
  const cards = await withThumbnails((await sourcedCards(config.UPDATES_SOURCE_URL))
    ?? liveUpdates(await listUpdates(), now).map(({ createdAt: _c, updatedAt: _u, active: _a, startsAt: _s, endsAt: _e, ...card }) => card));
  const trending = cards.some((card) => card.kind === 'trending') ? trendingCategories(listAllBriefs(), now) : [];
  c.header('Cache-Control', 'public, max-age=60');
  return c.json({ cards, trending });
});

/// A picture uploaded for a card. Public like the cards; the name is the
/// file's content, so it is cached for a year.
updatesRoutes.get('/images/:file', (c) => {
  const image = updateImages.read(c.req.param('file'));
  if (!image) return c.json({ error: 'no picture' }, 404);
  return c.body(new Uint8Array(image.bytes), 200, {
    'Content-Type': image.contentType,
    'Cache-Control': 'public, max-age=31536000, immutable',
    'X-Content-Type-Options': 'nosniff',
  });
});

export const adminUpdatesRoutes = new Hono();
adminUpdatesRoutes.use('*', requireAdmin);

// `source` tells the page that home here shows another server's cards, so it
// can send the editor there instead of to a list nobody sees.
adminUpdatesRoutes.get('/', async (c) => c.json({ cards: await listUpdates(), trending: trendingCategories(listAllBriefs(), Date.now()), source: config.UPDATES_SOURCE_URL ?? null }));

adminUpdatesRoutes.post('/', async (c) => {
  const parsed = updateInputSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: invalidBodyMessage(parsed.error) }, 400);
  return c.json({ card: await createUpdate(parsed.data) }, 201);
});

/// A designer's picture for a card, as a data URL. Returns the path to put in
/// the card's image field.
adminUpdatesRoutes.post('/images', async (c) => {
  const parsed = z.object({ dataUrl: z.string().max(Math.ceil(MAX_UPDATE_IMAGE_BYTES * 1.4) + 64) }).safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: 'That picture is too large. Use one under 4 MB.' }, 400);
  const image = decodeUpdateImage(parsed.data.dataUrl);
  if ('error' in image) return c.json({ error: image.error }, 400);
  return c.json({ image: updateImages.save(image), width: image.width, height: image.height }, 201);
});

adminUpdatesRoutes.patch('/:id', async (c) => {
  const parsed = updateInputSchema.partial().safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: invalidBodyMessage(parsed.error) }, 400);
  const card = await patchUpdate(c.req.param('id'), parsed.data);
  return card ? c.json({ card }) : c.json({ error: 'not found' }, 404);
});

adminUpdatesRoutes.delete('/:id', async (c) => {
  return (await deleteUpdate(c.req.param('id'))) ? c.json({ ok: true }) : c.json({ error: 'not found' }, 404);
});

adminUpdatesRoutes.post('/reorder', async (c) => {
  const parsed = z.object({ ids: z.array(z.string().max(40)).max(50) }).safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: invalidBodyMessage(parsed.error) }, 400);
  return c.json({ cards: await reorderUpdates(parsed.data.ids) });
});
