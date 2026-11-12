import { getProfile } from '../db/profiles.js';
import { onMoneyMovementCompleted, updateMoneyMovement } from '../db/moneyMovements.js';
import { readSharedRates } from '../rates/sharedRate.js';
import { logger } from '../logger.js';
import type { MoneyMovement } from './model.js';
import { parseUnits } from 'viem';
import { onDealSettled, patchDeal, type DirectDeal } from '../db/deals.js';
import { keepActivityWorthWith } from '../db/activityLog.js';
import { activityWorth, worthToPeople, worthWhenPaid, type WorthDeps } from './worth.js';

/// Keeps what a payment was worth to each side when it completed (view 77).
/// It runs after the movement is saved as completed and never holds the money
/// up: if it fails, the payment stands and reads at the shared rate.

const live: WorthDeps = {
  currencyOf: async (address) => (await getProfile(address))?.settings?.displayCurrency,
  rates: readSharedRates,
  now: Date.now,
};

/// A deal that just settled keeps what its amount was worth to the buyer and
/// the seller, so the finished deal reads the same from then on.
export async function keepDealWorth(deal: DirectDeal): Promise<void> {
  if (deal.settledWorth) return;
  const worth = await worthToPeople(parseUnits(deal.dealAmountUsdc, 6), [deal.buyer, deal.seller].filter(Boolean), live);
  if (Object.keys(worth).length === 0) return;
  await patchDeal(deal.jobId, { settledWorth: worth }, { keepUpdatedAt: true });
}

export async function keepWorth(movement: MoneyMovement): Promise<void> {
  if (movement.worth) return;
  const worth = await worthWhenPaid(movement, live);
  if (Object.keys(worth).length === 0) return;
  await updateMoneyMovement(movement.reference, (current) => (current.worth ? current : { ...current, worth, version: current.version + 1 }));
}

export function startKeepingWorth(): void {
  keepActivityWorthWith((entry) => activityWorth(entry, live));
  onDealSettled((deal) => {
    void keepDealWorth(deal).catch((err: unknown) => {
      logger.warn({ jobId: deal.jobId, err: err instanceof Error ? err.message : String(err) }, 'worth when settled was not kept; the deal reads at the shared rate');
    });
  });
  onMoneyMovementCompleted((movement) => {
    void keepWorth(movement).catch((err: unknown) => {
      logger.warn({ reference: movement.reference, err: err instanceof Error ? err.message : String(err) }, 'worth when paid was not kept; the payment reads at the shared rate');
    });
  });
}
