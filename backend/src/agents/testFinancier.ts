import type { Hex } from 'viem';
import { config } from '../config.js';
import { getDeal } from '../db/deals.js';
import { listOffersForInvoice } from '../db/factoring.js';
import { getUserByAddress } from '../db/users.js';
import { bus } from '../events.js';
import { logger } from '../logger.js';
import { testFinancierTerms, type FamilyFinancing } from '../money/familyFinancing.js';
import { familyFinancing, familyFinancingPorts } from '../money/familyFinancingLive.js';

/// The financier Karwan runs on testnet (view 18): every family deal that asks
/// to be paid early gets one offer from it, at the owner's terms of 29 Oct 2026.

export interface TestFinancierDeps {
  address: Hex | null;
  walletId: string | null;
  unpaid(jobId: string): Promise<bigint | null>;
  balance(address: Hex): Promise<bigint>;
  /// Whether this financier already has a live offer or line on the deal.
  offerOnDeal(jobId: string): Promise<boolean>;
  createFamilyOffer: FamilyFinancing['createFamilyOffer'];
  log(message: string): void;
}

type RequestEvent = { type: string; jobId?: string; payload?: Record<string, unknown> };

export async function handleFamilyRequest(deps: TestFinancierDeps, e: RequestEvent): Promise<void> {
  if (!deps.address || e.type !== 'factoring.requested' || e.payload?.rail !== 'family' || !e.jobId) return;
  if (String(e.payload.seller ?? '').toLowerCase() === deps.address.toLowerCase()) return;
  if (await deps.offerOnDeal(e.jobId)) return;
  const unpaid = await deps.unpaid(e.jobId);
  if (!unpaid) return;
  const terms = testFinancierTerms(unpaid);
  if ((await deps.balance(deps.address)) < terms.advance) {
    deps.log(`test financier: wallet cannot cover the ${terms.advance} micros advance on ${e.jobId}`);
    return;
  }
  const out = await deps.createFamilyOffer({
    jobId: e.jobId,
    financier: deps.address,
    ...terms,
    ...(deps.walletId ? { walletId: deps.walletId } : {}),
    expiresInHours: 24,
  });
  if ('code' in out) deps.log(`test financier: no offer on ${e.jobId} (${out.code})`);
}

/// Answers family requests while the API runs; off unless KARWAN_TEST_FINANCIER_ADDR is set.
export function startTestFinancier(): () => void {
  const address = (config.KARWAN_TEST_FINANCIER_ADDR?.toLowerCase() as Hex | undefined) ?? null;
  if (!address || !familyFinancing || !familyFinancingPorts) return () => {};
  const ports = familyFinancingPorts;
  const core = familyFinancing;
  const inFlight = new Set<string>();
  const deps: TestFinancierDeps = {
    address,
    walletId: getUserByAddress(address)?.circleIdentityWalletId ?? null,
    unpaid: async (jobId) => {
      const deal = await getDeal(jobId);
      if (!deal?.escrowDealId) return null;
      const r = await ports.receivable(deal.escrowDealId as Hex);
      return r.financeable ? r.unpaid : null;
    },
    balance: ports.balance,
    offerOnDeal: async (jobId) =>
      (await listOffersForInvoice(jobId)).some(
        (o) => o.financier === address && ['offered', 'awaiting_financier', 'accepted'].includes(o.status),
      ),
    createFamilyOffer: core.createFamilyOffer,
    log: (message) => logger.info(message),
  };
  logger.info({ address }, 'test financier: answering family requests');
  return bus.subscribe((e) => {
    if (!e.jobId || inFlight.has(e.jobId)) return;
    inFlight.add(e.jobId);
    void handleFamilyRequest(deps, e)
      .catch((err) => logger.warn({ jobId: e.jobId, err: (err as Error).message }, 'test financier: offer failed'))
      .finally(() => inFlight.delete(e.jobId!));
  });
}
