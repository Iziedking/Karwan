import { Hono, type Context } from 'hono';
import { isOwnerView } from '../sealed/passport.js';
import type { PublicRating } from '../ratings/rules.js';
import type { Ladder } from '../verification/ladder.js';

interface RecordFact {
  kind: string;
  level: string;
  issuedAt: number;
  expiresAt: number;
  txHash?: string;
}

export interface RecordDeps {
  now: () => number;
  addressOfTag: (tag: string) => Promise<string | null>;
  passport: (address: string) => Promise<{ displayName: string | null; tag: string | null; tier: string; reasons: string[]; country?: string | null; rating?: PublicRating }>;
  level: (address: string) => Promise<Ladder>;
  facts: (address: string) => Promise<RecordFact[]>;
  credential: (address: string) => Promise<unknown | null>;
  summary: (address: string) => Promise<{ score: number; counts: { completed: number; onTimeRate: number | null; disputesLost: number } }>;
  /// SEALED_RECORDS: anyone but the owner sees the counts, never the score.
  sealed: () => boolean;
  viewer: (c: Context) => string | null;
}

/// The public record behind karwan.site/r/<tag>: who, how verified, and the
/// proof on Arc for each fact, and how many deals were done and on time. The
/// record is unsealed for people (owner, 3 Nov 2026): the counts go to anyone,
/// the 0-100 score only to the owner once records are sealed. Never an amount,
/// a counterparty, a phone, a document or an evidence fingerprint.
export function createRecordRoutes(deps: RecordDeps): Hono {
  const app = new Hono();

  const resolve = (raw: string) => deps.addressOfTag(raw.replace(/^@/, '').toLowerCase());

  app.get('/:tag', async (c) => {
    const address = await resolve(c.req.param('tag'));
    if (!address) return c.json({ error: 'No Karwan record with that tag.' }, 404);
    const now = deps.now();
    const sealed = deps.sealed();
    const owner = isOwnerView(deps.viewer(c), address);
    const showScore = !sealed || owner;
    const [passport, level, facts, summary] = await Promise.all([
      deps.passport(address),
      deps.level(address),
      deps.facts(address),
      deps.summary(address),
    ]);
    const valid = facts.filter((f) => f.expiresAt > now);
    if (sealed) {
      c.header('Vary', 'Cookie');
      c.header('Cache-Control', owner ? 'private, no-store' : 'public, max-age=60');
    } else {
      c.header('Cache-Control', 'public, max-age=60');
    }
    return c.json({
      displayName: passport.displayName,
      tag: passport.tag,
      level,
      tier: passport.tier,
      reasons: passport.reasons,
      country: passport.country ?? null,
      rating: passport.rating ?? { kind: 'new', count: 0 },
      counts: summary.counts,
      ...(showScore ? { score: summary.score } : { sealed: true }),
      checks: valid.map((f) => ({ kind: f.kind, at: f.issuedAt })),
      sources: [{ id: 'karwan', status: 'connected' }],
      facts: valid
        .map((f) => ({ kind: f.kind, issuedAt: f.issuedAt, expiresAt: f.expiresAt, ...(f.txHash ? { txHash: f.txHash } : {}) })),
    });
  });

  app.get('/:tag/credential', async (c) => {
    const address = await resolve(c.req.param('tag'));
    if (!address) return c.json({ error: 'No Karwan record with that tag.' }, 404);
    const doc = await deps.credential(address);
    if (!doc) return c.json({ error: 'Signed copies are not available right now.' }, 503);
    c.header('Cache-Control', 'no-store');
    return c.json(doc);
  });

  return app;
}
