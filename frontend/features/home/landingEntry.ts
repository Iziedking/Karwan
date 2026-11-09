import { dealHref } from '@/shared/utils/routes';
import { tradeEntryRoutes } from './tradeEntry';

// Public links name the network they lead to; internal task routes stay local.
export function landingEntryRoutes(dealsAvailable: boolean) {
  const market = dealHref('/market', dealsAvailable);
  const agreement = dealHref(tradeEntryRoutes().agreement, dealsAvailable);
  // Open Karwan lands on Home, not the market (owner, 9 Nov 2026).
  const home = dealHref('/app', dealsAvailable);
  return { market, agreement, home, primary: dealsAvailable ? home : '/waitlist', secondary: dealsAvailable ? agreement : market };
}
