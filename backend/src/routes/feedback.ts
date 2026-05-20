import { Hono } from 'hono';
import { z } from 'zod';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { bus } from '../events.js';
import { telegramEnabled, sendTelegramMessage, sendTelegramPhoto } from '../telegram/bot.js';
import {
  createFeedback,
  listAllFeedback,
  readFeedbackAsset,
  setFeedbackStatus,
  type Feedback,
  type DecodedScreenshot,
} from '../db/feedback.js';

export const feedbackRoutes = new Hono();

// Per-image and total caps. Screenshots are already downscaled client-side, so
// these are generous ceilings, not the expected size. Decoded bytes, not base64.
const MAX_SCREENSHOTS = 4;
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const MAX_TOTAL_BYTES = 12 * 1024 * 1024;

const MIME_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

const screenshotSchema = z.object({
  dataUrl: z
    .string()
    .regex(/^data:image\/(png|jpe?g|webp|gif);base64,/, 'unsupported image type'),
});

const bodySchema = z.object({
  category: z.enum(['bug', 'improvement', 'other', 'praise']),
  title: z.string().trim().min(3).max(140),
  message: z.string().trim().min(5).max(4000),
  contact: z.string().trim().max(200).optional(),
  context: z
    .object({
      url: z.string().max(500).optional(),
      wallet: z.string().max(80).optional(),
      userAgent: z.string().max(400).optional(),
    })
    .optional(),
  screenshots: z.array(screenshotSchema).max(MAX_SCREENSHOTS).optional(),
});

/// Decodes a `data:image/...;base64,...` URL into bytes plus its mime/ext.
/// Returns null when the payload is malformed or the type isn't allowed.
function decodeDataUrl(dataUrl: string): DecodedScreenshot | null {
  const comma = dataUrl.indexOf(',');
  if (comma < 0) return null;
  const header = dataUrl.slice(5, comma); // strip "data:"
  const mime = header.split(';')[0] ?? '';
  const ext = MIME_EXT[mime];
  if (!ext) return null;
  try {
    const buffer = Buffer.from(dataUrl.slice(comma + 1), 'base64');
    if (buffer.length === 0) return null;
    return { buffer, mime, ext };
  } catch {
    return null;
  }
}

feedbackRoutes.post('/', async (c) => {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    return c.json({ error: 'invalid JSON body' }, 400);
  }

  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return c.json(
      { error: 'invalid feedback', detail: parsed.error.flatten().fieldErrors },
      400,
    );
  }
  const body = parsed.data;

  // Decode + validate screenshots before persisting anything.
  const decoded: DecodedScreenshot[] = [];
  let total = 0;
  for (const s of body.screenshots ?? []) {
    const img = decodeDataUrl(s.dataUrl);
    if (!img) return c.json({ error: 'a screenshot could not be read' }, 400);
    if (img.buffer.length > MAX_IMAGE_BYTES) {
      return c.json({ error: 'a screenshot is too large (4MB max each)' }, 413);
    }
    total += img.buffer.length;
    if (total > MAX_TOTAL_BYTES) {
      return c.json({ error: 'screenshots total too large (12MB max)' }, 413);
    }
    decoded.push(img);
  }

  const fb = createFeedback(
    {
      category: body.category,
      title: body.title,
      message: body.message,
      ...(body.contact ? { contact: body.contact } : {}),
      ...(body.context ? { context: body.context } : {}),
    },
    decoded,
  );

  bus.emitEvent({
    type: 'feedback.submitted',
    actor: 'platform',
    payload: {
      id: fb.id,
      category: fb.category,
      title: fb.title,
      screenshots: fb.screenshots.length,
      wallet: fb.context?.wallet,
    },
  });

  // Fire-and-forget the operator alert so the tester gets a fast response.
  void notifyOperator(fb).catch((err) =>
    logger.warn({ err: (err as Error).message, id: fb.id }, 'feedback operator notify failed'),
  );

  logger.info(
    { id: fb.id, category: fb.category, screenshots: fb.screenshots.length },
    'feedback received',
  );
  return c.json({ ok: true, id: fb.id });
});

/// Operator viewer: newest-first list. Screenshot bytes are not inlined; each
/// item carries asset URLs the client can render. No auth gate yet (matches the
/// rest of /api/admin on testnet); see todo.md admin-auth item.
feedbackRoutes.get('/', (c) => {
  const items = listAllFeedback().map((fb) => ({
    id: fb.id,
    category: fb.category,
    title: fb.title,
    message: fb.message,
    contact: fb.contact ?? null,
    context: fb.context ?? null,
    status: fb.status,
    createdAt: fb.createdAt,
    screenshotUrls: fb.screenshots.map((_, i) => assetUrl(fb.id, i)),
  }));
  return c.json({ feedback: items });
});

feedbackRoutes.post('/:id/status', async (c) => {
  const id = c.req.param('id');
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    return c.json({ error: 'invalid JSON body' }, 400);
  }
  const schema = z.object({ status: z.enum(['new', 'triaged', 'resolved']) });
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return c.json({ error: 'invalid status' }, 400);
  const fb = setFeedbackStatus(id, parsed.data.status);
  if (!fb) return c.json({ error: 'not found' }, 404);
  return c.json({ ok: true, status: fb.status });
});

feedbackRoutes.get('/:id/asset/:n', (c) => {
  const id = c.req.param('id');
  const n = Number(c.req.param('n'));
  if (!Number.isInteger(n) || n < 0) return c.json({ error: 'bad index' }, 400);
  const asset = readFeedbackAsset(id, n);
  if (!asset) return c.json({ error: 'not found' }, 404);
  // Copy into a fresh Uint8Array so the type is Uint8Array<ArrayBuffer>; Hono's
  // c.body rejects Node's Buffer<ArrayBufferLike> (SharedArrayBuffer mismatch).
  return c.body(Uint8Array.from(asset.buffer), 200, {
    'content-type': asset.mime,
    'cache-control': 'public, max-age=86400',
  });
});

function assetUrl(id: string, index: number): string {
  const base = config.PUBLIC_API_BASE_URL?.replace(/\/$/, '');
  const path = `/api/feedback/${id}/asset/${index}`;
  return base ? `${base}${path}` : path;
}

const CATEGORY_LABEL: Record<Feedback['category'], string> = {
  bug: 'Bug',
  improvement: 'Improvement',
  other: 'Other',
  praise: 'Praise',
};

/// Pushes a new submission to the operator's Telegram chat: a text summary,
/// then each screenshot as a photo (when the public API base is set so Telegram
/// can fetch the URL). No-ops cleanly when the chat id or bot isn't configured.
async function notifyOperator(fb: Feedback): Promise<void> {
  const chatId = config.FEEDBACK_TELEGRAM_CHAT_ID;
  if (!chatId || !telegramEnabled()) return;

  const lines = [
    `*New feedback · ${CATEGORY_LABEL[fb.category]}*`,
    `*${fb.title}*`,
    fb.message.length > 600 ? `${fb.message.slice(0, 597)}…` : fb.message,
  ];
  if (fb.context?.url) lines.push(`Where: ${fb.context.url}`);
  if (fb.context?.wallet) lines.push(`Wallet: \`${fb.context.wallet}\``);
  if (fb.contact) lines.push(`Contact: ${fb.contact}`);
  if (fb.screenshots.length > 0 && !config.PUBLIC_API_BASE_URL) {
    lines.push(`${fb.screenshots.length} screenshot(s) attached (set PUBLIC_API_BASE_URL to receive them here).`);
  }
  await sendTelegramMessage(chatId, lines.join('\n'));

  if (config.PUBLIC_API_BASE_URL) {
    for (let i = 0; i < fb.screenshots.length; i++) {
      await sendTelegramPhoto(chatId, assetUrl(fb.id, i));
    }
  }
}
