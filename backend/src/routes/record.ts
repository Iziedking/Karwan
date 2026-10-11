import { Hono } from 'hono';
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
  passport: (address: string) => Promise<{ displayName: string | null; tag: string | null; tier: string; reasons: string[] }>;
  level: (address: string) => Promise<Ladder>;
  facts: (address: string) => Promise<RecordFact[]>;
  credential: (address: string) => Promise<unknown | null>;
}

/// The public record behind karwan.site/r/<tag>: who, how verified, and the
/// proof on Arc for each fact. Never a number, a phone, a document or an
/// evidence fingerprint.
export function createRecordRoutes(deps: RecordDeps): Hono {
  const app = new Hono();

  const resolve = (raw: string) => deps.addressOfTag(raw.replace(/^@/, '').toLowerCase());

  app.get('/:tag', async (c) => {
    const address = await resolve(c.req.param('tag'));
    if (!address) return c.json({ error: 'No Karwan record with that tag.' }, 404);
    const now = deps.now();
    const [passport, level, facts] = await Promise.all([deps.passport(address), deps.level(address), deps.facts(address)]);
    c.header('Cache-Control', 'public, max-age=60');
    return c.json({
      displayName: passport.displayName,
      tag: passport.tag,
      level,
      tier: passport.tier,
      reasons: passport.reasons,
      facts: facts
        .filter((f) => f.expiresAt > now)
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
