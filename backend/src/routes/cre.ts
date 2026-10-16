import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { bearerTokenMatches } from '../evidence/creDeliveryRequest.js';
import { keccak256, toBytes, toHex, type Hex } from 'viem';
import { canonicalJson, fingerprint } from '../cre/shared/canonical.js';
import type { CreStore } from '../cre/store.js';
import type { VerifyResult } from '../cre/reportVerify.js';

/// The CRE workflows' side of Karwan: an index that says where to look and
/// documents by fingerprint. Every route needs the workflow token. A result
/// claimed as attested must be on Arc; alerts and dry runs must be signed by
/// the DON. Nothing here can make a workflow write a result it did not reach.
export interface CreRouteDeps {
  store: CreStore;
  token: string | undefined;
  now(): number;
  checkApprovedOnChain(input: { family: string; dealId: string; revision: number; evidenceHash: string; pass: boolean }): Promise<boolean>;
  verifyReport(report: { rawReport: string; context: string; signatures: string[] }): Promise<VerifyResult>;
  notify(alerts: unknown[]): Promise<void>;
  /// Workflow ids allowed to sign each kind of post: dry runs come from
  /// karwan-check, alerts from karwan-risk.
  workflows: { check: string[]; risk: string[] };
}

const hex32 = z.string().regex(/^0x[0-9a-fA-F]{64}$/);
const address = z.string().regex(/^0x[0-9a-fA-F]{40}$/);
const limitOf = (c: Context, max: number) => Math.max(1, Math.min(max, Number(c.req.query('limit') ?? max) || max));
const cursorOf = (c: Context) => Math.max(0, Math.floor(Number(c.req.query('cursor') ?? 0) || 0));
const sameId = (a: string, b: string) => a.replace(/^0x/, '').toLowerCase() === b.replace(/^0x/, '').toLowerCase();

const startedSchema = z.object({
  kind: z.enum(['deal', 'dry']),
  dealKey: z.string().min(1).max(200),
  family: address,
  dealId: hex32,
  revision: z.number().int().min(0),
  deliveredBlockHash: hex32.nullable(),
  deliveredBlockNumber: z.number().int().min(0).nullable().default(null),
  policyHash: hex32,
  referenceHash: hex32.optional(),
  reference: z.unknown().optional(),
});

const evidenceSchema = z.object({
  dealKey: z.string().min(1).max(200),
  family: address,
  dealId: hex32,
  revision: z.number().int().min(0),
  decision: z.enum(['PASS', 'FAIL', 'UNAVAILABLE']),
  reason: z.string().max(64),
  doc: z.unknown().nullable(),
  evidenceHash: hex32.nullable(),
  attested: z.boolean(),
});

const reportSchema = z.object({ rawReport: z.string(), context: z.string(), signatures: z.array(z.string()).max(64) });

export function createCreRoutes(deps: CreRouteDeps) {
  const app = new Hono();

  app.use('*', async (c, next) => {
    c.header('Cache-Control', 'no-store');
    if (!deps.token) return c.json({ error: 'CRE bridge is not configured', code: 'CRE_BRIDGE_DISABLED' }, 503);
    if (!bearerTokenMatches(c.req.header('authorization'), deps.token)) return c.json({ error: 'invalid CRE credentials' }, 401);
    await next();
  });

  app.get('/doc/:hash', async (c) => {
    const doc = await deps.store.getDocument(c.req.param('hash'));
    return doc ? c.json(doc) : c.json({ error: 'unknown document' }, 404);
  });

  app.post('/check/started', async (c) => {
    const parsed = startedSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'bad request' }, 400);
    const s = parsed.data;
    let referenceHash = s.referenceHash ?? null;
    if (s.reference !== undefined) {
      try {
        referenceHash = await deps.store.putDocument('reference', s.reference);
      } catch {
        return c.json({ error: 'bad reference' }, 400);
      }
    }
    await deps.store.upsertCheckItem({
      dealKey: s.dealKey, kind: s.kind, family: s.family, dealId: s.dealId, revision: s.revision,
      deliveredBlockHash: s.deliveredBlockHash, deliveredBlockNumber: s.deliveredBlockNumber, policyHash: s.policyHash, referenceHash,
    }, deps.now());
    return c.json({ ok: true });
  });

  app.get('/check/pending', async (c) => {
    const items = await deps.store.pendingCheckItems(limitOf(c, 3), deps.now(), cursorOf(c));
    const out = [];
    for (const i of items) {
      const policy = await deps.store.getDocument(i.policyHash);
      const reference = i.referenceHash ? await deps.store.getDocument(i.referenceHash) : null;
      if (!policy || !reference) continue;
      out.push({
        kind: i.kind, dealKey: i.dealKey, family: i.family, dealId: i.dealId, revision: i.revision,
        deliveredBlockHash: i.deliveredBlockHash, deliveredBlockNumber: i.deliveredBlockNumber, policy: policy.body, reference: reference.body,
      });
    }
    return c.json({ items: out });
  });

  app.post('/check/close', async (c) => {
    const body = z.object({ dealKey: z.string().min(1).max(200), outcome: z.string().max(64) }).safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: 'bad request' }, 400);
    await deps.store.closeCheckItem(body.data.dealKey, { closed: body.data.outcome }, deps.now());
    return c.json({ ok: true });
  });

  app.post('/check/evidence', async (c) => {
    const parsed = evidenceSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'bad request' }, 400);
    const e = parsed.data;
    if (e.doc !== null) {
      if (e.evidenceHash === null || fingerprint(e.doc) !== e.evidenceHash.toLowerCase()) return c.json({ error: 'evidence does not match its hash' }, 400);
    }
    if (e.attested) {
      if (!e.evidenceHash) return c.json({ error: 'an attested result needs its evidence' }, 400);
      if (e.decision === 'UNAVAILABLE') return c.json({ error: 'no result cannot be attested' }, 400);
      const onChain = await deps.checkApprovedOnChain({ family: e.family, dealId: e.dealId, revision: e.revision, evidenceHash: e.evidenceHash, pass: e.decision === 'PASS' });
      if (!onChain) return c.json({ error: 'no matching CheckApproved on Arc' }, 409);
    }
    if (e.doc !== null) {
      try {
        await deps.store.putDocument('evidence', e.doc);
      } catch {
        return c.json({ error: 'bad evidence document' }, 400);
      }
    }
    if (!e.attested && e.decision !== 'UNAVAILABLE') {
      await deps.store.recordShadow({
        dealKey: e.dealKey, revision: e.revision, family: e.family, creVerdict: e.decision, karwanVerdict: null, evidenceHash: e.evidenceHash,
      }, deps.now());
    }
    await deps.store.closeCheckItem(e.dealKey, { decision: e.decision, reason: e.reason, attested: e.attested, evidenceHash: e.evidenceHash }, deps.now());
    return c.json({ ok: true });
  });

  /// A DON-signed post is acted on only when the report was signed by the
  /// right workflow over exactly the payload sent beside it, and only once.
  async function signedPost(c: Context, report: z.infer<typeof reportSchema>, signedBody: unknown, allowed: string[]) {
    const verified = await deps.verifyReport(report);
    if (!verified.ok) return c.json({ error: 'report not signed by the DON', code: verified.reason }, 401);
    if (!allowed.some((w) => sameId(w, verified.workflowId))) return c.json({ error: 'report from another workflow' }, 401);
    if (verified.body.toLowerCase() !== toHex(toBytes(canonicalJson(signedBody))).toLowerCase()) {
      return c.json({ error: 'payload is not what the DON signed' }, 400);
    }
    if (!(await deps.store.markReport(keccak256(report.rawReport.startsWith('0x') ? (report.rawReport as Hex) : toHex(toBytes(report.rawReport))), deps.now()))) {
      return c.json({ error: 'report already used' }, 409);
    }
    return null;
  }

  app.post('/risk/alerts', async (c) => {
    const body = z.object({ alerts: z.array(z.unknown()).max(50), report: reportSchema }).safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: 'bad request' }, 400);
    const refused = await signedPost(c, body.data.report, { alerts: body.data.alerts }, deps.workflows.risk);
    if (refused) return refused;
    await deps.notify(body.data.alerts);
    return c.json({ ok: true });
  });

  app.post('/dry-run/result', async (c) => {
    const body = z.object({
      payload: z.object({ dealKey: z.string().regex(/^dry-[0-9a-f]{64}$/) }).passthrough(),
      report: reportSchema,
    }).safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: 'bad request' }, 400);
    const refused = await signedPost(c, body.data.report, body.data.payload, deps.workflows.check);
    if (refused) return refused;
    await deps.store.putDryRun(`0x${body.data.payload.dealKey.slice(4)}`, { payload: body.data.payload, report: body.data.report }, deps.now());
    return c.json({ ok: true });
  });

  app.get('/risk/open-deals', async (c) => c.json({ items: await deps.store.watched(limitOf(c, 3), cursorOf(c)) }));

  return app;
}
