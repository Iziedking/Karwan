import { parseUnits, type Hex } from 'viem';
import { config } from '../config.js';
import { getDeal, listAllDeals, type DirectDeal } from '../db/deals.js';
import { listOffersForInvoice } from '../db/factoring.js';
import { getUserByAddress } from '../db/users.js';
import { logger } from '../logger.js';
import { testFinancierTerms, type FamilyFinancing } from '../money/familyFinancing.js';
import { familyFinancing, familyFinancingPorts } from '../money/familyFinancingLive.js';

/// The financier Karwan runs on testnet (view 18). It competes with the
/// partners: it waits about two hours after a seller asks, so they offer first,
/// then offers what the seller asked for at the owner's terms of 29 Oct 2026.

export const TEST_FINANCIER_WAIT_MS = 2 * 60 * 60 * 1000;
const SWEEP_MS = 5 * 60 * 1000;

export interface TestFinancierDeps {
  address: Hex | null;
  walletId: string | null;
  /// What the deal still owes, or null when it cannot be financed now.
  unpaid(jobId: string): Promise<bigint | null>;
  balance(address: Hex): Promise<bigint>;
  /// Whether this financier already has a live offer or line on the deal.
  offerOnDeal(jobId: string): Promise<boolean>;
  createFamilyOffer: FamilyFinancing['createFamilyOffer'];
  log(message: string): void;
}

const ask = (usdc: string | undefined) => (usdc ? parseUnits(usdc, 6) : undefined);

/// Family deals whose seller asked at least the wait ago and has not taken an offer.
export function requestsDue(deals: readonly DirectDeal[], address: string, now: number, waitMs = TEST_FINANCIER_WAIT_MS): DirectDeal[] {
  const me = address.toLowerCase();
  return deals.filter(
    (d) =>
      d.escrowVersion === 'suite' &&
      !!d.factoringRequestedAt && now - d.factoringRequestedAt >= waitMs &&
      !d.factoringOfferId && !d.settledAt && !d.cancelledAt && !d.disputed &&
      d.seller.toLowerCase() !== me,
  );
}

export async function answerRequest(deps: TestFinancierDeps, deal: DirectDeal): Promise<void> {
  if (!deps.address) return;
  if (await deps.offerOnDeal(deal.jobId)) return;
  const unpaid = await deps.unpaid(deal.jobId);
  if (!unpaid) return;
  const terms = testFinancierTerms(unpaid, {
    requested: ask(deal.factoringRequestedAdvanceUsdc),
    least: ask(deal.factoringMinAdvanceUsdc),
  });
  if (!terms) {
    deps.log(`test financier: the least the seller takes on ${deal.jobId} is above its terms`);
    return;
  }
  if ((await deps.balance(deps.address)) < terms.advance) {
    deps.log(`test financier: wallet cannot cover the ${terms.advance} micros advance on ${deal.jobId}`);
    return;
  }
  const out = await deps.createFamilyOffer({
    jobId: deal.jobId,
    financier: deps.address,
    ...terms,
    ...(deps.walletId ? { walletId: deps.walletId } : {}),
    expiresInHours: 24,
  });
  if ('code' in out) deps.log(`test financier: no offer on ${deal.jobId} (${out.code})`);
}

/// Sweeps requested deals while the API runs; off unless KARWAN_TEST_FINANCIER_ADDR is set.
export function startTestFinancier(): () => void {
  const address = (config.KARWAN_TEST_FINANCIER_ADDR?.toLowerCase() as Hex | undefined) ?? null;
  if (!address || !familyFinancing || !familyFinancingPorts) return () => {};
  const ports = familyFinancingPorts;
  const core = familyFinancing;
  // One line per deal and reason, not one every sweep.
  const said = new Set<string>();
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
    log: (message) => {
      if (said.has(message)) return;
      said.add(message);
      logger.info(message);
    },
  };
  let running = false;
  const sweep = async () => {
    if (running) return;
    running = true;
    try {
      for (const deal of requestsDue(await listAllDeals(), address, Date.now())) {
        await answerRequest(deps, deal).catch((err) =>
          logger.warn({ jobId: deal.jobId, err: (err as Error).message }, 'test financier: offer failed'),
        );
      }
    } catch (err) {
      logger.warn({ err: (err as Error).message }, 'test financier: sweep failed');
    } finally {
      running = false;
    }
  };
  logger.info({ address, waitMinutes: TEST_FINANCIER_WAIT_MS / 60_000 }, 'test financier: answering family requests');
  void sweep();
  const id = setInterval(() => void sweep(), SWEEP_MS);
  return () => clearInterval(id);
}
