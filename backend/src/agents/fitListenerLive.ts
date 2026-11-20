import { localDay, progressStore } from '../db/agentProgress.js';
import { getAgentRecord } from '../db/agentRecords.js';
import { findAgentWalletByAgentAddress } from '../db/agentWallets.js';
import { getBrief } from '../db/briefs.js';
import { bus, type KarwanEvent } from '../events.js';
import { logger } from '../logger.js';
import { rankSellers, sellerIndex } from '../matching/sellerIndex.js';
import { requestTitle } from './bidOutcome.js';
import { fitKey } from './fitAlert.js';
import { fitAlertsOn, tellFitLive } from './fitAlertLive.js';
import { DEFAULT_BRIEF } from './mandate.js';
import { BEFORE_FIT_CHECK, passReasonOf } from './passReason.js';

/// The selling agent's moves on requests, told through the one fit path
/// (view 96): an offer it made, a pass the seller can act on, and a question
/// it asked, which counts as the request being told so nothing doubles. Runs
/// only while FIT_ALERTS is on.

async function ownerOf(agentAddress: unknown): Promise<string | null> {
  if (typeof agentAddress !== 'string') return null;
  const w = await findAgentWalletByAgentAddress(agentAddress).catch(() => null);
  return w?.userAddress?.toLowerCase() ?? null;
}

/// Whether the request matches the seller's work in words, the same reach a
/// new request uses. Some passes come before the agent checks the work.
async function fitsWork(jobId: string, owner: string): Promise<boolean> {
  const brief = getBrief(jobId);
  if (!brief) return false;
  if (!sellerIndex.isBuilt()) await sellerIndex.rebuild();
  const fits = rankSellers(sellerIndex.entries(), { jobId, keywords: brief.keywords ?? [], briefText: brief.briefText, tradeType: 'service' });
  return fits.byWords.some((s) => s.userAddress === owner);
}

export async function onSellerEvent(e: KarwanEvent): Promise<void> {
  if (!e.jobId) return;
  const jobId = e.jobId;
  const title = requestTitle(getBrief(jobId)?.briefText) ?? 'a request';
  if (e.type === 'bid.submitted') {
    const owner = await ownerOf(e.payload?.seller);
    const price = Number(e.payload?.priceUsdc);
    if (!owner || !Number.isFinite(price)) return;
    await tellFitLive({ to: owner, kind: 'request', ref: jobId, what: 'offered', facts: { title, amountUsdc: price }, jobId });
    return;
  }
  if (e.type === 'agent.skipped' || e.type === 'agent.declined') {
    const raw = typeof e.payload?.reason === 'string' ? e.payload.reason : '';
    const reason = passReasonOf(raw);
    if (!reason || e.payload?.offering === true) return;
    const owner = await ownerOf(e.payload?.seller);
    if (!owner) return;
    if (BEFORE_FIT_CHECK.has(raw) && !(await fitsWork(jobId, owner))) return;
    await tellFitLive({ to: owner, kind: 'request', ref: jobId, what: 'passed', reason, facts: { title }, jobId });
    return;
  }
  if (e.type === 'agent.suggestion' && typeof e.payload?.sellerUser === 'string') {
    // The question already told the seller; claim the request so the fit path stays quiet.
    const owner = e.payload.sellerUser.toLowerCase();
    const record = await getAgentRecord(owner).catch(() => null);
    const day = localDay(Date.now(), record?.brief?.timeZone ?? DEFAULT_BRIEF.timeZone);
    await progressStore().claim(owner, 'once', 'fit', fitKey({ kind: 'request', ref: jobId, what: 'fits' }), { day, in: 'question', what: 'fits', kind: 'request', title, jobId }, Date.now());
  }
}

export function startFitListener(): () => void {
  if (!fitAlertsOn()) return () => {};
  return bus.subscribe((e) => {
    if (e.type !== 'bid.submitted' && e.type !== 'agent.skipped' && e.type !== 'agent.declined' && e.type !== 'agent.suggestion') return;
    if (e.actor !== 'seller' && e.type !== 'agent.suggestion') return;
    void onSellerEvent(e).catch((err: Error) => logger.warn({ type: e.type, jobId: e.jobId, err: err.message }, 'fit listener failed'));
  });
}
