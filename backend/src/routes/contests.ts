import { Hono } from 'hono';
import { z } from 'zod';
import type { Address } from 'viem';
import type { Contests } from '../contests/contests.js';
import { checkEntryFile, MAX_ENTRY_FILES, type EntryFile } from '../contests/entryFiles.js';
import type { Contest, ContestEntry, ContestsStore } from '../db/contests.js';
import { checkPhoto, type Photo } from '../listings/photos.js';

/// Contests on the job escrow (view 40). Anyone sees the open contests; the
/// buyer sees each entry's preview and note; an entrant sees their own entry;
/// the full files go to the buyer only once that entry has won.

export interface ContestRouteDeps {
  core: Contests;
  store: ContestsStore;
  readFile(entryId: string, n: number): EntryFile | null;
  readPreview(entryId: string): Photo | null;
  /// Files the person sent to the assistant for their next entry.
  takeHeldFiles(address: string): EntryFile[];
  feeBps(): Promise<number>;
  session(c: unknown): { address: string } | null;
  nameOf(address: string): Promise<string>;
}

const inputSchema = z.object({
  title: z.string().max(200),
  brief: z.string().max(4_000),
  prizeUsdc: z.string().max(32),
  places: z.number().int(),
  shares: z.array(z.number().int()).max(3).optional(),
  entriesDays: z.number().int(),
  awardDays: z.number().int().optional(),
  tags: z.array(z.string().max(40)).max(10).optional(),
});
const entrySchema = z.object({
  files: z.array(z.string().max(7_000_000)).max(MAX_ENTRY_FILES).default([]),
  preview: z.string().max(2_100_000).optional(),
  note: z.string().max(500).default(''),
  heldFiles: z.boolean().optional(),
});
const awardSchema = z.object({ entryIds: z.array(z.string().max(64)).min(1).max(3) });

const DATA_URL = /^data:[a-z]+\/[a-z0-9.+-]+;base64,([A-Za-z0-9+/=]+)$/;
const bytesOf = (dataUrl: string) => {
  const m = DATA_URL.exec(dataUrl);
  return m ? new Uint8Array(Buffer.from(m[1]!, 'base64')) : null;
};

const INPUT_CODES = new Set(['BAD_TERMS', 'BAD_WINNERS', 'NO_FILES', 'NEED_PREVIEW']);
function refused(r: { code: string; message: string; needMicros?: string }) {
  const status = r.code === 'NOT_FOUND' ? 404 : INPUT_CODES.has(r.code) ? 400 : 409;
  return { status: status as 400 | 404 | 409, body: { error: r.message, code: r.code, ...(r.needMicros ? { needMicros: r.needMicros } : {}) } };
}

const lower = (a: string) => a.toLowerCase();
const SHOWN: ContestEntry['status'][] = ['in', 'won', 'lost'];

function publicView(c: Contest, entries: ContestEntry[]) {
  return {
    id: c.id, title: c.title, brief: c.brief, tags: c.tags, prizeMicros: c.prizeMicros, feeBps: c.feeBps, shares: c.shares,
    entriesBy: c.entriesBy, awardBy: c.awardBy, status: c.status,
    entries: entries.filter((e) => SHOWN.includes(e.status)).length,
    ...(c.winners ? { winners: c.winners.map((w) => ({ place: w.place, netMicros: w.netMicros })) } : {}),
  };
}

export function createContestRoutes(deps: ContestRouteDeps) {
  const app = new Hono();
  const preview = (c: Contest, e: ContestEntry) => `/api/contests/${c.id}/entries/${e.id}/preview?v=${e.updatedAt}`;

  app.get('/', async (c) => {
    const open = await deps.store.list({ status: ['open'] });
    const now = Date.now();
    const rows = await Promise.all(open.filter((x) => x.entriesBy > now).map(async (x) => publicView(x, await deps.store.entries(x.id))));
    return c.json({ contests: rows });
  });

  app.get('/mine', async (c) => {
    const s = deps.session(c);
    if (!s) return c.json({ error: 'not authenticated' }, 401);
    const posted = await deps.store.list({ buyer: s.address });
    return c.json({ contests: await Promise.all(posted.map(async (x) => publicView(x, await deps.store.entries(x.id)))) });
  });

  app.post('/draft', async (c) => {
    if (!deps.session(c)) return c.json({ error: 'not authenticated' }, 401);
    const body = inputSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: 'invalid body' }, 400);
    const d = deps.core.draft(body.data, await deps.feeBps());
    if (!d.ok) {
      const r = refused(d);
      return c.json(r.body, r.status);
    }
    return c.json({ card: d.card });
  });

  app.post('/', async (c) => {
    const s = deps.session(c);
    if (!s) return c.json({ error: 'not authenticated' }, 401);
    const body = inputSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: 'invalid body' }, 400);
    const out = await deps.core.post(s.address as Address, body.data);
    if (!out.ok) {
      const r = refused(out);
      return c.json(r.body, r.status);
    }
    return c.json({ contest: publicView(out.contest, []) });
  });

  app.get('/:id', async (c) => {
    const contest = await deps.store.get(c.req.param('id'));
    if (!contest) return c.json({ error: 'not found' }, 404);
    const entries = await deps.store.entries(contest.id);
    const s = deps.session(c);
    const view: Record<string, unknown> = publicView(contest, entries);
    if (s && lower(s.address) === lower(contest.buyer)) {
      view.mine = true;
      view.entryList = await Promise.all(
        entries.filter((e) => SHOWN.includes(e.status)).map(async (e) => ({
          id: e.id, seller: await deps.nameOf(e.seller), note: e.note, status: e.status, previewUrl: preview(contest, e), files: e.files,
        })),
      );
    } else if (s) {
      const own = entries.find((e) => lower(e.seller) === lower(s.address) && e.status !== 'replaced');
      if (own) {
        const won = contest.winners?.find((w) => w.entryId === own.id);
        view.myEntry = { id: own.id, note: own.note, status: own.status, previewUrl: preview(contest, own), files: own.files, ...(won ? { wonMicros: won.netMicros } : {}) };
      }
    }
    return c.json(view);
  });

  app.post('/:id/entries', async (c) => {
    const s = deps.session(c);
    if (!s) return c.json({ error: 'not authenticated' }, 401);
    const body = entrySchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: 'invalid body' }, 400);
    const files: EntryFile[] = [];
    for (const url of body.data.files) {
      const bytes = bytesOf(url);
      const file = bytes ? checkEntryFile(bytes) : { error: 'Entries take images (JPEG, PNG, WebP) and PDF files.' };
      if ('error' in file) return c.json({ error: file.error, code: 'BAD_FILE' }, 400);
      files.push(file);
    }
    if (body.data.heldFiles) files.push(...deps.takeHeldFiles(s.address));
    if (files.length > MAX_ENTRY_FILES) return c.json({ error: `An entry takes ${MAX_ENTRY_FILES} files at most.`, code: 'BAD_FILE' }, 400);
    let shown: Photo | undefined;
    if (body.data.preview) {
      const bytes = bytesOf(body.data.preview);
      const photo = bytes ? checkPhoto(bytes) : { error: 'The preview must be an image.' };
      if ('error' in photo) return c.json({ error: photo.error, code: 'BAD_FILE' }, 400);
      shown = photo;
    }
    const out = await deps.core.enter(s.address as Address, c.req.param('id'), { files, note: body.data.note, ...(shown ? { preview: shown } : {}) });
    if (!out.ok) {
      const r = refused(out);
      return c.json(r.body, r.status);
    }
    return c.json({ entry: { id: out.entry.id, status: out.entry.status } });
  });

  app.post('/:id/award/card', async (c) => {
    if (!deps.session(c)) return c.json({ error: 'not authenticated' }, 401);
    const body = awardSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: 'invalid body' }, 400);
    const card = await deps.core.awardCard(c.req.param('id'), body.data.entryIds);
    return card ? c.json({ card }) : c.json({ error: 'not found' }, 404);
  });

  app.post('/:id/award', async (c) => {
    const s = deps.session(c);
    if (!s) return c.json({ error: 'not authenticated' }, 401);
    const body = awardSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: 'invalid body' }, 400);
    const out = await deps.core.award(s.address as Address, c.req.param('id'), body.data.entryIds);
    if (!out.ok) {
      const r = refused(out);
      return c.json(r.body, r.status);
    }
    return c.json({ contest: publicView(out.contest, await deps.store.entries(out.contest.id)) });
  });

  app.post('/:id/cancel', async (c) => {
    const s = deps.session(c);
    if (!s) return c.json({ error: 'not authenticated' }, 401);
    const out = await deps.core.cancel(s.address as Address, c.req.param('id'));
    if (!out.ok) {
      const r = refused(out);
      return c.json(r.body, r.status);
    }
    return c.json({ contest: publicView(out.contest, []) });
  });

  // A file the viewer may not see answers as if it did not exist.
  app.get('/:id/entries/:entryId/preview', async (c) => {
    const s = deps.session(c);
    const entryId = c.req.param('entryId');
    if (!s || !(await deps.core.mayReadPreview(s.address as Address, entryId))) return c.json({ error: 'not found' }, 404);
    const photo = deps.readPreview(entryId);
    if (!photo) return c.json({ error: 'not found' }, 404);
    return c.body(Buffer.from(photo.bytes), 200, { 'content-type': photo.contentType, 'cache-control': 'private, max-age=3600' });
  });

  app.get('/:id/entries/:entryId/files/:n', async (c) => {
    const s = deps.session(c);
    const entryId = c.req.param('entryId');
    if (!s || !(await deps.core.mayReadFiles(s.address as Address, entryId))) return c.json({ error: 'not found' }, 404);
    const file = deps.readFile(entryId, Number(c.req.param('n')));
    if (!file) return c.json({ error: 'not found' }, 404);
    return c.body(Buffer.from(file.bytes), 200, { 'content-type': file.contentType, 'cache-control': 'private, no-store' });
  });

  return app;
}
