import { Hono, type Context } from 'hono';
import { verifyDealRecord } from '../attestation/dealRecordProof.js';
import { viewerAddress } from '../auth/session.js';
import { getDealRecord, makeShare, recordByToken, revokeShare, shareFor, type Side } from '../db/dealRecords.js';
import { getDeal } from '../db/deals.js';
import { getProfile } from '../db/profiles.js';
import { rateLimit } from '../middleware/rateLimit.js';

/// Your deal record (view 94). The two sides read it and the signature; either
/// side shares it by a link it can take back. Someone who is not a side, or a
/// deal with no record yet, gets the same 404, so a deal's existence does not
/// leak to strangers.

export const dealRecordRoutes = new Hono();

const notFound = (c: Context) => c.json({ error: 'No deal record here.', code: 'not_found' }, 404);

async function sideOf(c: Context): Promise<{ jobId: string; side: Side } | null> {
  const viewer = viewerAddress(c)?.toLowerCase();
  if (!viewer) return null;
  const deal = await getDeal(c.req.param('jobId') ?? '');
  if (!deal) return null;
  const side: Side | null = viewer === deal.buyer?.toLowerCase() ? 'buyer' : viewer === deal.seller?.toLowerCase() ? 'seller' : null;
  return side ? { jobId: deal.jobId, side } : null;
}

dealRecordRoutes.get('/:jobId/record', async (c) => {
  c.header('Cache-Control', 'no-store');
  const who = await sideOf(c);
  if (!who) return notFound(c);
  const stored = await getDealRecord(who.jobId);
  if (!stored) return notFound(c);
  return c.json({ side: who.side, record: stored.record, digest: stored.digest, writtenAt: stored.writtenAt, proof: stored.proof, share: await shareFor(who.jobId, who.side) });
});

dealRecordRoutes.post('/:jobId/record/share', async (c) => {
  c.header('Cache-Control', 'no-store');
  const who = await sideOf(c);
  if (!who || !(await getDealRecord(who.jobId))) return notFound(c);
  return c.json({ token: await makeShare(who.jobId, who.side) });
});

dealRecordRoutes.delete('/:jobId/record/share', async (c) => {
  c.header('Cache-Control', 'no-store');
  const who = await sideOf(c);
  if (!who) return notFound(c);
  return c.json({ stopped: await revokeShare(who.jobId, who.side) });
});

/// The shared copy, for anyone with a live link. People by name and Karwan
/// tag, never by address; the deal id stays out too. Transactions stay in, so
/// the reader can check the money moved. Whether Karwan's signature still holds
/// is checked here, because a reader without the addresses cannot check it.
export const sharedDealRecordRoutes = new Hono();

async function person(address: string): Promise<{ name: string | null; tag: string | null }> {
  const profile = await getProfile(address).catch(() => null);
  return { name: profile?.displayName?.trim() || null, tag: profile?.handle ?? null };
}

sharedDealRecordRoutes.get('/shared/:token', rateLimit({ windowMs: 60_000, max: 60, name: 'deal-record-shared' }), async (c) => {
  c.header('Cache-Control', 'no-store');
  const found = await recordByToken(c.req.param('token') ?? '');
  if (!found) return notFound(c);
  const { stored, side } = found;
  const { buyer, seller, jobId: _jobId, ...record } = stored.record;
  return c.json({
    sharedBy: side,
    buyer: await person(buyer),
    seller: await person(seller),
    record,
    writtenAt: stored.writtenAt,
    signedByKarwan: await verifyDealRecord(stored.record, stored.writtenAt, stored.proof),
  });
});
