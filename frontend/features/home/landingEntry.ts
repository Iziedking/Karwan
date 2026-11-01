import { dealHref } from '@/shared/utils/routes';
import { tradeEntryRoutes } from './tradeEntry';

// Public links name the network they lead to; internal task routes stay local.
export function landingEntryRoutes(dealsAvailable: boolean) {
  const market = dealHref('/market', dealsAvailable);
  const agreement = dealHref(tradeEntryRoutes().agreement, dealsAvailable);
  return { market, agreement, primary: dealsAvailable ? market : '/waitlist', secondary: dealsAvailable ? agreement : market };
}
