import { bus } from '../events.js';
import { listDealsForAddress } from '../db/deals.js';
import { getBrief } from '../db/briefs.js';
import { isRequestOwner } from '../agents/chooseOffer.js';
import { personalFeed } from '../routes/activity.js';
import { pickMoment, type Moment, type MomentContext } from './moments.js';

/// The newest moment on this person's own feed since the last one they were
/// shown (view 57, 15 Nov evening). `since` is `settings.guideMomentAt`.
export async function readMoment(address: string, since: number, now = Date.now()): Promise<Moment | null> {
  await bus.ensureHydrated();
  const [events, deals] = await Promise.all([personalFeed(address, bus.recent(500)), listDealsForAddress(address)]);
  const me = address.toLowerCase();
  const byJob = new Map(deals.map((d) => [d.jobId.toLowerCase(), d]));
  const candidates = events.map((event) => {
    const d = event.jobId ? byJob.get(event.jobId.toLowerCase()) : undefined;
    const role: MomentContext['role'] = d ? (d.buyer.toLowerCase() === me ? 'buyer' : d.seller?.toLowerCase() === me ? 'seller' : null) : null;
    const brief = event.type === 'offer.withdrawn' && event.jobId ? getBrief(event.jobId) : undefined;
    const ctx: MomentContext = {
      me,
      role,
      ...(brief ? { ownsRequest: isRequestOwner(address, brief) } : {}),
      ...(d ? { deal: { guaranteeBackedAt: d.guaranteeBackedAt, resolvedSellerBps: d.resolvedSellerBps } } : {}),
    };
    return { event, ctx };
  });
  return pickMoment(candidates, since, now);
}
