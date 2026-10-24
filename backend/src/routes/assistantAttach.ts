import { Hono, type Context } from 'hono';

/// POST /api/assistant/attach: a photo or PDF added in assistant mode. It goes
/// through the same intake as a file sent to the agent on Telegram (read as an
/// invoice for your own work, added to your record unconfirmed). The file is
/// never kept; only its hash and the fields read from it.

export const ATTACH_MAX_BYTES = 10 * 1024 * 1024;
const READABLE = /^(image\/(jpeg|png|webp)|application\/pdf)$/;
const LIMIT = 10;
const WINDOW_MS = 10 * 60 * 1000;

export interface AttachRouteDeps {
  sessionAddress: (c: Context) => string | null | Promise<string | null>;
  /// The intake's reply, one line per message it would send in chat.
  intake: (address: string, file: { bytes: Uint8Array; mimeType: string }) => Promise<string[]>;
  /// A photo the person added for an offer: held for their next offer (view 28).
  holdForOffer?: (address: string, file: { bytes: Uint8Array; mimeType: string }) => Promise<string>;
  now?: () => number;
}

export function createAssistantAttachRoutes(deps: AttachRouteDeps): Hono {
  const app = new Hono();
  const now = deps.now ?? Date.now;
  const used = new Map<string, { count: number; resetAt: number }>();

  /// Each file is read by a model, so an account gets a fixed number per window.
  function allowed(address: string): boolean {
    const at = now();
    const bucket = used.get(address);
    if (!bucket || bucket.resetAt <= at) {
      used.set(address, { count: 1, resetAt: at + WINDOW_MS });
      return true;
    }
    bucket.count += 1;
    return bucket.count <= LIMIT;
  }

  app.post('/', async (c) => {
    const address = (await deps.sessionAddress(c))?.toLowerCase();
    if (!address) return c.json({ error: 'not authenticated' }, 401);
    const form = await c.req.parseBody().catch(() => null);
    const file = form?.file;
    if (!(file instanceof File)) return c.json({ error: 'no file' }, 400);
    if (!READABLE.test(file.type)) return c.json({ error: 'send a photo or a PDF' }, 415);
    if (file.size > ATTACH_MAX_BYTES) return c.json({ error: 'the file is over 10 MB' }, 413);
    if (!allowed(address)) return c.json({ error: 'too many files, wait a few minutes' }, 429);
    if (form?.purpose === 'offer') {
      if (!file.type.startsWith('image/')) return c.json({ error: 'send a photo for an offer' }, 415);
      const hold = deps.holdForOffer ?? (await import('../listings/photos.js')).holdForOffer;
      return c.json({ reply: await hold(address, { bytes: new Uint8Array(await file.arrayBuffer()), mimeType: file.type }) });
    }
    const lines = await deps.intake(address, { bytes: new Uint8Array(await file.arrayBuffer()), mimeType: file.type });
    return c.json({ reply: lines.join('\n\n') });
  });

  return app;
}

/// Mounted at /api/assistant/attach. The live intake loads on first use, so
/// importing this file never opens the database or a model.
const live = async () => {
  const [{ sessionAddress }, { createEvidenceIntake }, { extractInvoice }, { getProfile }, { claimUnique }, { addVerifiedFact }] = await Promise.all([
    import('../auth/session.js'),
    import('../channels/media.js'),
    import('../channels/invoiceExtract.js'),
    import('../db/profiles.js'),
    import('../db/evidence.js'),
    import('../verification/live.js'),
  ]);
  return { sessionAddress, createEvidenceIntake, extractInvoice, getProfile, claimUnique, addVerifiedFact };
};

export const assistantAttachRoutes = createAssistantAttachRoutes({
  sessionAddress: async (c) => (await live()).sessionAddress(c),
  intake: async (address, file) => {
    const l = await live();
    const intake = l.createEvidenceIntake({
      now: Date.now,
      channel: 'web',
      download: async () => file,
      extract: l.extractInvoice,
      displayNameOf: async (a) => (await l.getProfile(a))?.displayName ?? '',
      claimFingerprint: (fp, a) => l.claimUnique('fp', fp, a),
      addFact: l.addVerifiedFact,
    });
    const out = await intake(address, { id: 'web', from: address, timestamp: Date.now(), kind: 'media', mediaId: 'upload', mimeType: file.mimeType });
    return out.map((m) => ('body' in m ? m.body : ''));
  },
});
